/// <reference types="vite/client" />
/**
 * F14: cancelling an active booking records the same lifecycle metadata on
 * every path.
 *
 * Until 0.4.2 cancelReservation (the admin cancel of the package's
 * AdminBookingAPI and of the reference host) only flipped the status: no
 * history row, no cancelledAt, an unchanged updatedAt, and no way to pass a
 * reason or an actor. Bookings are created at T0 and cancelled at T1, so a
 * rewritten updatedAt (T1) is distinguishable from an untouched one (T0).
 */
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  TUESDAY,
  book,
  getBusySlots,
  range,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const HOUR = 3_600_000;
const T0 = FIXED_NOW;
const T1 = FIXED_NOW + HOUR;
const at = (time: string) => utc(TUESDAY, time);

// ============================================
// HELPERS
// ============================================

type Job = { name?: string; args: Array<Record<string, any>> };

/** triggerHooks jobs of one event type for one booking. */
async function hookJobs(t: T, eventType: string, bookingId: Id<"bookings">) {
  const jobs = (await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  )) as unknown as Job[];
  return jobs
    .filter((job) => job.name?.includes("triggerHooks"))
    .map((job) => job.args[0])
    .filter((args) => args.eventType === eventType && args.payload.bookingId === bookingId);
}

/** The lifecycle metadata of a booking, history rows included. */
async function lifecycleOf(t: T, bookingId: Id<"bookings">) {
  const booking = (await t.query(api.public.getBooking, { bookingId }))!;
  const history = await t.query(api.hooks.getBookingHistory, { bookingId });
  return {
    status: booking.status,
    cancelledAt: booking.cancelledAt,
    updatedAt: booking.updatedAt,
    cancellationReason: booking.cancellationReason,
    history: history.map((row) => ({
      from: row.fromStatus,
      to: row.toStatus,
      by: row.changedBy,
      reason: row.reason,
      at: row.timestamp,
    })),
  };
}

/** Units of pool-1 held per UTC slot on TUESDAY (only non-zero entries). */
async function poolUnits(t: T): Promise<Record<string, number>> {
  const row = await t.run((ctx) =>
    ctx.db
      .query("quantity_availability")
      .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", "pool-1").eq("date", TUESDAY))
      .unique()
  );
  const quantities = (row?.slotQuantities ?? {}) as Record<string, number>;
  return Object.fromEntries(Object.entries(quantities).filter(([, units]) => units > 0));
}

/**
 * res-1 + et-1 (org-1), pool-1 (capacity 3) linked to et-1, and res-2 +
 * et-approval (requires confirmation). Every row kind occupies 10:00–11:00.
 */
async function seedWorld(t: T) {
  const seed = await seedResource(t);
  await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });
  const approval = await seedResource(t, {
    resourceId: "res-2",
    eventTypeId: "et-approval",
    requiresConfirmation: true,
  });
  const start = at("10:00");
  const end = at("11:00");

  const create: Record<RowKind, () => Promise<{ booking: Doc<"bookings">; resourceId: string }>> = {
    confirmed: async () => ({ booking: await book(t, seed, start, end), resourceId: seed.resourceId }),
    pending: async () => ({ booking: await book(t, approval, start, end), resourceId: approval.resourceId }),
    provisional: async () => ({
      booking: await t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: seed.eventTypeId,
        resourceId: seed.resourceId,
        start,
        end,
        timezone: seed.timezone,
        booker: BOOKER,
        location: LOCATION,
      }),
      resourceId: seed.resourceId,
    }),
    legacy: async () => {
      const bookingId = await t.mutation(api.public.createReservation, {
        resourceId: seed.resourceId,
        actorId: "ops@example.com",
        start,
        end,
      });
      return { booking: (await t.query(api.public.getBooking, { bookingId }))!, resourceId: seed.resourceId };
    },
    bundle: async () => ({
      booking: await t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId,
        resources: [{ resourceId: seed.resourceId }, { resourceId: "pool-1", quantity: 2 }],
        start,
        end,
        timezone: "UTC",
        booker: BOOKER,
        location: LOCATION,
      }),
      resourceId: seed.resourceId,
    }),
  };
  return { seed, create };
}

type RowKind = "confirmed" | "pending" | "provisional" | "legacy" | "bundle";
const ROW_KINDS: RowKind[] = ["confirmed", "pending", "provisional", "legacy", "bundle"];

/** 10:00–11:00 UTC as slot indices. */
const TEN_TO_ELEVEN = range(40, 44);

// ============================================
// cancelReservation
// ============================================

describe("cancelReservation records the cancellation", () => {
  test.each(ROW_KINDS)("%s row: one history row, cancelledAt and updatedAt at T1, inventory released", async (kind) => {
    const { t } = setup({ now: T0 });
    const { create } = await seedWorld(t);
    const { booking, resourceId } = await create[kind]();
    const before = await lifecycleOf(t, booking._id);
    // CONTROL: the row holds its inventory and carries no cancellation yet.
    expect(await getBusySlots(t, resourceId, TUESDAY)).toEqual(TEN_TO_ELEVEN);
    expect(await poolUnits(t)).toEqual(
      kind === "bundle" ? Object.fromEntries(TEN_TO_ELEVEN.map((slot) => [String(slot), 2])) : {}
    );
    expect(before.cancelledAt).toBeUndefined();
    expect(before.updatedAt).toBe(T0);

    vi.setSystemTime(T1);
    expect(await t.mutation(api.public.cancelReservation, { reservationId: booking._id })).toEqual({
      success: true,
      alreadyCancelled: false,
    });

    expect(await lifecycleOf(t, booking._id)).toEqual({
      status: "cancelled",
      cancelledAt: T1,
      updatedAt: T1,
      cancellationReason: undefined,
      history: [
        ...before.history,
        { from: booking.status, to: "cancelled", by: "unknown", reason: undefined, at: T1 },
      ],
    });
    expect(await getBusySlots(t, resourceId, TUESDAY)).toEqual([]);
    expect(await poolUnits(t)).toEqual({});
  });

  test("reason and cancelledBy reach the row, the history and the email context; the hook payload keeps its v1 keys", async () => {
    const { t } = setup({ now: T0 });
    const { seed, create } = await seedWorld(t);
    const plain = (await create.confirmed()).booking;
    await t.mutation(api.public.cancelReservation, { reservationId: plain._id });
    const withReason = await book(t, seed, at("12:00"), at("13:00"));

    vi.setSystemTime(T1);
    await t.mutation(api.public.cancelReservation, {
      reservationId: withReason._id,
      reason: "Double booked",
      cancelledBy: "admin-1",
    });

    const after = await lifecycleOf(t, withReason._id);
    expect(after.cancellationReason).toBe("Double booked");
    expect(after.history[after.history.length - 1]).toEqual({
      from: "confirmed",
      to: "cancelled",
      by: "admin-1",
      reason: "Double booked",
      at: T1,
    });
    const [job] = await hookJobs(t, "booking.cancelled", withReason._id);
    const [plainJob] = await hookJobs(t, "booking.cancelled", plain._id);
    expect(job.emailContext.reason).toBe("Double booked");
    // CONTROL: without a reason the email context carries none.
    expect(plainJob.emailContext.reason).toBeUndefined();
    // The v1 payload of cancelReservation has no reason key, with or without one.
    expect(Object.keys(job.payload).sort()).toEqual(Object.keys(plainJob.payload).sort());
    expect(job.payload).not.toHaveProperty("reason");
  });

  test("a repeated cancel is idempotent: no history row, no timestamps, no hook", async () => {
    const { t } = setup({ now: T0 });
    const { create } = await seedWorld(t);
    const { booking } = await create.confirmed();
    vi.setSystemTime(T1);
    await t.mutation(api.public.cancelReservation, { reservationId: booking._id, reason: "first" });
    const first = await lifecycleOf(t, booking._id);

    vi.setSystemTime(T1 + HOUR);
    expect(
      await t.mutation(api.public.cancelReservation, { reservationId: booking._id, reason: "second" })
    ).toEqual({ success: true, alreadyCancelled: true });

    expect(await lifecycleOf(t, booking._id)).toEqual(first);
    expect(first.cancellationReason).toBe("first");
    expect(await hookJobs(t, "booking.cancelled", booking._id)).toHaveLength(1);
  });

  test("completed and declined rows are still rejected", async () => {
    const { t } = setup({ now: T0 });
    const { create } = await seedWorld(t);
    const completed = (await create.confirmed()).booking;
    await t.mutation(api.hooks.transitionBookingState, { bookingId: completed._id, toStatus: "completed" });
    const declined = (await create.pending()).booking;
    await t.mutation(api.hooks.transitionBookingState, { bookingId: declined._id, toStatus: "declined" });
    const history = async () => [
      ...(await t.query(api.hooks.getBookingHistory, { bookingId: completed._id })),
      ...(await t.query(api.hooks.getBookingHistory, { bookingId: declined._id })),
    ];
    const rows = (await history()).length;

    await expect(
      t.mutation(api.public.cancelReservation, { reservationId: completed._id })
    ).rejects.toThrow("Cannot cancel booking with status: completed");
    await expect(
      t.mutation(api.public.cancelReservation, { reservationId: declined._id })
    ).rejects.toThrow("Cannot cancel booking with status: declined");
    expect(await history()).toHaveLength(rows);
  });
});

// ============================================
// rescheduleBooking actor
// ============================================

describe("rescheduleBooking records its actor", () => {
  const actors = async (t: T, bookingId: Id<"bookings">) =>
    (await t.query(api.hooks.getBookingHistory, { bookingId })).map(
      (row) => `${row.fromStatus}->${row.toStatus}:${row.changedBy}`
    );

  test("changedBy lands on the original's cancellation and the successor's creation row", async () => {
    const { t } = setup({ now: T0 });
    const { seed } = await seedWorld(t);
    const original = await book(t, seed, at("09:00"), at("10:00"));
    const successor = await t.mutation(api.public.rescheduleBooking, {
      bookingId: original._id,
      newStart: at("14:00"),
      newEnd: at("15:00"),
      reason: "Moved by admin",
      changedBy: "admin-1",
    });
    expect(await actors(t, original._id)).toEqual(["->confirmed:system", "confirmed->cancelled:admin-1"]);
    expect(await actors(t, successor._id)).toEqual(["->confirmed:admin-1"]);
  });

  test("CONTROL: without changedBy (and by token) the actor stays \"system\"", async () => {
    const { t } = setup({ now: T0 });
    const { seed } = await seedWorld(t);
    const byId = await book(t, seed, at("09:00"), at("10:00"));
    const byToken = await book(t, seed, at("10:00"), at("11:00"));
    const movedById = await t.mutation(api.public.rescheduleBooking, {
      bookingId: byId._id,
      newStart: at("14:00"),
      newEnd: at("15:00"),
    });
    const movedByToken = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: byToken.uid,
      token: byToken.managementToken!,
      newStart: at("15:00"),
      newEnd: at("16:00"),
    });
    expect(await actors(t, byId._id)).toEqual(["->confirmed:system", "confirmed->cancelled:system"]);
    expect(await actors(t, movedById._id)).toEqual(["->confirmed:system"]);
    expect(await actors(t, byToken._id)).toEqual(["->confirmed:system", "confirmed->cancelled:system"]);
    expect(await actors(t, movedByToken._id)).toEqual(["->confirmed:system"]);
  });
});

// ============================================
// PARITY ACROSS CANCEL-LIKE PATHS
// ============================================

type Extra = { reason?: string; actor?: string };
type CancelPath = {
  /** Row kinds the path accepts (bundles hold a pool quantity too). */
  kinds: RowKind[];
  to: "cancelled" | "declined";
  run: (t: T, booking: Doc<"bookings">, extra: Extra) => Promise<unknown>;
  /** History actor and reason when the caller passes none (pinned per path). */
  defaults: { by: string | undefined; reason: string | undefined };
};

const CANCEL_PATHS: Record<string, CancelPath> = {
  cancelReservation: {
    kinds: ["confirmed", "bundle"],
    to: "cancelled",
    run: (t, booking, { reason, actor }) =>
      t.mutation(api.public.cancelReservation, { reservationId: booking._id, reason, cancelledBy: actor }),
    defaults: { by: "unknown", reason: undefined },
  },
  cancelBookingByToken: {
    kinds: ["confirmed", "bundle"],
    to: "cancelled",
    run: (t, booking, { reason }) =>
      t.mutation(api.public.cancelBookingByToken, { uid: booking.uid, token: booking.managementToken!, reason }),
    defaults: { by: "user", reason: "Cancelled by booker" },
  },
  cancelMultiResourceBooking: {
    kinds: ["confirmed", "bundle"],
    to: "cancelled",
    run: (t, booking, { reason, actor }) =>
      t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id, reason, cancelledBy: actor }),
    defaults: { by: "unknown", reason: undefined },
  },
  "transitionBookingState -> cancelled": {
    kinds: ["confirmed", "bundle"],
    to: "cancelled",
    run: (t, booking, { reason, actor }) =>
      t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus: "cancelled", reason, changedBy: actor }),
    defaults: { by: undefined, reason: undefined },
  },
  "transitionBookingState -> declined": {
    kinds: ["pending"],
    to: "declined",
    run: (t, booking, { reason, actor }) =>
      t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus: "declined", reason, changedBy: actor }),
    defaults: { by: undefined, reason: undefined },
  },
  expireProvisionalBooking: {
    kinds: ["provisional"],
    to: "cancelled",
    run: (t, booking, { reason }) => t.mutation(api.public.expireProvisionalBooking, { bookingId: booking._id, reason }),
    defaults: { by: "system", reason: "Provisional booking expired" },
  },
  "rescheduleBooking (original)": {
    kinds: ["confirmed", "bundle"],
    to: "cancelled",
    run: (t, booking, { reason, actor }) =>
      t.mutation(api.public.rescheduleBooking, {
        bookingId: booking._id,
        newStart: at("14:00"),
        newEnd: at("15:00"),
        reason,
        changedBy: actor,
      }),
    defaults: { by: "system", reason: "Rescheduled to new time" },
  },
};

const PATH_CASES = Object.entries(CANCEL_PATHS).flatMap(([name, path]) =>
  path.kinds.map((kind) => [name, kind] as const)
);

describe("every cancel-like path ends a booking the same way", () => {
  test.each(PATH_CASES)("%s on a %s row", async (name, kind) => {
    const path = CANCEL_PATHS[name];
    const { t } = setup({ now: T0 });
    const { create } = await seedWorld(t);
    const { booking, resourceId } = await create[kind]();
    const before = await lifecycleOf(t, booking._id);
    // CONTROL: 10:00–11:00 is held (bundles: two pool units as well).
    expect(await getBusySlots(t, resourceId, TUESDAY)).toEqual(TEN_TO_ELEVEN);

    vi.setSystemTime(T1);
    await path.run(t, booking, {});

    expect(await lifecycleOf(t, booking._id)).toEqual({
      status: path.to,
      cancelledAt: T1,
      updatedAt: T1,
      cancellationReason: path.defaults.reason,
      history: [
        ...before.history,
        { from: booking.status, to: path.to, by: path.defaults.by, reason: path.defaults.reason, at: T1 },
      ],
    });
    // The booking's own slots and pool units are free (a move holds 14:00–15:00 instead).
    const busy = (await getBusySlots(t, resourceId, TUESDAY)) ?? [];
    expect(busy.filter((slot) => TEN_TO_ELEVEN.includes(slot))).toEqual([]);
    const units = await poolUnits(t);
    expect(TEN_TO_ELEVEN.map((slot) => units[String(slot)] ?? 0)).toEqual([0, 0, 0, 0]);
  });

  test("given the same reason and actor, the four paths that take both record the same metadata", async () => {
    const { t } = setup({ now: T0 });
    const { seed } = await seedWorld(t);
    const names = [
      "cancelReservation",
      "cancelMultiResourceBooking",
      "transitionBookingState -> cancelled",
      "rescheduleBooking (original)",
    ];
    const results: Record<string, unknown> = {};
    for (const [i, name] of names.entries()) {
      vi.setSystemTime(T0);
      const booking = await book(t, seed, at(`0${i + 5}:00`), at(`0${i + 6}:00`));
      vi.setSystemTime(T1);
      await CANCEL_PATHS[name].run(t, booking, { reason: "Room closed", actor: "admin-1" });
      const { history, ...row } = await lifecycleOf(t, booking._id);
      results[name] = { ...row, last: history[history.length - 1] };
    }
    const expected = {
      status: "cancelled",
      cancelledAt: T1,
      updatedAt: T1,
      cancellationReason: "Room closed",
      last: { from: "confirmed", to: "cancelled", by: "admin-1", reason: "Room closed", at: T1 },
    };
    expect(results).toEqual(Object.fromEntries(names.map((name) => [name, expected])));
  });
});
