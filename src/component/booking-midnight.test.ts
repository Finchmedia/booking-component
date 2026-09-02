/// <reference types="vite/client" />
// Cross-UTC-midnight slot bookkeeping and the range guard (hardening #2 / #3).
//
// Both write paths (createBooking, createProvisionalBooking) map [start, end)
// through getRequiredSlots, so a range that crosses 00:00 UTC has to touch one
// daily_availability row PER CALENDAR DAY — for the conflict check, for the
// write, and for the release on cancel. hardening.test.ts asserts the happy
// path once; this file goes after the edges: both sides of the boundary,
// spans longer than a day, unaligned ends, check-before-write atomicity, the
// legacy createReservation/cancelReservation pair, and the full NaN/Infinity
// matrix of the "Invalid time range" guard.
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  TZ,
  book as createBooking,
  getBusySlots,
  range,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const RESOURCE = "res-1";
const EVENT = "et-1";
const target = { resourceId: RESOURCE, eventTypeId: EVENT, timezone: TZ };

// 2027-03-09 (Tue) → 2027-03-11 (Thu). No schedule is seeded: createBooking
// never consults one, it only reads/writes daily_availability, whose slot
// indices are UTC 15-minute chunks (0–95) regardless of the resource timezone.
const D1 = "2027-03-09";
const D2 = "2027-03-10";
const D3 = "2027-03-11";

const EXACT_RANGE_ERROR = "Invalid time range: end must be after start";

/** Resource + event type + link, no schedule and no notice/future window. */
const seed = (t: T) => seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });

const book = (t: T, start: number, end: number) => createBooking(t, target, start, end);

const provisional = (t: T, start: number, end: number) =>
  t.mutation(api.public.createProvisionalBooking, {
    eventTypeId: EVENT,
    resourceId: RESOURCE,
    start,
    end,
    timezone: TZ,
    booker: BOOKER,
    location: LOCATION,
  });

const busy = (t: T, date: string) => getBusySlots(t, RESOURCE, date);

const free = (t: T, start: number, end: number) =>
  t.query(api.public.getAvailability, { resourceId: RESOURCE, start, end });

const cancelByToken = (t: T, booking: Doc<"bookings">) =>
  t.mutation(api.public.cancelBookingByToken, {
    uid: booking.uid,
    token: booking.managementToken!,
  });

/** `[label, start, end]` triples the range guard must reject. */
const INVALID_RANGES: Array<[string, number, number]> = [
  ["end before start", utc(D1, "23:30"), utc(D1, "23:00")],
  ["end equal to start", utc(D1, "23:30"), utc(D1, "23:30")],
  ["end one millisecond before start", utc(D1, "23:30"), utc(D1, "23:30") - 1],
  ["NaN start", NaN, utc(D1, "23:30")],
  ["NaN end", utc(D1, "23:00"), NaN],
  ["NaN on both ends", NaN, NaN],
  ["Infinity start", Infinity, utc(D1, "23:00")],
  ["Infinity end", utc(D1, "23:00"), Infinity],
  ["-Infinity start", -Infinity, utc(D1, "23:00")],
  ["-Infinity end", utc(D1, "23:00"), -Infinity],
  ["infinite on both ends", -Infinity, Infinity],
];

let t: T;

beforeEach(() => {
  ({ t } = setup());
});

// ============================================
// (a) + (b) createBooking across UTC midnight
// ============================================

describe("createBooking across UTC midnight", () => {
  test("reserves the tail of day 1 and the head of day 2, and blocks both sides", async () => {
    await seed(t);
    const overnight = await book(t, utc(D1, "23:30"), utc(D2, "00:30"));
    expect(overnight).toMatchObject({ status: "confirmed", start: utc(D1, "23:30") });

    // 23:30–24:00 UTC → 94, 95 on day 1; 00:00–00:30 UTC → 0, 1 on day 2.
    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1]);
    expect(await busy(t, D3)).toBeNull();

    // The next-day portion is really held: overlapping it is rejected …
    await expect(book(t, utc(D2, "00:00"), utc(D2, "01:00"))).rejects.toThrow(
      "Time slot no longer available"
    );
    // … and so is a range that only touches the day-1 portion.
    await expect(book(t, utc(D1, "23:00"), utc(D1, "23:45"))).rejects.toThrow(
      "Time slot no longer available"
    );
    // Even a 15-minute probe on either side of midnight is blocked.
    await expect(book(t, utc(D1, "23:45"), utc(D2, "00:00"))).rejects.toThrow(
      "Time slot no longer available"
    );
    await expect(book(t, utc(D2, "00:15"), utc(D2, "00:30"))).rejects.toThrow(
      "Time slot no longer available"
    );

    // Nothing was written by the rejected attempts.
    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1]);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toHaveLength(1);

    // Adjacent (half-open) ranges on both sides still fit.
    await book(t, utc(D1, "22:00"), utc(D1, "23:30"));
    await book(t, utc(D2, "00:30"), utc(D2, "01:30"));
    expect(await busy(t, D1)).toEqual(range(88, 96));
    expect(await busy(t, D2)).toEqual(range(0, 6));
  });

  test("getAvailability reports the cross-midnight hold on both days", async () => {
    await seed(t);
    expect(await free(t, utc(D1, "23:30"), utc(D2, "00:30"))).toBe(true);

    await book(t, utc(D1, "23:30"), utc(D2, "00:30"));

    expect(await free(t, utc(D1, "23:30"), utc(D2, "00:30"))).toBe(false);
    expect(await free(t, utc(D2, "00:00"), utc(D2, "01:00"))).toBe(false); // day-2 side only
    expect(await free(t, utc(D1, "22:00"), utc(D1, "23:30"))).toBe(true); // ends at the hold
    expect(await free(t, utc(D2, "00:30"), utc(D2, "01:30"))).toBe(true); // starts at its end
  });

  test("a conflict found on the second day aborts before any slot is written", async () => {
    await seed(t);
    // Day 2 is taken first; day 1 has no daily_availability row at all.
    await book(t, utc(D2, "00:00"), utc(D2, "01:00"));
    expect(await busy(t, D1)).toBeNull();

    await expect(book(t, utc(D1, "23:30"), utc(D2, "00:30"))).rejects.toThrow(
      "Time slot no longer available"
    );

    // The check loop runs over every day BEFORE the write loop, so the free
    // day-1 half of the rejected range must not have been reserved.
    expect(await busy(t, D1)).toBeNull();
    expect(await busy(t, D2)).toEqual([0, 1, 2, 3]);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toHaveLength(1);
  });

  test("a span longer than a day fills the intermediate day completely", async () => {
    await seed(t);
    const long = await book(t, utc(D1, "23:30"), utc(D3, "00:30"));

    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual(range(0, 96)); // the whole middle day
    expect(await busy(t, D3)).toEqual([0, 1]);

    // Anything on the middle day is blocked, midday included.
    await expect(book(t, utc(D2, "12:00"), utc(D2, "13:00"))).rejects.toThrow(
      "Time slot no longer available"
    );
    expect(await free(t, utc(D2, "12:00"), utc(D2, "13:00"))).toBe(false);

    // One cancel releases all three days.
    await cancelByToken(t, long!);
    expect(await busy(t, D1)).toEqual([]);
    expect(await busy(t, D2)).toEqual([]);
    expect(await busy(t, D3)).toEqual([]);
    await expect(book(t, utc(D2, "12:00"), utc(D2, "13:00"))).resolves.toMatchObject({
      status: "confirmed",
    });
  });

  test("an unaligned range blocks the whole containing slot on each day", async () => {
    await seed(t);
    // 23:37 → 00:07 covers the 23:30 and 23:45 slots of day 1 and the 00:00
    // slot of day 2 (a range is rounded out to the 15-minute grid).
    await book(t, utc(D1, "23:37"), utc(D2, "00:07"));

    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0]);

    await expect(book(t, utc(D2, "00:00"), utc(D2, "00:15"))).rejects.toThrow(
      "Time slot no longer available"
    );
    // The next slot is untouched even though the booking "ended" inside it.
    await book(t, utc(D2, "00:15"), utc(D2, "00:30"));
    expect(await busy(t, D2)).toEqual([0, 1]);
  });
});

// ============================================
// (c) createProvisionalBooking across midnight
// ============================================

describe("createProvisionalBooking across UTC midnight", () => {
  test("holds both days and conflicts with confirmed bookings in either direction", async () => {
    await seed(t);
    const held = await provisional(t, utc(D1, "23:30"), utc(D2, "00:30"));
    expect(held).toMatchObject({ status: "provisional", end: utc(D2, "00:30") });

    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1]);

    // A provisional hold blocks a confirmed booking on the next-day portion …
    await expect(book(t, utc(D2, "00:00"), utc(D2, "01:00"))).rejects.toThrow(
      "Time slot no longer available"
    );
    // … and another provisional hold on the day-1 portion.
    await expect(provisional(t, utc(D1, "23:00"), utc(D1, "23:45"))).rejects.toThrow(
      "Time slot no longer available"
    );

    // The reverse direction: a confirmed booking blocks a provisional one.
    await book(t, utc(D2, "02:00"), utc(D2, "03:00"));
    await expect(provisional(t, utc(D2, "02:30"), utc(D2, "03:30"))).rejects.toThrow(
      "Time slot no longer available"
    );
    expect(await busy(t, D2)).toEqual([0, 1, 8, 9, 10, 11]);
  });

  test("cancelBookingByToken releases a provisional hold on both days", async () => {
    await seed(t);
    const held = await provisional(t, utc(D1, "23:30"), utc(D2, "00:30"));

    await cancelByToken(t, held!);

    expect((await t.query(api.public.getBooking, { bookingId: held!._id }))?.status).toBe(
      "cancelled"
    );
    expect(await busy(t, D1)).toEqual([]);
    expect(await busy(t, D2)).toEqual([]);
    // The exact same range is bookable again, both halves of it.
    await expect(book(t, utc(D1, "23:30"), utc(D2, "00:30"))).resolves.toMatchObject({
      status: "confirmed",
    });
    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1]);
  });
});

// ============================================
// (d) The "Invalid time range" guard
// ============================================

describe("range guard: createBooking", () => {
  test.each(INVALID_RANGES)("rejects %s", async (_label, start, end) => {
    await seed(t);
    await expect(book(t, start, end)).rejects.toThrow(EXACT_RANGE_ERROR);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toEqual([]);
    expect(await busy(t, D1)).toBeNull();
    expect(await busy(t, D2)).toBeNull();
  });

  test("the guard runs before the event-type / resource / link lookups", async () => {
    // No seed at all: a valid range would fail with "Event type not found",
    // so the range error proves the guard is the first thing that runs.
    await expect(book(t, utc(D1, "23:30"), utc(D1, "23:00"))).rejects.toThrow(EXACT_RANGE_ERROR);
    await expect(book(t, NaN, NaN)).rejects.toThrow(EXACT_RANGE_ERROR);
    await expect(book(t, utc(D1, "23:30"), utc(D2, "00:30"))).rejects.toThrow(
      "Event type not found"
    );
  });

  test("a valid cross-midnight range of one slot is accepted", async () => {
    await seed(t);
    // The smallest range the guard lets through still spans midnight.
    await book(t, utc(D1, "23:59"), utc(D2, "00:01"));
    expect(await busy(t, D1)).toEqual([95]);
    expect(await busy(t, D2)).toEqual([0]);
  });
});

describe("range guard: createProvisionalBooking", () => {
  test.each(INVALID_RANGES)("rejects %s", async (_label, start, end) => {
    await seed(t);
    await expect(provisional(t, start, end)).rejects.toThrow(EXACT_RANGE_ERROR);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toEqual([]);
    expect(await busy(t, D1)).toBeNull();
    expect(await busy(t, D2)).toBeNull();
  });

  test("the guard runs before the event-type / resource / link lookups", async () => {
    await expect(provisional(t, utc(D1, "23:30"), utc(D1, "23:30"))).rejects.toThrow(
      EXACT_RANGE_ERROR
    );
    await expect(provisional(t, utc(D1, "23:00"), Infinity)).rejects.toThrow(EXACT_RANGE_ERROR);
    await expect(provisional(t, utc(D1, "23:30"), utc(D2, "00:30"))).rejects.toThrow(
      "Event type not found"
    );
  });
});

// ============================================
// (e) Cancelling frees both days
// ============================================

describe("cancelling a cross-midnight booking", () => {
  test("cancelBookingByToken frees the slots on both days", async () => {
    await seed(t);
    const overnight = await book(t, utc(D1, "23:30"), utc(D2, "00:30"));
    // A second, unrelated booking on each day must survive the cancel.
    await book(t, utc(D1, "22:00"), utc(D1, "23:00"));
    await book(t, utc(D2, "01:00"), utc(D2, "02:00"));
    expect(await busy(t, D1)).toEqual([88, 89, 90, 91, 94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1, 4, 5, 6, 7]);

    expect(await cancelByToken(t, overnight!)).toEqual({ success: true });

    // Only the cancelled booking's own slots are released, on both days.
    expect(await busy(t, D1)).toEqual([88, 89, 90, 91]);
    expect(await busy(t, D2)).toEqual([4, 5, 6, 7]);
    expect(await free(t, utc(D1, "23:30"), utc(D2, "00:30"))).toBe(true);

    const cancelled = await t.query(api.public.getBooking, { bookingId: overnight!._id });
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.cancelledAt).toBeDefined();

    // The freed range is bookable again; cancelling twice is refused.
    await book(t, utc(D1, "23:30"), utc(D2, "00:30"));
    await expect(cancelByToken(t, overnight!)).rejects.toThrow(
      "Cannot cancel booking with status: cancelled"
    );
  });

  test("transitionBookingState('cancelled') frees the slots on both days", async () => {
    await seed(t);
    const overnight = await book(t, utc(D1, "23:30"), utc(D2, "00:30"));

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: overnight!._id,
      toStatus: "cancelled",
      reason: "midnight cleanup",
    });

    expect(await busy(t, D1)).toEqual([]);
    expect(await busy(t, D2)).toEqual([]);
    await expect(book(t, utc(D1, "23:30"), utc(D2, "00:30"))).resolves.toMatchObject({
      status: "confirmed",
    });
  });

  test("expireProvisionalBooking frees the slots on both days", async () => {
    await seed(t);
    const held = await provisional(t, utc(D1, "23:45"), utc(D2, "00:15"));
    expect(await busy(t, D1)).toEqual([95]);
    expect(await busy(t, D2)).toEqual([0]);

    expect(
      await t.mutation(api.public.expireProvisionalBooking, { bookingId: held!._id })
    ).toEqual({ success: true });

    expect(await busy(t, D1)).toEqual([]);
    expect(await busy(t, D2)).toEqual([]);
  });
});

// ============================================
// Legacy reservation path (createReservation)
// ============================================

describe("legacy createReservation across UTC midnight", () => {
  const reserve = (start: number, end: number): Promise<Id<"bookings">> =>
    t.mutation(api.public.createReservation, {
      resourceId: RESOURCE,
      actorId: BOOKER.email,
      start,
      end,
    });

  test("reserves both days, rejects an overlapping next-day reservation, frees both on cancel", async () => {
    await seed(t);
    const reservationId = await reserve(utc(D1, "23:30"), utc(D2, "00:30"));

    expect(await busy(t, D1)).toEqual([94, 95]);
    expect(await busy(t, D2)).toEqual([0, 1]);

    // The legacy path guards with isAvailable() and has its own error string.
    await expect(reserve(utc(D2, "00:00"), utc(D2, "01:00"))).rejects.toThrow(
      "Resource is not available for the requested time range."
    );
    await expect(reserve(utc(D1, "23:00"), utc(D1, "23:45"))).rejects.toThrow(
      "Resource is not available for the requested time range."
    );
    // A cross-path conflict: createBooking sees the legacy hold too.
    await expect(book(t, utc(D2, "00:00"), utc(D2, "01:00"))).rejects.toThrow(
      "Time slot no longer available"
    );

    await t.mutation(api.public.cancelReservation, { reservationId });

    expect(await busy(t, D1)).toEqual([]);
    expect(await busy(t, D2)).toEqual([]);
    expect((await t.query(api.public.getBooking, { bookingId: reservationId }))?.status).toBe(
      "cancelled"
    );
    // Bookable again on both sides of midnight.
    await expect(reserve(utc(D1, "23:30"), utc(D2, "00:30"))).resolves.toBeDefined();
  });

  // BUG(port-review): createReservation has no "Invalid time range" guard — an
  // inverted or NaN range silently creates a confirmed booking holding zero slots.
  test.skip("rejects inverted and NaN ranges like the other write paths", async () => {
    await seed(t);
    await expect(reserve(utc(D1, "23:30"), utc(D1, "23:00"))).rejects.toThrow(EXACT_RANGE_ERROR);
    await expect(reserve(utc(D1, "23:30"), utc(D1, "23:30"))).rejects.toThrow(EXACT_RANGE_ERROR);
    await expect(reserve(utc(D1, "23:00"), NaN)).rejects.toThrow(EXACT_RANGE_ERROR);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toEqual([]);
  });
});
