/// <reference types="vite/client" />
/**
 * N8: a moved original names its successor.
 *
 * A move stores the original as an ordinary cancellation; until 0.4.2 only the
 * successor pointed back (`rescheduleUid`), so hosts told a move from a
 * cancellation by the free-text reason "Rescheduled to new time", which a
 * custom reason defeats and a genuine cancellation can carry. The original now
 * also gets `rescheduledToUid` = the successor's uid. Its status stays
 * "cancelled", and hooks are unchanged.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  book,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const hour = (h: number) => utc(TUESDAY, `${String(h).padStart(2, "0")}:00`);

/** The reference host's former heuristic (convexbooking booking page). */
const readsAsMoved = (booking: Doc<"bookings">) =>
  booking.status === "cancelled" && booking.cancellationReason === "Rescheduled to new time";

async function byUid(t: T, uid: string): Promise<Doc<"bookings">> {
  return (await t.query(api.public.getBookingByUid, { uid }))!;
}

type Job = { name?: string; args: Array<Record<string, any>> };

/** Scheduled triggerHooks event types that concern one booking id. */
async function hookEvents(t: T, bookingId: Id<"bookings">): Promise<string[]> {
  const jobs = (await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  )) as unknown as Job[];
  return jobs
    .filter((job) => job.name?.includes("triggerHooks"))
    .map((job) => job.args[0])
    .filter(
      (args) =>
        args.payload.bookingId === bookingId || args.payload.originalBookingId === bookingId
    )
    .map((args) => args.eventType);
}

describe("moves link the original to its successor", () => {
  test("an id move with a custom reason and a token move both set rescheduledToUid", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const byId = await book(t, seed, hour(8), hour(9));
    const byToken = await book(t, seed, hour(9), hour(10));

    const idSuccessor = await t.mutation(api.public.rescheduleBooking, {
      bookingId: byId._id,
      newStart: hour(14),
      newEnd: hour(15),
      reason: "Customer called",
    });
    const tokenSuccessor = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: byToken.uid,
      token: byToken.managementToken!,
      newStart: hour(16),
      newEnd: hour(17),
    });

    const movedById = await byUid(t, byId.uid);
    expect(movedById).toMatchObject({
      status: "cancelled",
      cancellationReason: "Customer called",
      rescheduledToUid: idSuccessor.uid,
    });
    // The free-text heuristic misses it; the forward link does not.
    expect(readsAsMoved(movedById)).toBe(false);
    expect(await byUid(t, byToken.uid)).toMatchObject({
      status: "cancelled",
      cancellationReason: "Rescheduled to new time",
      rescheduledToUid: tokenSuccessor.uid,
    });
    // Back pointers as before; successors carry no forward link.
    expect([idSuccessor.rescheduleUid, tokenSuccessor.rescheduleUid]).toEqual([byId.uid, byToken.uid]);
    expect([idSuccessor.rescheduledToUid, tokenSuccessor.rescheduledToUid]).toEqual([undefined, undefined]);
  });

  test("a chain A -> B -> C links each step", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const a = await book(t, seed, hour(8), hour(9));
    const b = await t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: hour(10), newEnd: hour(11) });
    const c = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: b.uid,
      token: b.managementToken!,
      newStart: hour(12),
      newEnd: hour(13),
    });

    const chain = [await byUid(t, a.uid), await byUid(t, b.uid), await byUid(t, c.uid)].map((row) => ({
      status: row.status,
      back: row.rescheduleUid,
      forward: row.rescheduledToUid,
    }));
    expect(chain).toEqual([
      { status: "cancelled", back: undefined, forward: b.uid },
      { status: "cancelled", back: a.uid, forward: c.uid },
      { status: "confirmed", back: b.uid, forward: undefined },
    ]);
  });

  test("a bundle move links the original too, and the item query returns the field", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });
    const bundle = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId,
      resources: [{ resourceId: seed.resourceId }, { resourceId: "pool-1", quantity: 2 }],
      start: hour(9),
      end: hour(10),
      timezone: "UTC",
      booker: BOOKER,
      location: LOCATION,
    });
    const successor = await t.mutation(api.public.rescheduleBooking, {
      bookingId: bundle._id,
      newStart: hour(11),
      newEnd: hour(12),
    });
    const original = await t.query(api.multi_resource.getBookingWithItems, { bookingId: bundle._id });
    expect(original).toMatchObject({ status: "cancelled", rescheduledToUid: successor.uid });
    expect(original!.items).toHaveLength(2);
  });

  test("the booking reads and lists return the field", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const original = await book(t, seed, hour(8), hour(9));
    const successor = await t.mutation(api.public.rescheduleBooking, {
      bookingId: original._id,
      newStart: hour(10),
      newEnd: hour(11),
    });

    const cancelled = await t.query(api.public.listBookings, { resourceId: seed.resourceId, status: "cancelled" });
    expect(cancelled.map((row) => row.rescheduledToUid)).toEqual([successor.uid]);
    expect((await t.query(api.public.getBooking, { bookingId: original._id }))?.rescheduledToUid).toBe(successor.uid);
    expect(
      (await t.query(api.public.getBookingByToken, { uid: original.uid, token: original.managementToken! }))
        .rescheduledToUid
    ).toBe(successor.uid);
  });

  test("hooks are unchanged: one booking.rescheduled, no booking.cancelled", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const original = await book(t, seed, hour(8), hour(9));
    await t.mutation(api.public.rescheduleBooking, { bookingId: original._id, newStart: hour(10), newEnd: hour(11) });
    expect(await hookEvents(t, original._id)).toEqual(["booking.created", "booking.rescheduled"]);

    // No v1 payload can spread the new field: every emitter that spreads a
    // stored booking refuses the (cancelled) original, and the idempotent
    // cancelReservation emits nothing.
    const moved = await byUid(t, original.uid);
    expect(moved.rescheduledToUid).toBeDefined();
    await expect(
      t.mutation(api.public.cancelBookingByToken, { uid: moved.uid, token: moved.managementToken! })
    ).rejects.toThrow("Cannot cancel booking with status: cancelled");
    await expect(
      t.mutation(api.hooks.transitionBookingState, { bookingId: moved._id, toStatus: "confirmed" })
    ).rejects.toThrow("Invalid state transition: cancelled -> confirmed");
    await expect(
      t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: moved._id })
    ).rejects.toThrow("Booking is already cancelled");
    expect(await t.mutation(api.public.cancelReservation, { reservationId: moved._id })).toEqual({
      success: true,
      alreadyCancelled: true,
    });
    expect(await hookEvents(t, original._id)).toEqual(["booking.created", "booking.rescheduled"]);
  });

  test("a move onto a taken slot fails and leaves the original unlinked", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const original = await book(t, seed, hour(8), hour(9));
    await book(t, seed, hour(10), hour(11));
    await expect(
      t.mutation(api.public.rescheduleBooking, { bookingId: original._id, newStart: hour(10), newEnd: hour(11) })
    ).rejects.toThrow('Resource "res-1" is not available for the selected time');
    const after = await byUid(t, original.uid);
    expect([after.status, after.rescheduledToUid]).toEqual(["confirmed", undefined]);
  });
});

describe("genuine cancellations never carry the link", () => {
  test("every cancel path, including one whose reason reads like a move", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const approval = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-approval", requiresConfirmation: true });
    const [a, b, c, d] = [
      await book(t, seed, hour(8), hour(9)),
      await book(t, seed, hour(9), hour(10)),
      await book(t, seed, hour(10), hour(11)),
      await book(t, seed, hour(11), hour(12)),
    ];
    const pending = await book(t, approval, hour(8), hour(9));
    const held = await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: seed.eventTypeId,
      resourceId: seed.resourceId,
      start: hour(12),
      end: hour(13),
      timezone: "UTC",
      booker: BOOKER,
      location: LOCATION,
    });

    await t.mutation(api.public.cancelReservation, { reservationId: a._id, reason: "Rescheduled to new time" });
    await t.mutation(api.public.cancelBookingByToken, {
      uid: b.uid,
      token: b.managementToken!,
      reason: "Rescheduled to new time",
    });
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: c._id });
    await t.mutation(api.hooks.transitionBookingState, { bookingId: d._id, toStatus: "cancelled" });
    await t.mutation(api.hooks.transitionBookingState, { bookingId: pending._id, toStatus: "declined" });
    await t.mutation(api.public.expireProvisionalBooking, { bookingId: held._id });

    const rows = [];
    for (const booking of [a, b, c, d, pending, held]) rows.push(await byUid(t, booking.uid));
    expect(rows.map((row) => row.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled", "declined", "cancelled"]);
    expect(rows.map((row) => row.rescheduledToUid)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    // The old heuristic mistakes the first two for moves; the link does not.
    expect(rows.slice(0, 2).map(readsAsMoved)).toEqual([true, true]);
  });
});
