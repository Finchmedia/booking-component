/**
 * 0.5.0 booking rules (F6 with the owner's D5 decisions, F7 mismatch D6,
 * N13; plan PR-51, PR-52).
 *
 * One rule set for createBooking, createProvisionalBooking,
 * createMultiResourceBooking (per item), rescheduleBooking and
 * rescheduleBookingByToken (destination over all items, before anything is
 * released; no admin override), confirmations (pending or provisional ->
 * confirmed) and submitting a hold as a request (provisional -> pending):
 * the event type exists and is active; every resource exists, is active, is
 * linked and shares an organization-scoped event type's organization, and
 * all of them share one organization; one of them is standalone.
 * Cancelling, declining and expiry never check, and deactivation never ends
 * a booking. Legacy createReservation rows keep the legacy rules.
 *
 * Converted from the verification probes lc/zz-cv-lc-f6 and
 * lc-skeptic/zz-cv-lcs-counter, which pinned the 0.4.x divergence. A
 * rejection is a thrown ConvexError; the unchanged-state checks are sanity
 * checks, since Convex rolls a failed mutation back.
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import type { BookingErrorData } from "../shared/booking-errors.js";
import type { BookingStatus } from "../shared/booking-status.js";
import {
  BOOKER,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  getBusySlots,
  range,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type SeededResource,
  type T,
} from "./setup.test.js";

const hour = (h: number) => utc(TUESDAY, `${String(h).padStart(2, "0")}:00`);

/** "ok" (with the status of a returned booking), or the rejection's code and message. */
async function outcome(call: Promise<unknown>): Promise<string | BookingErrorData> {
  try {
    const result = await call;
    return result !== null && typeof result === "object" && "status" in result ? `ok: ${String(result.status)}` : "ok";
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    return (error as ConvexError<BookingErrorData>).data;
  }
}

async function room(t: T, id: string, extra: { organizationId?: string; isStandalone?: boolean; link?: string } = {}) {
  await t.mutation(api.resources.createResource, {
    id, organizationId: extra.organizationId ?? ORG, name: id, type: "room", timezone: "UTC",
    isStandalone: extra.isStandalone,
  });
  if (extra.link) {
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: id, eventTypeId: extra.link });
  }
}

function bundle(t: T, s: SeededResource, resourceIds: Array<string | { resourceId: string; quantity: number }>, h: number) {
  return t.mutation(api.multi_resource.createMultiResourceBooking, {
    eventTypeId: s.eventTypeId,
    resources: resourceIds.map((r) => (typeof r === "string" ? { resourceId: r } : r)),
    start: hour(h),
    end: hour(h + 1),
    timezone: "UTC",
    booker: BOOKER,
    location: LOCATION,
  });
}

/** Everything a rejected move or confirmation must leave as it was. */
async function snapshot(t: T) {
  return await t.run(async (ctx) => ({
    bookings: (await ctx.db.query("bookings").collect()).map((b) => `${b.uid}:${b.status}:${b.start}`),
    items: (await ctx.db.query("booking_items").collect()).length,
    history: (await ctx.db.query("booking_history").collect()).length,
    busy: (await ctx.db.query("daily_availability").collect()).map((row) => `${row.resourceId}@${row.date}:${row.busySlots.join(",")}`),
    quantities: (await ctx.db.query("quantity_availability").collect()).map((row) => JSON.stringify(row.slotQuantities)),
    jobs: (await ctx.db.system.query("_scheduled_functions").collect()).length,
  }));
}

describe("bundles: every item follows the booking rules (F6 a, b)", () => {
  test("an add-on needs an eligible standalone companion; unknown ids are rejected", async () => {
    const { t } = setup();
    const s = await seedResource(t); // res-1: standalone room, linked
    await room(t, "addon", { isStandalone: false, link: s.eventTypeId });
    await room(t, "room-inactive", { link: s.eventTypeId });
    await t.mutation(api.resources.toggleResourceActive, { id: "room-inactive", isActive: false });
    await room(t, "room-unlinked");
    await room(t, "room-other-org", { organizationId: "org-2" });
    // Linked as 0.4.x allowed, so only the organization differs.
    await t.run((ctx) => ctx.db.insert("resource_event_types", { resourceId: "room-other-org", eventTypeId: s.eventTypeId }));

    expect({
      addonAlone: await outcome(bundle(t, s, ["addon"], 8)),
      addonPlusGhost: await outcome(bundle(t, s, ["addon", "no-such-resource"], 10)),
      addonPlusInactiveRoom: await outcome(bundle(t, s, ["addon", "room-inactive"], 11)),
      addonPlusUnlinkedRoom: await outcome(bundle(t, s, ["addon", "room-unlinked"], 12)),
      addonPlusOtherOrgRoom: await outcome(bundle(t, s, ["addon", "room-other-org"], 13)),
      addonPlusLinkedRoom: await outcome(bundle(t, s, ["addon", s.resourceId], 9)),
    }).toEqual({
      addonAlone: {
        code: "RESOURCE_NOT_STANDALONE",
        message: 'Resource "addon" cannot be booked alone (isStandalone: false): add a standalone resource to the booking',
      },
      addonPlusGhost: { code: "RESOURCE_NOT_FOUND", message: 'Resource "no-such-resource" not found' },
      addonPlusInactiveRoom: { code: "RESOURCE_INACTIVE", message: 'Resource "room-inactive" is no longer active' },
      addonPlusUnlinkedRoom: { code: "RESOURCE_NOT_LINKED", message: 'Resource "room-unlinked" is not available for this event type' },
      addonPlusOtherOrgRoom: {
        code: "ORGANIZATION_MISMATCH",
        message: 'Resource "room-other-org" belongs to another organization than the event type',
      },
      addonPlusLinkedRoom: "ok: confirmed", // CONTROL: the intended use
    });
    // The unknown id got no phantom one-unit row, and no rejected bundle holds anything.
    expect(await getBusySlots(t, "no-such-resource", TUESDAY)).toBeNull();
    expect(await getBusySlots(t, "addon", TUESDAY)).toEqual(range(36, 40));
  });

  test("the primary may still be an add-on (resources[0]) when a standalone item is present", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await room(t, "addon", { isStandalone: false, link: s.eventTypeId });
    const addonFirst = await bundle(t, s, ["addon", s.resourceId], 9);
    expect([addonFirst.status, addonFirst.resourceId]).toEqual(["confirmed", "addon"]);
    // The re-check on a move reads every item, not only the primary.
    const moved = await t.mutation(api.public.rescheduleBooking, { bookingId: addonFirst._id, newStart: hour(11), newEnd: hour(12) });
    expect([moved.status, moved.resourceId]).toEqual(["confirmed", "addon"]);
  });

  test("a pool is a bundle item like any other: it must be linked", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await seedFungibleResource(t, { resourceId: "pool-1", quantity: 3 });
    expect(await outcome(bundle(t, s, [s.resourceId, { resourceId: "pool-1", quantity: 2 }], 9))).toEqual({
      code: "RESOURCE_NOT_LINKED",
      message: 'Resource "pool-1" is not available for this event type',
    });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "pool-1", eventTypeId: s.eventTypeId });
    expect(await outcome(bundle(t, s, [s.resourceId, { resourceId: "pool-1", quantity: 2 }], 9))).toBe("ok: confirmed");
  });

  test("an inactive event type rejects bundles as it rejects single bookings", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await t.mutation(api.public.toggleEventTypeActive, { id: s.eventTypeId, isActive: false });
    expect(await outcome(bundle(t, s, [s.resourceId], 9))).toEqual({
      code: "EVENT_TYPE_INACTIVE",
      message: 'Event type "et-1" is no longer active',
    });
    expect(await getBusySlots(t, s.resourceId, TUESDAY)).toBeNull();
  });
});

describe("moves re-check the destination by token and by id (F6 c: no admin override)", () => {
  type Condition = "eventInactive" | "resourceInactive" | "unlinked";
  const apply = async (t: T, s: SeededResource, c: Condition) => {
    if (c === "eventInactive") await t.mutation(api.public.toggleEventTypeActive, { id: s.eventTypeId, isActive: false });
    if (c === "resourceInactive") await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });
    if (c === "unlinked") {
      await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: s.resourceId, eventTypeId: s.eventTypeId });
    }
  };
  const EXPECTED: Record<Condition, BookingErrorData> = {
    eventInactive: { code: "EVENT_TYPE_INACTIVE", message: "Event type is no longer active" },
    resourceInactive: { code: "RESOURCE_INACTIVE", message: "Resource is no longer active" },
    unlinked: { code: "RESOURCE_NOT_LINKED", message: "Resource is not available for this event type" },
  };

  test.each(Object.keys(EXPECTED) as Condition[])("single booking, %s: both moves rejected, nothing released", async (c) => {
    const { t } = setup();
    const s = await seedResource(t);
    const a = await book(t, s, hour(8), hour(9));
    const b = await book(t, s, hour(9), hour(10));
    await apply(t, s, c);
    const before = await snapshot(t);

    expect({
      rescheduleBooking: await outcome(t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: hour(12), newEnd: hour(13) })),
      rescheduleBookingByToken: await outcome(t.mutation(api.public.rescheduleBookingByToken, {
        uid: b.uid, token: b.managementToken!, newStart: hour(14), newEnd: hour(15),
      })),
      // An overlapping move would reuse its own slots; still rejected.
      overlapping: await outcome(t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: hour(8) + 1_800_000, newEnd: hour(9) + 1_800_000 })),
    }).toEqual({ rescheduleBooking: EXPECTED[c], rescheduleBookingByToken: EXPECTED[c], overlapping: EXPECTED[c] });
    // Originals, inventory, history and scheduled hooks/mail unchanged.
    expect(await snapshot(t)).toEqual(before);
    expect(await getBusySlots(t, s.resourceId, TUESDAY)).toEqual(range(32, 40));
  });

  test("a wrong or missing token is still rejected first and changes nothing", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    const b = await book(t, s, hour(9), hour(10));
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });
    const before = await snapshot(t);
    for (const token of ["wrong", ""]) {
      expect(await outcome(t.mutation(api.public.rescheduleBookingByToken, { uid: b.uid, token, newStart: hour(14), newEnd: hour(15) })))
        .toEqual({ code: "INVALID_TOKEN", message: "Invalid token" });
    }
    expect(await snapshot(t)).toEqual(before);
  });

  test("a bundle is re-checked over all its items", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await room(t, "addon", { isStandalone: false, link: s.eventTypeId });
    await seedFungibleResource(t, { resourceId: "pool-1", eventTypeId: s.eventTypeId });
    const withAddon = await bundle(t, s, [s.resourceId, "addon"], 8);
    const withPool = await bundle(t, s, [s.resourceId, { resourceId: "pool-1", quantity: 2 }], 10);

    // The add-on is a secondary item: unlinking it blocks the move although the primary is fine.
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: "addon", eventTypeId: s.eventTypeId });
    expect(await outcome(t.mutation(api.public.rescheduleBooking, { bookingId: withAddon._id, newStart: hour(12), newEnd: hour(13) })))
      .toEqual({ code: "RESOURCE_NOT_LINKED", message: 'Resource "addon" is not available for this event type' });
    // CONTROL: the pool bundle, whose items are all eligible, still moves.
    const moved = await t.mutation(api.public.rescheduleBooking, { bookingId: withPool._id, newStart: hour(12), newEnd: hour(13) });
    expect(moved.status).toBe("confirmed");

    // Its only standalone room deactivated: rejected, pool units kept.
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });
    const before = await snapshot(t);
    expect(await outcome(t.mutation(api.public.rescheduleBookingByToken, {
      uid: moved.uid, token: moved.managementToken!, newStart: hour(14), newEnd: hour(15),
    }))).toEqual({ code: "RESOURCE_INACTIVE", message: 'Resource "res-1" is no longer active' });
    expect(await snapshot(t)).toEqual(before);
  });

  test("after reactivation the same move succeeds (control)", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    const a = await book(t, s, hour(8), hour(9));
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });
    await expect(t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: hour(12), newEnd: hour(13) })).rejects.toThrow();
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: true });
    expect((await t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: hour(12), newEnd: hour(13) })).status).toBe("confirmed");
  });
});

describe("confirmations and requests re-check the rules; endings never do (F6 e)", () => {
  function provisional(t: T, s: SeededResource, h: number) {
    return t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: s.eventTypeId, resourceId: s.resourceId, start: hour(h), end: hour(h + 1),
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
  }
  const transition = (t: T, booking: Doc<"bookings">, toStatus: BookingStatus) =>
    outcome(t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus, changedBy: "admin" }));

  test("provisional -> confirmed after the event type was deactivated is rejected; cancel and expiry still work", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    const hold = await provisional(t, s, 9);
    const toCancel = await provisional(t, s, 11);
    const toExpire = await provisional(t, s, 13);
    const toPending = await provisional(t, s, 15);
    await t.mutation(api.public.toggleEventTypeActive, { id: s.eventTypeId, isActive: false });
    const before = await snapshot(t);

    expect(await transition(t, hold, "confirmed")).toEqual({ code: "EVENT_TYPE_INACTIVE", message: "Event type is no longer active" });
    // Submitting the hold as a request completes it too: rejected (0.5.0 review).
    expect(await transition(t, toPending, "pending")).toEqual({ code: "EVENT_TYPE_INACTIVE", message: "Event type is no longer active" });
    expect(await snapshot(t)).toEqual(before);
    expect({
      cancel: await transition(t, toCancel, "cancelled"),
      expire: await outcome(t.mutation(api.public.expireProvisionalBooking, { bookingId: toExpire._id })),
    }).toEqual({ cancel: "ok", expire: "ok" });

    // CONTROL: reactivated, the hold can be confirmed and the other submitted.
    await t.mutation(api.public.toggleEventTypeActive, { id: s.eventTypeId, isActive: true });
    expect(await transition(t, hold, "confirmed")).toBe("ok");
    expect(await transition(t, toPending, "pending")).toBe("ok");
  });

  test("provisional -> pending is re-checked: no booking.pending hook or awaiting-confirmation mail for a request that cannot be approved", async () => {
    const { t } = setup();
    const s = await seedResource(t, { requiresConfirmation: true });
    const hold = await provisional(t, s, 9);
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: s.resourceId, eventTypeId: s.eventTypeId });
    const before = await snapshot(t);

    expect(await transition(t, hold, "pending")).toEqual({
      code: "RESOURCE_NOT_LINKED",
      message: "Resource is not available for this event type",
    });
    // Status, history and scheduled jobs (the triggerHooks job that sends the mail) unchanged.
    expect(await snapshot(t)).toEqual(before);
    expect((await t.query(api.public.getBooking, { bookingId: hold._id }))?.status).toBe("provisional");

    // CONTROL: relinked, the request is submitted and its triggerHooks job queued.
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: s.resourceId, eventTypeId: s.eventTypeId });
    expect(await transition(t, hold, "pending")).toBe("ok");
    const jobs = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())) as unknown as Array<{
      name?: string;
      args: Array<{ eventType?: string }>;
    }>;
    expect(jobs.filter((job) => job.name?.includes("triggerHooks")).map((job) => job.args[0].eventType)).toEqual(["booking.pending"]);
  });

  test("approving a pending request after the resource was deactivated is rejected; declining works", async () => {
    const { t } = setup();
    const s = await seedResource(t, { requiresConfirmation: true });
    const pending = await book(t, s, hour(9), hour(10));
    const other = await book(t, s, hour(11), hour(12));
    expect(pending.status).toBe("pending");
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });

    expect(await transition(t, pending, "confirmed")).toEqual({ code: "RESOURCE_INACTIVE", message: "Resource is no longer active" });
    expect((await t.query(api.public.getBooking, { bookingId: pending._id }))?.status).toBe("pending");
    expect(await transition(t, other, "declined")).toBe("ok");
    expect(await getBusySlots(t, s.resourceId, TUESDAY)).toEqual(range(36, 40)); // the pending one still holds its slots
  });

  test("a pending bundle is re-checked over its items on approval", async () => {
    const { t } = setup();
    const s = await seedResource(t, { requiresConfirmation: true });
    await room(t, "addon", { isStandalone: false, link: s.eventTypeId });
    const pending = await bundle(t, s, [s.resourceId, "addon"], 9);
    expect(pending.status).toBe("pending");
    await t.mutation(api.resources.toggleResourceActive, { id: "addon", isActive: false });
    expect(await transition(t, pending, "confirmed")).toEqual({ code: "RESOURCE_INACTIVE", message: 'Resource "addon" is no longer active' });
  });

  test("deactivation ends no booking", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    const confirmed = await book(t, s, hour(9), hour(10));
    await t.mutation(api.resources.toggleResourceActive, { id: s.resourceId, isActive: false });
    await t.mutation(api.public.toggleEventTypeActive, { id: s.eventTypeId, isActive: false });
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: s.resourceId, eventTypeId: s.eventTypeId });
    expect((await t.query(api.public.getBooking, { bookingId: confirmed._id }))?.status).toBe("confirmed");
    expect(await getBusySlots(t, s.resourceId, TUESDAY)).toEqual(range(36, 40));
    // Cancelling it is allowed.
    expect(await outcome(t.mutation(api.public.cancelBookingByToken, { uid: confirmed.uid, token: confirmed.managementToken! }))).toBe("ok");
  });
});

describe("legacy createReservation keeps the legacy rules", () => {
  test("an unknown resource is reserved, and the row can be moved by id", async () => {
    const { t } = setup();
    const reservationId = await t.mutation(api.public.createReservation, {
      resourceId: "legacy-room", actorId: "ops@example.com", start: hour(9), end: hour(10),
    });
    const moved = await t.mutation(api.public.rescheduleBooking, { bookingId: reservationId, newStart: hour(11), newEnd: hour(12) });
    expect([moved.status, moved.eventTypeId]).toEqual(["confirmed", "legacy"]);
    expect(await getBusySlots(t, "legacy-room", TUESDAY)).toEqual(range(44, 48));
  });
});
