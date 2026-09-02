/// <reference types="vite/client" />
// Feature #8 — `excludeBookingUid` on the availability queries — and the
// reschedule self-overlap fix, exercised on the SCHEDULE-AWARE path
// (Europe/Berlin resource, 60-minute event on a 30-minute grid).
// hardening.test.ts covers the same feature on the legacy 9–17-UTC path; this
// file goes deeper: candidate-by-candidate day view, month/day agreement, every
// status guard (excluded vs. ignored), the other-resource guard, cross-midnight
// exclusion, and both reschedule mutations incl. their error strings.
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  berlin,
  book,
  getBusySlots,
  range,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type SeedScheduleOpts,
  type SeededSchedule,
  type T,
  type WeeklyHours,
} from "./setup.test.js";

// ============================================
// FIXTURE
// ============================================

/** Mon–Fri 08:00–18:00 — wider than the harness default so 08:30 is a real candidate. */
const WEEKDAYS_8_TO_18: WeeklyHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "08:00",
  endTime: "18:00",
}));

/** Local starts the day view offers on a weekday: 08:00, 08:30 … 17:00 (19 candidates). */
const ALL_LOCAL_STARTS: string[] = [];
for (let hour = 8; hour <= 17; hour++) {
  ALL_LOCAL_STARTS.push(`${String(hour).padStart(2, "0")}:00`);
  if (hour < 17) ALL_LOCAL_STARTS.push(`${String(hour).padStart(2, "0")}:30`);
}

/** ISO (UTC) start time of a Europe/Berlin wall-clock time on the fixture Tuesday. */
const iso = (localTime: string, date: string = TUESDAY) =>
  new Date(berlin(date, localTime)).toISOString();

const ALL_STARTS = ALL_LOCAL_STARTS.map((time) => iso(time));

/**
 * Europe/Berlin schedule Mon–Fri 08:00–18:00 (local slots 32..71), 60-minute
 * event type on a 30-minute grid. Booking 09:00–10:00 local = 08:00–09:00 UTC
 * = UTC slot indices 32..35, which blocks the 08:30/09:00/09:30 candidates.
 */
const seedBerlin = (t: T, opts: SeedScheduleOpts = {}): Promise<SeededSchedule> =>
  seedResourceWithSchedule(t, { weeklyHours: WEEKDAYS_8_TO_18, slotInterval: 30, ...opts });

/** Schedule-aware day view of the seed date, optionally excluding one booking. */
async function dayStarts(
  t: T,
  seed: SeededSchedule,
  excludeBookingUid?: string
): Promise<string[]> {
  const args =
    excludeBookingUid === undefined
      ? seed.daySlotsArgs
      : { ...seed.daySlotsArgs, excludeBookingUid };
  const slots = await t.query(api.public.getDaySlots, args);
  return slots.map((slot) => slot.time);
}

/** Schedule-aware month view for a single day, optionally excluding one booking. */
async function monthAvailable(
  t: T,
  seed: SeededSchedule,
  excludeBookingUid?: string,
  date: string = seed.date
): Promise<boolean> {
  const base = {
    resourceId: seed.resourceId,
    dateFrom: date,
    dateTo: date,
    eventLength: seed.lengthInMinutes,
    slotInterval: seed.slotInterval,
    resourceTimezone: seed.timezone,
    scheduleId: seed.scheduleId,
  };
  const result = await t.query(
    api.public.getMonthAvailability,
    excludeBookingUid === undefined ? base : { ...base, excludeBookingUid }
  );
  return result[date];
}

/** The 09:00–10:00 local booking used as "booking A" throughout. */
const bookNine = (t: T, seed: SeededSchedule) =>
  book(t, seed, berlin(seed.date, "09:00"), berlin(seed.date, "10:00"));

let t: T;

beforeEach(() => {
  ({ t } = setup());
});

// ============================================
// (a) Day view
// ============================================

describe("excludeBookingUid — day view", () => {
  test("gives the booking's own slots back, including the half-overlapping neighbours", async () => {
    const seed = await seedBerlin(t);
    expect(seed.availableSlots).toEqual(range(32, 72)); // 08:00–18:00 local
    expect(await dayStarts(t, seed)).toEqual(ALL_STARTS);
    expect(ALL_STARTS).toHaveLength(19);

    const a = await bookNine(t, seed);
    expect(a).toMatchObject({ status: "confirmed", resourceId: seed.resourceId });
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);

    // 08:30 (UTC 30..33), 09:00 (32..35) and 09:30 (34..37) all touch 32..35.
    const without = await dayStarts(t, seed);
    expect(without).toEqual(
      ALL_STARTS.filter((time) => ![iso("08:30"), iso("09:00"), iso("09:30")].includes(time))
    );
    expect(without).toHaveLength(16);

    // With the exclusion the day view is byte-identical to the unbooked day.
    const withExclusion = await dayStarts(t, seed, a!.uid);
    expect(withExclusion).toEqual(ALL_STARTS);
    expect(withExclusion).toContain(iso("08:30"));
    expect(withExclusion).toContain(iso("09:00"));
    expect(withExclusion).toContain(iso("09:30"));

    // The exclusion never invents slots outside the schedule window.
    expect(withExclusion).not.toContain(iso("07:30"));
    expect(withExclusion).not.toContain(iso("17:30"));

    // The stored bitmap is untouched — the exclusion is read-side only.
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);
  });

  test("frees only the named booking; a foreign booking on the same candidates keeps blocking", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    // Foreign booking 10:00–11:00 local = UTC 36..39.
    await book(t, seed, berlin(seed.date, "10:00"), berlin(seed.date, "11:00"));

    const withExclusion = await dayStarts(t, seed, a!.uid);
    expect(withExclusion).toContain(iso("08:30"));
    expect(withExclusion).toContain(iso("09:00"));
    expect(withExclusion).not.toContain(iso("09:30")); // needs 34..37 → 36,37 foreign
    expect(withExclusion).not.toContain(iso("10:00")); // needs 36..39 → foreign
    expect(withExclusion).toContain(iso("11:00")); // needs 40..43 → free

    // Excluding the foreign booking instead frees exactly the mirror image.
    const foreign = (await t.query(api.public.listBookings, { resourceId: seed.resourceId })).find(
      (b: Doc<"bookings">) => b.start === berlin(seed.date, "10:00")
    );
    const mirror = await dayStarts(t, seed, foreign!.uid);
    expect(mirror).not.toContain(iso("09:00"));
    expect(mirror).toContain(iso("10:00"));
    expect(mirror).toContain(iso("10:30"));
  });

  test("applies per calendar day for a range spanning UTC midnight", async () => {
    // Own resource in UTC so the 24h window needs no schedule document.
    const utcSeed = await seedResource(t, {
      resourceId: "res-utc",
      eventTypeId: "et-utc",
      timezone: "UTC",
      lengthInMinutes: 30,
      slotInterval: 15,
    });
    const dayArgs = (date: string, excludeBookingUid?: string) => ({
      resourceId: utcSeed.resourceId,
      date,
      eventLength: 30,
      slotInterval: 15,
      resourceTimezone: "UTC",
      availableSlots: range(0, 96),
      ...(excludeBookingUid === undefined ? {} : { excludeBookingUid }),
    });
    const starts = async (date: string, uid?: string) =>
      (await t.query(api.public.getDaySlots, dayArgs(date, uid))).map((slot) => slot.time);

    const crossing = await book(
      t,
      utcSeed,
      utc("2027-03-09", "23:30"),
      utc("2027-03-10", "00:30")
    );
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-09")).toEqual([94, 95]);
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-10")).toEqual([0, 1]);

    expect(await starts("2027-03-09")).not.toContain("2027-03-09T23:30:00.000Z");
    expect(await starts("2027-03-10")).not.toContain("2027-03-10T00:00:00.000Z");

    // The exclusion map is keyed by date: both days are freed by the same uid.
    expect(await starts("2027-03-09", crossing!.uid)).toContain("2027-03-09T23:30:00.000Z");
    expect(await starts("2027-03-10", crossing!.uid)).toContain("2027-03-10T00:00:00.000Z");
  });
});

// ============================================
// (b) Month view agrees with the day view
// ============================================

describe("excludeBookingUid — month view", () => {
  test("a fully booked day flips false → true only for the excluded booking", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    // Fill the rest of the window: 08:00–09:00 (UTC 28..31) and 10:00–18:00 (36..67).
    const early = await book(t, seed, berlin(seed.date, "08:00"), berlin(seed.date, "09:00"));
    await book(t, seed, berlin(seed.date, "10:00"), berlin(seed.date, "18:00"));
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual(range(28, 68));

    expect(await dayStarts(t, seed)).toEqual([]);
    expect(await monthAvailable(t, seed)).toBe(false);

    // Only booking A's own 32..35 open a full 60-minute candidate again (09:00).
    expect(await monthAvailable(t, seed, a!.uid)).toBe(true);
    expect(await dayStarts(t, seed, a!.uid)).toEqual([iso("09:00")]);

    // Month and day view stay in agreement for a different excluded booking:
    // freeing 28..31 opens 08:00 (28..31) but nothing else.
    expect(await monthAvailable(t, seed, early!.uid)).toBe(true);
    expect(await dayStarts(t, seed, early!.uid)).toEqual([iso("08:00")]);
  });

  test("never resurrects a day whose schedule window is empty", async () => {
    const seed = await seedBerlin(t);
    const saturday = "2027-03-13";
    const weekend = await book(
      t,
      seed,
      berlin(saturday, "10:00"),
      berlin(saturday, "11:00")
    );
    expect(await getBusySlots(t, seed.resourceId, saturday)).toEqual([36, 37, 38, 39]);

    expect(await monthAvailable(t, seed, undefined, saturday)).toBe(false);
    expect(await monthAvailable(t, seed, weekend!.uid, saturday)).toBe(false);

    // Same for an "unavailable" date override on a weekday.
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: "2027-03-10",
      type: "unavailable",
    });
    const blocked = await book(
      t,
      seed,
      berlin("2027-03-10", "09:00"),
      berlin("2027-03-10", "10:00")
    );
    expect(await monthAvailable(t, seed, blocked!.uid, "2027-03-10")).toBe(false);
  });
});

// ============================================
// (c) Guards
// ============================================

describe("excludeBookingUid — guards", () => {
  test("an unknown or empty uid has no effect", async () => {
    const seed = await seedBerlin(t);
    await bookNine(t, seed);
    const blocked = await dayStarts(t, seed);

    expect(await dayStarts(t, seed, "bk_does_not_exist")).toEqual(blocked);
    expect(await dayStarts(t, seed, "")).toEqual(blocked);
    expect(await monthAvailable(t, seed, "bk_does_not_exist")).toBe(true); // day is not full
    expect(await dayStarts(t, seed, "bk_does_not_exist")).not.toContain(iso("09:00"));
  });

  test("a booking on ANOTHER resource is never excluded", async () => {
    const seed = await seedBerlin(t);
    const other = await seedBerlin(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
      scheduleId: "sch-2",
    });
    await bookNine(t, seed);
    const otherBooking = await bookNine(t, other);
    expect(await getBusySlots(t, other.resourceId, other.date)).toEqual([32, 33, 34, 35]);

    // Same slot indices, same timezone — only the resource differs.
    expect(await dayStarts(t, seed, otherBooking!.uid)).not.toContain(iso("09:00"));
    expect(await dayStarts(t, seed, otherBooking!.uid)).toEqual(await dayStarts(t, seed));

    // The uid is perfectly excludable on its OWN resource, so the no-op above
    // is the resource guard and not a generally invalid uid.
    expect(await dayStarts(t, other, otherBooking!.uid)).toContain(iso("09:00"));
  });

  test("a cancelled uid is ignored and cannot free the slots of the new holder", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    await t.mutation(api.public.cancelBookingByToken, {
      uid: a!.uid,
      token: a!.managementToken!,
    });
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([]);

    // A different booker takes exactly the released indices.
    const successor = await bookNine(t, seed);
    expect(successor!.uid).not.toBe(a!.uid);
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);

    const blocked = await dayStarts(t, seed);
    expect(await dayStarts(t, seed, a!.uid)).toEqual(blocked); // cancelled → no effect
    expect(await dayStarts(t, seed, a!.uid)).not.toContain(iso("09:00"));
    expect(await dayStarts(t, seed, successor!.uid)).toContain(iso("09:00"));
  });

  test("a declined uid is ignored and cannot free the slots of the new holder", async () => {
    const seed = await seedBerlin(t, { requiresConfirmation: true });
    const a = await bookNine(t, seed);
    expect(a!.status).toBe("pending");

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: a!._id,
      toStatus: "declined",
      reason: "no",
    });
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([]);

    const successor = await bookNine(t, seed);
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);
    expect(await dayStarts(t, seed, a!.uid)).not.toContain(iso("09:00"));
    expect(await dayStarts(t, seed, successor!.uid)).toContain(iso("09:00"));
  });

  test("pending and provisional bookings ARE excluded", async () => {
    const seed = await seedBerlin(t, { requiresConfirmation: true });
    const pending = await bookNine(t, seed);
    expect(pending!.status).toBe("pending");
    expect(await dayStarts(t, seed, pending!.uid)).toContain(iso("09:00"));

    const provisional: Doc<"bookings"> | null = await t.mutation(
      api.public.createProvisionalBooking,
      {
        eventTypeId: seed.eventTypeId,
        resourceId: seed.resourceId,
        start: berlin(seed.date, "11:00"),
        end: berlin(seed.date, "12:00"),
        timezone: seed.timezone,
        booker: BOOKER,
        location: LOCATION,
      }
    );
    expect(provisional!.status).toBe("provisional");
    expect(await dayStarts(t, seed)).not.toContain(iso("11:00"));
    expect(await dayStarts(t, seed, provisional!.uid)).toContain(iso("11:00"));
    // Excluding the provisional booking does not also free the pending one.
    expect(await dayStarts(t, seed, provisional!.uid)).not.toContain(iso("09:00"));
  });

  test("a completed booking still holds its slots and is deliberately NOT excluded", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: a!._id,
      toStatus: "completed",
    });
    // "completed" does not release slots …
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);
    // … and is not one of pending/confirmed/provisional, so the exclusion is a
    // no-op: a completed booking can never be rescheduled either
    // (rescheduleBooking rejects any status outside pending/confirmed).
    expect(await dayStarts(t, seed, a!.uid)).not.toContain(iso("09:00"));
    await expect(
      t.mutation(api.public.rescheduleBooking, {
        bookingId: a!._id,
        newStart: berlin(seed.date, "09:30"),
        newEnd: berlin(seed.date, "10:30"),
      })
    ).rejects.toThrow("Cannot reschedule booking with status: completed");
  });
});

// ============================================
// (d) Reschedule onto the booking's own range
// ============================================

describe("reschedule self-overlap", () => {
  // 09:00–10:00 local = UTC 32..35, 09:30–10:30 local = UTC 34..37 (overlap 34,35).
  const newStart = (seed: SeededSchedule) => berlin(seed.date, "09:30");
  const newEnd = (seed: SeededSchedule) => berlin(seed.date, "10:30");

  test("rescheduleBookingByToken moves a booking onto its own old range", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);

    const moved: Doc<"bookings"> | null = await t.mutation(
      api.public.rescheduleBookingByToken,
      {
        uid: a!.uid,
        token: a!.managementToken!,
        newStart: newStart(seed),
        newEnd: newEnd(seed),
      }
    );

    expect(moved).toMatchObject({
      start: newStart(seed),
      end: newEnd(seed),
      status: "confirmed",
      rescheduleUid: a!.uid,
      resourceId: seed.resourceId,
      managementToken: a!.managementToken,
    });
    expect(moved!.uid).not.toBe(a!.uid);

    // Busy slots are EXACTLY the new range — the old ones were released, the
    // overlap (34,35) was not dropped or duplicated.
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([34, 35, 36, 37]);

    const original = await t.query(api.public.getBookingByUid, { uid: a!.uid });
    expect(original).toMatchObject({
      status: "cancelled",
      cancellationReason: "Rescheduled to new time",
    });

    // Day view after the move: 09:00 (32..35), 09:30 (34..37), 10:00 (36..39) blocked.
    const after = await dayStarts(t, seed);
    expect(after).toEqual(
      ALL_STARTS.filter((time) => ![iso("09:00"), iso("09:30"), iso("10:00")].includes(time))
    );
    // The cancelled original must not free anything; the new uid frees its range.
    expect(await dayStarts(t, seed, a!.uid)).toEqual(after);
    expect(await dayStarts(t, seed, moved!.uid)).toEqual(ALL_STARTS);
  });

  test("rescheduleBooking (id path) moves a booking onto its own old range", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);

    const moved: Doc<"bookings"> | null = await t.mutation(api.public.rescheduleBooking, {
      bookingId: a!._id,
      newStart: newStart(seed),
      newEnd: newEnd(seed),
      reason: "customer request",
    });

    expect(moved).toMatchObject({
      start: newStart(seed),
      end: newEnd(seed),
      status: "confirmed",
      rescheduleUid: a!.uid,
    });
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([34, 35, 36, 37]);
    expect((await t.query(api.public.getBookingByUid, { uid: a!.uid }))!.status).toBe("cancelled");
  });

  test("a pending booking keeps its status when moved onto its own range", async () => {
    const seed = await seedBerlin(t, { requiresConfirmation: true });
    const a = await bookNine(t, seed);
    expect(a!.status).toBe("pending");

    const moved: Doc<"bookings"> | null = await t.mutation(
      api.public.rescheduleBookingByToken,
      {
        uid: a!.uid,
        token: a!.managementToken!,
        newStart: newStart(seed),
        newEnd: newEnd(seed),
      }
    );
    expect(moved!.status).toBe("pending");
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([34, 35, 36, 37]);
  });

  test("only the booking's OWN slots are excluded — the token path reports the foreign block", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    // Foreign 11:00–12:00 local = UTC 40..43.
    await book(t, seed, berlin(seed.date, "11:00"), berlin(seed.date, "12:00"));

    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: a!.uid,
        token: a!.managementToken!,
        newStart: berlin(seed.date, "10:30"), // UTC 38..41 → 40,41 foreign
        newEnd: berlin(seed.date, "11:30"),
      })
    ).rejects.toThrow("Resource is not available for the requested time range");

    // Nothing moved.
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35, 40, 41, 42, 43]);
    expect((await t.query(api.public.getBookingByUid, { uid: a!.uid }))!.status).toBe("confirmed");
  });

  test("the id path rejects a foreign conflict with the per-day slot message and rolls back", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);
    await book(t, seed, berlin(seed.date, "11:00"), berlin(seed.date, "12:00")); // UTC 40..43

    // rescheduleBooking has no isAvailable() pre-check: it frees the old slots
    // first and then hits the per-day conflict check in step 8.
    await expect(
      t.mutation(api.public.rescheduleBooking, {
        bookingId: a!._id,
        newStart: berlin(seed.date, "10:30"),
        newEnd: berlin(seed.date, "11:30"),
      })
    ).rejects.toThrow(`Conflict detected on ${seed.date} at slot 40`);

    // The rolled-back mutation left neither the booking nor the bitmap changed.
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35, 40, 41, 42, 43]);
    expect((await t.query(api.public.getBookingByUid, { uid: a!.uid }))!.status).toBe("confirmed");
    expect(
      (await t.query(api.public.listBookings, { resourceId: seed.resourceId }))
        .map((b: Doc<"bookings">) => b.start)
        .sort((x: number, y: number) => x - y)
    ).toEqual([berlin(seed.date, "09:00"), berlin(seed.date, "11:00")]);
  });

  test("moving onto the exact same range is a no-op for the bitmap", async () => {
    const seed = await seedBerlin(t);
    const a = await bookNine(t, seed);

    const moved: Doc<"bookings"> | null = await t.mutation(
      api.public.rescheduleBookingByToken,
      {
        uid: a!.uid,
        token: a!.managementToken!,
        newStart: berlin(seed.date, "09:00"),
        newEnd: berlin(seed.date, "10:00"),
      }
    );
    expect(moved!.uid).not.toBe(a!.uid);
    expect(await getBusySlots(t, seed.resourceId, seed.date)).toEqual([32, 33, 34, 35]);
    expect(await dayStarts(t, seed, moved!.uid)).toEqual(ALL_STARTS);
  });

  test("a self-overlapping move across UTC midnight keeps both days consistent", async () => {
    const utcSeed = await seedResource(t, {
      resourceId: "res-utc",
      eventTypeId: "et-utc",
      timezone: "UTC",
      lengthInMinutes: 60,
      slotInterval: 15,
    });
    const a = await book(t, utcSeed, utc("2027-03-09", "23:30"), utc("2027-03-10", "00:30"));
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-09")).toEqual([94, 95]);
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-10")).toEqual([0, 1]);

    // 23:45 → 00:45 overlaps its own 95 and 0.
    const moved: Doc<"bookings"> | null = await t.mutation(
      api.public.rescheduleBookingByToken,
      {
        uid: a!.uid,
        token: a!.managementToken!,
        newStart: utc("2027-03-09", "23:45"),
        newEnd: utc("2027-03-10", "00:45"),
      }
    );
    expect(moved!.start).toBe(utc("2027-03-09", "23:45"));
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-09")).toEqual([95]);
    expect(await getBusySlots(t, utcSeed.resourceId, "2027-03-10")).toEqual([0, 1, 2]);
  });
});
