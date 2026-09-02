/// <reference types="vite/client" />
// hooks.transitionBookingState: slot release, cancellation stamps, audit trail
// and the state-machine guard.
//
// hardening.test.ts covers the two headline cases (declined/cancelled release,
// multi-resource release). This file goes deeper on the same area: every
// transition target of the machine (provisional/pending/confirmed/completed),
// the exact guard error strings and the fact that a rejected transition is a
// no-op, partial and cross-UTC-midnight releases, pooled-quantity accounting
// with several holders (including the clamp and the "no double release"
// property against cancelMultiResourceBooking), and re-booking a freed slot.
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  ORG,
  TZ,
  book as createBooking,
  getBusySlots,
  range,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type SeedResourceOpts,
  type T,
} from "./setup.test.js";

const RESOURCE = "res-1";
const EVENT = "et-1";
const POOL = "pool-1";
/** Tuesday 2027-03-09. Slot arithmetic below is UTC: 09:00–10:00 UTC = 36..39. */
const DAY = "2027-03-09";
const NEXT_DAY = "2027-03-10";
const target = { resourceId: RESOURCE, eventTypeId: EVENT, timezone: TZ };

let t: T;

beforeEach(() => {
  // Fresh backend + frozen clock per test; setup() drains the scheduled hooks
  // (booking.created / booking.cancelled / booking.declined → e-mails) at the end.
  ({ t } = setup());
});

// ---- local shortcuts (thin wrappers over the harness, bound to `t`) ----

const seed = (opts: SeedResourceOpts = {}) =>
  seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT, ...opts });

const book = (start: number, end: number) => createBooking(t, target, start, end);

const busy = (date = DAY, resourceId = RESOURCE) => getBusySlots(t, resourceId, date);

const getBooking = (bookingId: Id<"bookings">) => t.query(api.public.getBooking, { bookingId });

const history = (bookingId: Id<"bookings">) =>
  t.query(api.hooks.getBookingHistory, { bookingId });

const transition = (
  bookingId: Id<"bookings">,
  toStatus: string,
  extra: { reason?: string; changedBy?: string } = {}
) => t.mutation(api.hooks.transitionBookingState, { bookingId, toStatus, ...extra });

const bookMulti = (
  resources: Array<{ resourceId: string; quantity?: number }>,
  start: number,
  end: number
) =>
  t.mutation(api.multi_resource.createMultiResourceBooking, {
    eventTypeId: EVENT,
    organizationId: ORG,
    resources,
    start,
    end,
    timezone: TZ,
    booker: BOOKER,
    location: LOCATION,
  });

/** Raw booked-quantity map of a pooled resource — no public query exposes it. */
function slotQuantities(
  resourceId: string,
  date = DAY
): Promise<Record<string, number> | null> {
  return t.run(async (ctx) => {
    const doc = await ctx.db
      .query("quantity_availability")
      .withIndex("by_resource_date", (q) => q.eq("resourceId", resourceId).eq("date", date))
      .unique();
    return doc ? ((doc.slotQuantities ?? {}) as Record<string, number>) : null;
  });
}

/** `{ "36": n, "37": n, "38": n, "39": n }` — the 09:00–10:00 UTC hour. */
const hourQuantities = (booked: number): Record<string, number> =>
  Object.fromEntries(range(36, 40).map((slot) => [String(slot), booked]));

const NINE = utc(DAY, "09:00");
const TEN = utc(DAY, "10:00");
const ELEVEN = utc(DAY, "11:00");

// ============================================
// Cancel / decline: release + stamps + history
// ============================================

describe("transitionBookingState: cancelled / declined", () => {
  test("confirmed → cancelled frees the slots and stamps cancelledAt, reason and history", async () => {
    await seed();
    const booking = await book(NINE, TEN);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.cancelledAt).toBeUndefined();
    expect(await busy()).toEqual(range(36, 40));

    const result = await transition(booking!._id, "cancelled", {
      reason: "customer called",
      changedBy: "admin-1",
    });
    expect(result).toEqual({ success: true });

    const cancelled = await getBooking(booking!._id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.cancelledAt).toBe(FIXED_NOW);
    expect(cancelled?.cancellationReason).toBe("customer called");
    expect(cancelled?.updatedAt).toBe(FIXED_NOW);
    // The daily_availability row survives, emptied — it is not deleted.
    expect(await busy()).toEqual([]);

    const entries = await history(booking!._id);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      fromStatus: "",
      toStatus: "confirmed",
      changedBy: "system",
      reason: "Booking created",
    });
    expect(entries[1]).toMatchObject({
      bookingId: booking!._id,
      fromStatus: "confirmed",
      toStatus: "cancelled",
      changedBy: "admin-1",
      reason: "customer called",
      timestamp: FIXED_NOW,
    });
  });

  test("pending → declined frees the slots and stamps cancelledAt even without a reason", async () => {
    await seed({ requiresConfirmation: true });
    const booking = await book(NINE, TEN);
    expect(booking?.status).toBe("pending");
    expect(await busy()).toEqual(range(36, 40));

    await transition(booking!._id, "declined");

    const declined = await getBooking(booking!._id);
    expect(declined?.status).toBe("declined");
    // The stamp is unconditional; only the reason is optional.
    expect(declined?.cancelledAt).toBe(FIXED_NOW);
    expect(declined?.cancellationReason).toBeUndefined();
    expect(await busy()).toEqual([]);

    const entries = await history(booking!._id);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ fromStatus: "pending", toStatus: "declined" });
    expect(entries[1].reason).toBeUndefined();
    expect(entries[1].changedBy).toBeUndefined();
  });

  test("pending → confirmed keeps the slots busy and leaves the cancellation fields unset", async () => {
    await seed({ requiresConfirmation: true });
    const booking = await book(NINE, TEN);

    await transition(booking!._id, "confirmed", { changedBy: "admin-1" });

    const confirmed = await getBooking(booking!._id);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.cancelledAt).toBeUndefined();
    expect(confirmed?.cancellationReason).toBeUndefined();
    expect(await busy()).toEqual(range(36, 40));
    // Still held: the approval must not have handed the time back.
    await expect(book(NINE, TEN)).rejects.toThrow("Time slot no longer available");

    const entries = await history(booking!._id);
    expect(entries.map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "->pending",
      "pending->confirmed",
    ]);
  });

  test("cancelling frees only the booking's own slots", async () => {
    await seed();
    const morning = await book(NINE, TEN);
    const later = await book(TEN, ELEVEN);
    expect(await busy()).toEqual(range(36, 44));

    await transition(morning!._id, "cancelled");

    expect(await busy()).toEqual(range(40, 44));
    expect((await getBooking(later!._id))?.status).toBe("confirmed");
    // The neighbour's hour is still blocked, the freed hour is bookable again.
    await expect(book(TEN, ELEVEN)).rejects.toThrow("Time slot no longer available");
    const replacement = await book(NINE, TEN);
    expect(replacement?.status).toBe("confirmed");
    expect(await busy()).toEqual(range(36, 44));
  });

  test("a booking across UTC midnight releases the slots on both days", async () => {
    await seed();
    const overnight = await book(utc(DAY, "23:30"), utc(NEXT_DAY, "00:30"));
    expect(await busy(DAY)).toEqual([94, 95]);
    expect(await busy(NEXT_DAY)).toEqual([0, 1]);

    await transition(overnight!._id, "cancelled", { reason: "late change" });

    expect(await busy(DAY)).toEqual([]);
    expect(await busy(NEXT_DAY)).toEqual([]);
    const again = await book(utc(DAY, "23:30"), utc(NEXT_DAY, "00:30"));
    expect(again?.status).toBe("confirmed");
    expect(await busy(DAY)).toEqual([94, 95]);
    expect(await busy(NEXT_DAY)).toEqual([0, 1]);
  });

  test("a cancelled booking's slots can be booked again by a new, independent booking", async () => {
    await seed();
    const first = await book(NINE, TEN);
    await expect(book(NINE, TEN)).rejects.toThrow("Time slot no longer available");

    await transition(first!._id, "cancelled", { reason: "freed" });

    const second = await book(NINE, TEN);
    expect(second!._id).not.toBe(first!._id);
    expect(second?.uid).not.toBe(first?.uid);
    expect(second?.status).toBe("confirmed");
    expect(await busy()).toEqual(range(36, 40));

    // The cancelled booking is untouched by the new one and keeps its own trail.
    expect(await getBooking(first!._id)).toMatchObject({
      status: "cancelled",
      cancellationReason: "freed",
      cancelledAt: FIXED_NOW,
    });
    expect(await history(first!._id)).toHaveLength(2);
    expect(await history(second!._id)).toHaveLength(1);
    const confirmed = await t.query(api.public.listBookings, {
      resourceId: RESOURCE,
      status: "confirmed",
    });
    expect(confirmed.map((b) => b._id)).toEqual([second!._id]);

    // …and the replacement can be cancelled in turn.
    await transition(second!._id, "cancelled");
    expect(await busy()).toEqual([]);
  });
});

// ============================================
// State machine guard
// ============================================

describe("transitionBookingState: guard", () => {
  test("an invalid target is rejected with the allowed list and changes nothing", async () => {
    await seed({ requiresConfirmation: true });
    const booking = await book(NINE, TEN);

    const pendingAllowed = "Allowed: confirmed, cancelled, declined";
    await expect(transition(booking!._id, "completed")).rejects.toThrow(
      `Invalid state transition: pending -> completed. ${pendingAllowed}`
    );
    // A status outside the machine entirely, and a no-op transition.
    await expect(transition(booking!._id, "archived")).rejects.toThrow(
      `Invalid state transition: pending -> archived. ${pendingAllowed}`
    );
    await expect(transition(booking!._id, "pending")).rejects.toThrow(
      `Invalid state transition: pending -> pending. ${pendingAllowed}`
    );

    // No history entry, no status change, no slot released.
    expect((await getBooking(booking!._id))?.status).toBe("pending");
    expect(await history(booking!._id)).toHaveLength(1);
    expect(await busy()).toEqual(range(36, 40));

    await transition(booking!._id, "confirmed");
    await expect(transition(booking!._id, "declined")).rejects.toThrow(
      "Invalid state transition: confirmed -> declined. Allowed: cancelled, completed"
    );
    expect(await history(booking!._id)).toHaveLength(2);
    expect(await busy()).toEqual(range(36, 40));
  });

  test("cancelled, declined and completed are terminal; completed never gives slots back", async () => {
    await seed({ requiresConfirmation: true });

    const declined = await book(NINE, TEN);
    await transition(declined!._id, "declined");
    await expect(transition(declined!._id, "cancelled")).rejects.toThrow(
      "Invalid state transition: declined -> cancelled. Allowed: none"
    );
    // The rejected call must not have touched the (already emptied) bitmap.
    expect(await busy()).toEqual([]);

    // The hour is free again, so a second booking can take it and run to completion.
    const done = await book(NINE, TEN);
    await transition(done!._id, "confirmed");
    await transition(done!._id, "completed");
    expect(await busy()).toEqual(range(36, 40));
    expect((await getBooking(done!._id))?.cancelledAt).toBeUndefined();
    await expect(transition(done!._id, "cancelled")).rejects.toThrow(
      "Invalid state transition: completed -> cancelled. Allowed: none"
    );
    expect(await busy()).toEqual(range(36, 40));

    const cancelled = await book(TEN, ELEVEN);
    await transition(cancelled!._id, "confirmed");
    await transition(cancelled!._id, "cancelled");
    await expect(transition(cancelled!._id, "confirmed")).rejects.toThrow(
      "Invalid state transition: cancelled -> confirmed. Allowed: none"
    );
    // Only the completed booking's hour is left.
    expect(await busy()).toEqual(range(36, 40));
  });

  test("provisional holds: cancelled frees them, pending/confirmed keep them", async () => {
    await seed();
    const hold = await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: EVENT,
      resourceId: RESOURCE,
      start: NINE,
      end: TEN,
      timezone: TZ,
      booker: BOOKER,
      location: LOCATION,
    });
    expect(hold?.status).toBe("provisional");
    expect(await busy()).toEqual(range(36, 40));

    await expect(transition(hold!._id, "declined")).rejects.toThrow(
      "Invalid state transition: provisional -> declined. Allowed: pending, confirmed, cancelled"
    );

    await transition(hold!._id, "pending");
    expect(await busy()).toEqual(range(36, 40));
    await transition(hold!._id, "confirmed");
    expect(await busy()).toEqual(range(36, 40));
    expect((await getBooking(hold!._id))?.cancelledAt).toBeUndefined();

    await transition(hold!._id, "cancelled", { reason: "not paid" });
    expect(await busy()).toEqual([]);
    expect((await getBooking(hold!._id))?.cancellationReason).toBe("not paid");
    expect((await history(hold!._id)).map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "->provisional",
      "provisional->pending",
      "pending->confirmed",
      "confirmed->cancelled",
    ]);
  });

  test("after a reschedule only the new booking can be cancelled, and it frees the new range", async () => {
    await seed();
    const original = await book(NINE, TEN);
    const moved = await t.mutation(api.public.rescheduleBooking, {
      bookingId: original!._id,
      newStart: TEN,
      newEnd: ELEVEN,
    });
    expect(moved?.rescheduleUid).toBe(original?.uid);
    expect(await busy()).toEqual(range(40, 44));

    // The superseded booking is already cancelled by the reschedule → terminal.
    expect((await getBooking(original!._id))?.status).toBe("cancelled");
    await expect(transition(original!._id, "cancelled")).rejects.toThrow(
      "Invalid state transition: cancelled -> cancelled. Allowed: none"
    );
    expect(await busy()).toEqual(range(40, 44));

    // Cancelling the new booking releases the NEW range, not the original one.
    await transition(moved!._id, "cancelled", { reason: "cannot make it" });
    expect(await busy()).toEqual([]);
    expect((await getBooking(moved!._id))?.cancelledAt).toBe(FIXED_NOW);
    // rescheduleBooking records history on the original only, so the new
    // booking's trail starts with the cancellation.
    expect((await history(moved!._id)).map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "confirmed->cancelled",
    ]);
    expect((await history(original!._id)).map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "->confirmed",
      "confirmed->cancelled",
    ]);
  });

  test("cancelling a booking whose availability row is gone is a no-op, not an error", async () => {
    await seed();
    const booking = await book(NINE, TEN);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) => q.eq("resourceId", RESOURCE).eq("date", DAY))
        .unique();
      await ctx.db.delete(row!._id);
    });

    await transition(booking!._id, "cancelled", { reason: "row already gone" });

    expect(await getBooking(booking!._id)).toMatchObject({
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      cancellationReason: "row already gone",
    });
    // No row is created just to empty it.
    expect(await busy()).toBeNull();
  });

  test("transitioning a booking that no longer exists throws", async () => {
    await seed();
    const booking = await book(NINE, TEN);
    const bookingId = booking!._id;

    await t.mutation(api.maintenance.wipeAllBookingData, {});

    await expect(transition(bookingId, "cancelled")).rejects.toThrow("Booking not found");
    expect(await history(bookingId)).toEqual([]);
    expect(await busy()).toBeNull();
  });
});

// ============================================
// Multi-resource / pooled release
// ============================================

describe("transitionBookingState: multi-resource release", () => {
  test("a declined multi-resource booking releases the bitmap resource and the pooled quantity", async () => {
    await seed({ requiresConfirmation: true });
    await seedFungibleResource(t, { resourceId: POOL, quantity: 3, eventTypeId: EVENT });

    const multi = await bookMulti(
      [{ resourceId: RESOURCE }, { resourceId: POOL, quantity: 2 }],
      NINE,
      TEN
    );
    expect(multi?.status).toBe("pending");
    expect(await busy()).toEqual(range(36, 40));
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(2));

    await transition(multi!._id, "declined", { reason: "no equipment left" });

    const declined = await getBooking(multi!._id);
    expect(declined?.status).toBe("declined");
    expect(declined?.cancelledAt).toBe(FIXED_NOW);
    expect(declined?.cancellationReason).toBe("no equipment left");
    expect(await busy()).toEqual([]);
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(0));

    const check = await t.query(api.multi_resource.checkMultiResourceAvailability, {
      resources: [{ resourceId: RESOURCE }, { resourceId: POOL, quantity: 3 }],
      start: NINE,
      end: TEN,
    });
    expect(check.available).toBe(true);
    expect(check.resources.map((r) => r.availableQuantity)).toEqual([1, 3]);

    // booking_items stay as the record of what was booked.
    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: multi!._id,
    });
    expect(withItems?.items.map((i) => i.resourceId)).toEqual([RESOURCE, POOL]);
  });

  test("a pooled resource gives back only its own share, and cannot be released twice", async () => {
    await seed();
    await seedFungibleResource(t, { resourceId: POOL, quantity: 3, eventTypeId: EVENT });

    const big = await bookMulti([{ resourceId: POOL, quantity: 2 }], NINE, TEN);
    const small = await bookMulti([{ resourceId: POOL, quantity: 1 }], NINE, TEN);
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(3));
    await expect(bookMulti([{ resourceId: POOL, quantity: 1 }], NINE, TEN)).rejects.toThrow(
      `Resource "${POOL}" is not available for the requested quantity`
    );

    await transition(big!._id, "cancelled", { reason: "half of it back" });

    // Only the two units of `big`; `small` keeps its one.
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(1));
    expect((await getBooking(small!._id))?.status).toBe("confirmed");

    // The parallel cancel path refuses to run again → no second release.
    await expect(
      t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: big!._id })
    ).rejects.toThrow("Booking is already cancelled");
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(1));

    // Exactly the freed two units are bookable again, a third one is not.
    const refill = await bookMulti([{ resourceId: POOL, quantity: 2 }], NINE, TEN);
    expect(refill?.status).toBe("confirmed");
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(3));
  });

  test("a pooled resource with quantity 1 is held and released on the bitmap", async () => {
    await seed();
    await seedFungibleResource(t, { resourceId: POOL, quantity: 1, eventTypeId: EVENT });

    const booking = await bookMulti([{ resourceId: POOL }], NINE, TEN);
    // isFungible but quantity 1 → daily_availability, never quantity_availability.
    expect(await busy(DAY, POOL)).toEqual(range(36, 40));
    expect(await slotQuantities(POOL)).toBeNull();
    await expect(bookMulti([{ resourceId: POOL }], NINE, TEN)).rejects.toThrow(
      `Resource "${POOL}" is not available for the selected time`
    );

    await transition(booking!._id, "cancelled");

    // The release has to take the same branch as the reservation did.
    expect(await busy(DAY, POOL)).toEqual([]);
    expect(await slotQuantities(POOL)).toBeNull();
    const again = await bookMulti([{ resourceId: POOL }], NINE, TEN);
    expect(again?.status).toBe("confirmed");
    expect(await busy(DAY, POOL)).toEqual(range(36, 40));
  });

  test("releasing a pooled resource clamps the counters at zero", async () => {
    await seed();
    await seedFungibleResource(t, { resourceId: POOL, quantity: 3, eventTypeId: EVENT });
    const booking = await bookMulti([{ resourceId: POOL, quantity: 2 }], NINE, TEN);

    // Drift: one slot counted below what the booking holds, the rest missing.
    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("quantity_availability")
        .withIndex("by_resource_date", (q) => q.eq("resourceId", POOL).eq("date", DAY))
        .unique();
      await ctx.db.patch(doc!._id, { slotQuantities: { "36": 1 } });
    });

    await transition(booking!._id, "cancelled");

    // No negative counters — a negative would make the pool look larger than it is.
    expect(await slotQuantities(POOL)).toEqual(hourQuantities(0));
    const check = await t.query(api.multi_resource.checkMultiResourceAvailability, {
      resources: [{ resourceId: POOL, quantity: 3 }],
      start: NINE,
      end: TEN,
    });
    expect(check.resources[0].availableQuantity).toBe(3);
  });
});
