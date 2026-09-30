/**
 * Frozen entry-point error texts (N3) — change only deliberately.
 *
 * Every expected failure is a plain `Error` whose message hosts match by
 * substring (the reference host maps "Time slot no longer available",
 * "Event type not found", "Resource is not available for this event type", …
 * to its own codes). The same condition deliberately keeps a different text
 * per entry point, and the order of the checks decides which text a request
 * with several problems gets. A failing test here is a host-visible change:
 * update the expectation only together with a CHANGELOG note.
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const at = (time: string) => utc(TUESDAY, time);
const hour = (time: string) => ({ start: at(time), end: at(time) + 3_600_000 });

/** The rejection message of a call, or a marker when it unexpectedly succeeds. */
async function failureOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    // Hosts parse plain Error messages; a ConvexError would change what they see.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConvexError);
    return (error as Error).message;
  }
  return "(resolved)";
}

async function failuresOf(cases: Record<string, () => Promise<unknown>>) {
  const messages: Record<string, string> = {};
  for (const [name, call] of Object.entries(cases)) messages[name] = await failureOf(call());
  return messages;
}

/**
 * res-1 + et-1 (linked) plus one resource or event type per failure condition,
 * and bookings that occupy 09:00, 11:00 (whole pool) and 13:00 (add-on).
 */
async function seedWorld(t: T) {
  const seed = await seedResource(t);
  const resource = (id: string, extra: { isActive?: boolean; isStandalone?: boolean } = {}) =>
    t.mutation(api.resources.createResource, {
      id, organizationId: ORG, name: id, type: "room", timezone: "UTC", ...extra,
    });
  const link = (resourceId: string, eventTypeId = seed.eventTypeId) =>
    t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId, eventTypeId });

  await resource("res-off", { isActive: false });
  await resource("addon-1", { isStandalone: false });
  await resource("addon-off", { isStandalone: false, isActive: false });
  await resource("addon-unlinked", { isStandalone: false });
  await resource("res-unlinked");
  for (const id of ["res-off", "addon-1"]) await link(id);
  await seedFungibleResource(t, { eventTypeId: seed.eventTypeId }); // pool-1, capacity 3
  await t.mutation(api.public.createEventType, {
    id: "et-off", slug: "et-off", title: "Retired", lengthInMinutes: 60, timezone: "UTC",
    lockTimeZoneToggle: false, locations: [], organizationId: ORG, isActive: false,
  });
  await link(seed.resourceId, "et-off");

  const bundle = (resources: Array<{ resourceId: string; quantity?: number }>, time: string) =>
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId, organizationId: ORG, resources, ...hour(time),
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    });

  const occupying = await book(t, seed, at("09:00"), at("10:00"));
  const movable = await book(t, seed, at("10:00"), at("11:00"));
  await bundle([{ resourceId: "pool-1", quantity: 3 }], "11:00");
  const pooled = await bundle([{ resourceId: "pool-1", quantity: 1 }], "12:00");
  await bundle([{ resourceId: seed.resourceId }, { resourceId: "addon-1" }], "13:00");
  await t.mutation(api.public.createReservation, {
    resourceId: "res-unlinked", actorId: "legacy@example.com", ...hour("09:00"),
  });
  return { seed, bundle, occupying, movable, pooled };
}

describe("error texts per entry point", () => {
  test("slot conflict: the text depends on the entry point", async () => {
    const { t } = setup();
    const { seed, bundle, occupying, movable, pooled } = await seedWorld(t);
    expect(occupying.status).toBe("confirmed"); // CONTROL: 09:00 is taken

    const single = { eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, ...hour("09:00"), timezone: "UTC", booker: BOOKER, location: LOCATION };
    expect(await failuresOf({
      createBooking: () => t.mutation(api.public.createBooking, single),
      createProvisionalBooking: () => t.mutation(api.public.createProvisionalBooking, single),
      createReservation: () => t.mutation(api.public.createReservation, { resourceId: seed.resourceId, actorId: "x@example.com", ...hour("09:00") }),
      "createMultiResourceBooking (exclusive)": () => bundle([{ resourceId: seed.resourceId }], "09:00"),
      "createMultiResourceBooking (pool)": () => bundle([{ resourceId: "pool-1", quantity: 1 }], "11:00"),
      rescheduleBooking: () => t.mutation(api.public.rescheduleBooking, { bookingId: movable._id, newStart: at("09:00"), newEnd: at("10:00") }),
      rescheduleBookingByToken: () => t.mutation(api.public.rescheduleBookingByToken, { uid: movable.uid, token: movable.managementToken!, newStart: at("09:00"), newEnd: at("10:00") }),
      "rescheduleBooking (pool bundle)": () => t.mutation(api.public.rescheduleBooking, { bookingId: pooled._id, newStart: at("11:00"), newEnd: at("12:00") }),
    })).toEqual({
      createBooking: "Time slot no longer available",
      createProvisionalBooking: "Time slot no longer available",
      createReservation: "Resource is not available for the requested time range.",
      "createMultiResourceBooking (exclusive)": 'Resource "res-1" is not available for the selected time',
      "createMultiResourceBooking (pool)": 'Resource "pool-1" is not available for the requested quantity',
      rescheduleBooking: 'Resource "res-1" is not available for the selected time',
      rescheduleBookingByToken: 'Resource "res-1" is not available for the selected time',
      "rescheduleBooking (pool bundle)": 'Resource "pool-1" is not available for the requested quantity',
    });
  });

  test("missing, inactive and unlinked event types and resources", async () => {
    const { t } = setup();
    const { seed, bundle } = await seedWorld(t);
    const single = (eventTypeId: string, resourceId: string) => ({
      eventTypeId, resourceId, ...hour("15:00"), timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
    const both = (name: string, eventTypeId: string, resourceId: string) => ({
      [`createBooking: ${name}`]: () => t.mutation(api.public.createBooking, single(eventTypeId, resourceId)),
      [`createProvisionalBooking: ${name}`]: () => t.mutation(api.public.createProvisionalBooking, single(eventTypeId, resourceId)),
    });
    // CONTROL: the same request on res-1 + et-1 succeeds.
    await expect(t.mutation(api.public.createBooking, single(seed.eventTypeId, seed.resourceId))).resolves.toMatchObject({ status: "confirmed" });

    expect(await failuresOf({
      "getEventType: missing event": () => t.query(api.public.getEventType, { eventTypeId: "ghost" }),
      ...both("missing event", "ghost", seed.resourceId),
      "createMultiResourceBooking: missing event": () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: "ghost", resources: [{ resourceId: seed.resourceId }], ...hour("16:00"),
          timezone: "UTC", booker: BOOKER,
        }),
      "updateEventType: missing event": () => t.mutation(api.public.updateEventType, { id: "ghost", title: "x" }),
      "deleteEventType: missing event": () => t.mutation(api.public.deleteEventType, { id: "ghost" }),
      "toggleEventTypeActive: missing event": () => t.mutation(api.public.toggleEventTypeActive, { id: "ghost", isActive: true }),
      "linkResourceToEventType: missing event": () =>
        t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: seed.resourceId, eventTypeId: "ghost" }),
      ...both("inactive event", "et-off", seed.resourceId),
      ...both("missing resource", seed.eventTypeId, "ghost-res"),
      "linkResourceToEventType: missing resource": () =>
        t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "ghost-res", eventTypeId: seed.eventTypeId }),
      ...both("inactive resource", seed.eventTypeId, "res-off"),
      ...both("add-on alone", seed.eventTypeId, "addon-1"),
      "createMultiResourceBooking: add-on alone": () => bundle([{ resourceId: "addon-1" }], "16:00"),
      ...both("not linked", seed.eventTypeId, "res-unlinked"),
      ...both("pool on the single-resource path", seed.eventTypeId, "pool-1"),
      "createReservation: pool on the single-resource path": () =>
        t.mutation(api.public.createReservation, { resourceId: "pool-1", actorId: "x@example.com", ...hour("16:00") }),
    })).toEqual({
      "getEventType: missing event": "Event type not found: ghost",
      "createBooking: missing event": "Event type not found",
      "createProvisionalBooking: missing event": "Event type not found",
      "createMultiResourceBooking: missing event": 'Event type "ghost" not found',
      "updateEventType: missing event": 'Event type "ghost" not found',
      "deleteEventType: missing event": 'Event type "ghost" not found',
      "toggleEventTypeActive: missing event": 'Event type "ghost" not found',
      "linkResourceToEventType: missing event": 'Event type "ghost" not found',
      "createBooking: inactive event": "Event type is no longer active",
      "createProvisionalBooking: inactive event": "Event type is no longer active",
      "createBooking: missing resource": "Resource not found",
      "createProvisionalBooking: missing resource": "Resource not found",
      "linkResourceToEventType: missing resource": 'Resource "ghost-res" not found',
      "createBooking: inactive resource": "Resource is no longer active",
      "createProvisionalBooking: inactive resource": "Resource is no longer active",
      "createBooking: add-on alone": 'Resource "addon-1" cannot be booked alone (isStandalone: false)',
      "createProvisionalBooking: add-on alone": 'Resource "addon-1" cannot be booked alone (isStandalone: false)',
      "createMultiResourceBooking: add-on alone":
        'Resource "addon-1" cannot be booked alone (isStandalone: false): add a standalone resource to the booking',
      "createBooking: not linked": "Resource is not available for this event type",
      "createProvisionalBooking: not linked": "Resource is not available for this event type",
      "createBooking: pool on the single-resource path":
        "Fungible resources require createMultiResourceBooking with an explicit quantity",
      "createProvisionalBooking: pool on the single-resource path":
        "Fungible resources require createMultiResourceBooking with an explicit quantity",
      "createReservation: pool on the single-resource path":
        "Fungible resources require createMultiResourceBooking with an explicit quantity",
    });
  });

  test("invalid time range", async () => {
    const { t } = setup();
    const { seed, movable } = await seedWorld(t);
    const empty = { start: at("15:00"), end: at("15:00") };
    const single = { eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, ...empty, timezone: "UTC", booker: BOOKER, location: LOCATION };
    const messages = await failuresOf({
      createBooking: () => t.mutation(api.public.createBooking, single),
      createProvisionalBooking: () => t.mutation(api.public.createProvisionalBooking, single),
      createReservation: () => t.mutation(api.public.createReservation, { resourceId: seed.resourceId, actorId: "x@example.com", ...empty }),
      createMultiResourceBooking: () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: seed.eventTypeId, resources: [{ resourceId: seed.resourceId }], ...empty, timezone: "UTC", booker: BOOKER,
        }),
      rescheduleBooking: () => t.mutation(api.public.rescheduleBooking, { bookingId: movable._id, newStart: empty.start, newEnd: empty.end }),
      rescheduleBookingByToken: () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: movable.uid, token: movable.managementToken!, newStart: empty.start, newEnd: empty.end }),
    });
    expect(Object.keys(messages)).toHaveLength(6);
    for (const [name, message] of Object.entries(messages)) {
      expect(message, name).toBe("Invalid time range: end must be after start");
    }
  });

  test("unknown bookings, wrong tokens and invalid states", async () => {
    const { t } = setup();
    const { seed, bundle, movable } = await seedWorld(t);
    const gone = await book(t, seed, at("14:00"), at("15:00"));
    await t.run((ctx) => ctx.db.delete(gone._id));
    const cancelled = await book(t, seed, at("15:00"), at("16:00"));
    await t.mutation(api.public.cancelBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken! });
    const completed = await book(t, seed, at("16:00"), at("17:00"));
    await t.mutation(api.hooks.transitionBookingState, { bookingId: completed._id, toStatus: "completed" });
    const cancelledBundle = await bundle([{ resourceId: seed.resourceId }], "17:00");
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: cancelledBundle._id });
    const goneId = gone._id;
    const move = { newStart: at("18:00"), newEnd: at("19:00") };

    expect(await failuresOf({
      "getBookingByToken: unknown uid": () => t.query(api.public.getBookingByToken, { uid: "bk_unknown", token: "x" }),
      "getBookingByToken: wrong token": () => t.query(api.public.getBookingByToken, { uid: movable.uid, token: "wrong" }),
      "cancelBookingByToken: unknown uid": () => t.mutation(api.public.cancelBookingByToken, { uid: "bk_unknown", token: "x" }),
      "cancelBookingByToken: wrong token": () => t.mutation(api.public.cancelBookingByToken, { uid: movable.uid, token: "wrong" }),
      "rescheduleBookingByToken: unknown uid": () => t.mutation(api.public.rescheduleBookingByToken, { uid: "bk_unknown", token: "x", ...move }),
      "rescheduleBookingByToken: wrong token": () => t.mutation(api.public.rescheduleBookingByToken, { uid: movable.uid, token: "wrong", ...move }),
      "rescheduleBooking: unknown id": () => t.mutation(api.public.rescheduleBooking, { bookingId: goneId, ...move }),
      "cancelReservation: unknown id": () => t.mutation(api.public.cancelReservation, { reservationId: goneId }),
      "cancelMultiResourceBooking: unknown id": () => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: goneId }),
      "transitionBookingState: unknown id": () => t.mutation(api.hooks.transitionBookingState, { bookingId: goneId, toStatus: "cancelled" }),
      "expireProvisionalBooking: unknown id": () => t.mutation(api.public.expireProvisionalBooking, { bookingId: goneId }),
      "cancelBookingByToken: cancelled": () => t.mutation(api.public.cancelBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken! }),
      "cancelReservation: completed": () => t.mutation(api.public.cancelReservation, { reservationId: completed._id }),
      "cancelMultiResourceBooking: cancelled": () => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: cancelledBundle._id }),
      "cancelMultiResourceBooking: completed": () => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: completed._id }),
      "rescheduleBooking: cancelled": () => t.mutation(api.public.rescheduleBooking, { bookingId: cancelled._id, ...move }),
      "rescheduleBookingByToken: cancelled": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken!, ...move }),
      "transitionBookingState: from a terminal state": () =>
        t.mutation(api.hooks.transitionBookingState, { bookingId: cancelled._id, toStatus: "confirmed" }),
      "transitionBookingState: not allowed": () =>
        t.mutation(api.hooks.transitionBookingState, { bookingId: movable._id, toStatus: "pending" }),
    })).toEqual({
      "getBookingByToken: unknown uid": "Booking not found",
      "getBookingByToken: wrong token": "Invalid token",
      "cancelBookingByToken: unknown uid": "Booking not found",
      "cancelBookingByToken: wrong token": "Invalid token",
      "rescheduleBookingByToken: unknown uid": "Booking not found",
      "rescheduleBookingByToken: wrong token": "Invalid token",
      "rescheduleBooking: unknown id": "Booking not found",
      "cancelReservation: unknown id": "Reservation not found",
      "cancelMultiResourceBooking: unknown id": "Booking not found",
      "transitionBookingState: unknown id": "Booking not found",
      "expireProvisionalBooking: unknown id": "Booking not found",
      "cancelBookingByToken: cancelled": "Cannot cancel booking with status: cancelled",
      "cancelReservation: completed": "Cannot cancel booking with status: completed",
      "cancelMultiResourceBooking: cancelled": "Booking is already cancelled",
      "cancelMultiResourceBooking: completed": "Cannot cancel booking with status: completed",
      "rescheduleBooking: cancelled": "Cannot reschedule booking with status: cancelled",
      "rescheduleBookingByToken: cancelled": "Cannot reschedule booking with status: cancelled",
      "transitionBookingState: from a terminal state": "Invalid state transition: cancelled -> confirmed. Allowed: none",
      "transitionBookingState: not allowed": "Invalid state transition: confirmed -> pending. Allowed: cancelled, completed",
    });
  });
});

describe("check order: a request with several problems reports the first check", () => {
  test("createBooking and createProvisionalBooking share one order", async () => {
    const { t } = setup();
    const { seed } = await seedWorld(t);
    // range → pool → event exists → event active → resource exists → resource
    // active → standalone → linked → slot free
    const requests: Record<string, { eventTypeId: string; resourceId: string; start: number; end: number }> = {
      "empty range, pool and missing event": { eventTypeId: "ghost", resourceId: "pool-1", start: at("15:00"), end: at("15:00") },
      "pool and missing event": { eventTypeId: "ghost", resourceId: "pool-1", ...hour("15:00") },
      "missing event and missing resource": { eventTypeId: "ghost", resourceId: "ghost-res", ...hour("15:00") },
      "inactive event and missing resource": { eventTypeId: "et-off", resourceId: "ghost-res", ...hour("15:00") },
      "missing resource": { eventTypeId: seed.eventTypeId, resourceId: "ghost-res", ...hour("15:00") },
      "inactive add-on, not linked": { eventTypeId: seed.eventTypeId, resourceId: "addon-off", ...hour("15:00") },
      "add-on, not linked": { eventTypeId: seed.eventTypeId, resourceId: "addon-unlinked", ...hour("15:00") },
      "not linked and slot taken": { eventTypeId: seed.eventTypeId, resourceId: "res-unlinked", ...hour("09:00") },
    };
    const expected = {
      "empty range, pool and missing event": "Invalid time range: end must be after start",
      "pool and missing event": "Fungible resources require createMultiResourceBooking with an explicit quantity",
      "missing event and missing resource": "Event type not found",
      "inactive event and missing resource": "Event type is no longer active",
      "missing resource": "Resource not found",
      "inactive add-on, not linked": "Resource is no longer active",
      "add-on, not linked": 'Resource "addon-unlinked" cannot be booked alone (isStandalone: false)',
      "not linked and slot taken": "Resource is not available for this event type",
    };
    for (const mutation of [api.public.createBooking, api.public.createProvisionalBooking]) {
      const cases = Object.fromEntries(
        Object.entries(requests).map(([name, request]) => [
          name,
          () => t.mutation(mutation, { ...request, timezone: "UTC", booker: BOOKER, location: LOCATION }),
        ]),
      );
      expect(await failuresOf(cases)).toEqual(expected);
    }
  });

  test("createMultiResourceBooking: range → request list → event → per-resource capacity → standalone", async () => {
    const { t } = setup();
    const { seed, bundle } = await seedWorld(t);
    const bundleOf = (eventTypeId: string, resources: Array<{ resourceId: string; quantity?: number }>, start: number, end: number) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId, resources, start, end, timezone: "UTC", booker: BOOKER,
      });
    expect(await failuresOf({
      "empty range and missing event": () => bundleOf("ghost", [{ resourceId: seed.resourceId }], at("15:00"), at("15:00")),
      "duplicate resource and missing event": () =>
        bundleOf("ghost", [{ resourceId: seed.resourceId }, { resourceId: seed.resourceId }], at("15:00"), at("16:00")),
      "missing event and slot taken": () => bundleOf("ghost", [{ resourceId: seed.resourceId }], at("09:00"), at("10:00")),
      "add-on alone on a taken slot": () => bundle([{ resourceId: "addon-1" }], "13:00"),
    })).toEqual({
      "empty range and missing event": "Invalid time range: end must be after start",
      "duplicate resource and missing event": 'Duplicate resource ID: "res-1"',
      "missing event and slot taken": 'Event type "ghost" not found',
      "add-on alone on a taken slot": 'Resource "addon-1" is not available for the selected time',
    });
  });

  test("moves: range → booking → token → status → destination", async () => {
    const { t } = setup();
    const { seed, movable } = await seedWorld(t);
    const cancelled = await book(t, seed, at("15:00"), at("16:00"));
    await t.mutation(api.public.cancelBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken! });
    const gone = await book(t, seed, at("16:00"), at("17:00"));
    await t.run((ctx) => ctx.db.delete(gone._id));
    expect(await failuresOf({
      "rescheduleBooking: empty range, unknown id": () =>
        t.mutation(api.public.rescheduleBooking, { bookingId: gone._id, newStart: at("18:00"), newEnd: at("18:00") }),
      "rescheduleBookingByToken: empty range, unknown uid": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: "bk_unknown", token: "x", newStart: at("18:00"), newEnd: at("18:00") }),
      "rescheduleBookingByToken: wrong token on a cancelled booking": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: cancelled.uid, token: "wrong", newStart: at("09:00"), newEnd: at("10:00") }),
      "rescheduleBooking: cancelled booking onto a taken slot": () =>
        t.mutation(api.public.rescheduleBooking, { bookingId: cancelled._id, newStart: at("09:00"), newEnd: at("10:00") }),
    })).toEqual({
      "rescheduleBooking: empty range, unknown id": "Invalid time range: end must be after start",
      "rescheduleBookingByToken: empty range, unknown uid": "Invalid time range: end must be after start",
      "rescheduleBookingByToken: wrong token on a cancelled booking": "Invalid token",
      "rescheduleBooking: cancelled booking onto a taken slot": "Cannot reschedule booking with status: cancelled",
    });
    // CONTROL: the movable booking itself can still be moved to a free hour.
    await expect(
      t.mutation(api.public.rescheduleBooking, { bookingId: movable._id, newStart: at("18:00"), newEnd: at("19:00") }),
    ).resolves.toMatchObject({ rescheduleUid: movable.uid });
  });
});
