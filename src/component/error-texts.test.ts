/**
 * Frozen entry-point errors (N3) — change only deliberately.
 *
 * Every expected failure throws ConvexError({ code, message }). The code is
 * public contract (src/shared/booking-errors.ts, docs/errors.md). The message
 * is the 0.4.x text, unchanged: hosts matched it by substring ("Time slot no
 * longer available", "Event type not found", "Resource is not available for
 * this event type", …) and can keep reading it from `data.message`. The same
 * condition keeps a different text per entry point but has one code, and the
 * order of the checks decides which failure a request with several problems
 * gets. A failing test here is a host-visible change: update the expectation
 * only together with a CHANGELOG note.
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api.js";
import {
  isBookingError,
  type BookingErrorCode,
  type BookingErrorData,
} from "../shared/booking-errors.js";
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

/** The expected rejection: `data` of the ConvexError. */
const coded = (code: BookingErrorCode, message: string): BookingErrorData => ({ code, message });

/** The rejection's `data`, or a marker when the call unexpectedly succeeds. */
async function failureOf(call: Promise<unknown>): Promise<BookingErrorData | "(resolved)"> {
  try {
    await call;
  } catch (error) {
    expect(isBookingError(error), String(error)).toBe(true);
    const data = (error as ConvexError<BookingErrorData>).data;
    // The error's own message is the text as well, not the JSON of its data.
    expect((error as Error).message).toBe(data.message);
    return data;
  }
  return "(resolved)";
}

async function failuresOf(cases: Record<string, () => Promise<unknown>>) {
  const failures: Record<string, BookingErrorData | "(resolved)"> = {};
  for (const [name, call] of Object.entries(cases)) failures[name] = await failureOf(call());
  return failures;
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
  // Another organization's room, linked as 0.4.x allowed (linking rejects it since 0.5.0).
  await t.mutation(api.resources.createResource, {
    id: "res-org2", organizationId: "org-2", name: "res-org2", type: "room", timezone: "UTC",
  });
  await t.run((ctx) => ctx.db.insert("resource_event_types", { resourceId: "res-org2", eventTypeId: seed.eventTypeId }));
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
      createBooking: coded("SLOT_UNAVAILABLE", "Time slot no longer available"),
      createProvisionalBooking: coded("SLOT_UNAVAILABLE", "Time slot no longer available"),
      createReservation: coded("SLOT_UNAVAILABLE", "Resource is not available for the requested time range."),
      "createMultiResourceBooking (exclusive)": coded("SLOT_UNAVAILABLE", 'Resource "res-1" is not available for the selected time'),
      "createMultiResourceBooking (pool)": coded("QUANTITY_UNAVAILABLE", 'Resource "pool-1" is not available for the requested quantity'),
      rescheduleBooking: coded("SLOT_UNAVAILABLE", 'Resource "res-1" is not available for the selected time'),
      rescheduleBookingByToken: coded("SLOT_UNAVAILABLE", 'Resource "res-1" is not available for the selected time'),
      "rescheduleBooking (pool bundle)": coded("QUANTITY_UNAVAILABLE", 'Resource "pool-1" is not available for the requested quantity'),
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
      ...both("other organization", seed.eventTypeId, "res-org2"),
      "createMultiResourceBooking: inactive event": () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: "et-off", resources: [{ resourceId: seed.resourceId }], ...hour("16:00"),
          timezone: "UTC", booker: BOOKER,
        }),
      "createMultiResourceBooking: other organization argument": () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: seed.eventTypeId, organizationId: "org-2", resources: [{ resourceId: seed.resourceId }],
          ...hour("16:00"), timezone: "UTC", booker: BOOKER,
        }),
      "createMultiResourceBooking: missing resource": () => bundle([{ resourceId: seed.resourceId }, { resourceId: "ghost-res" }], "16:00"),
      "createMultiResourceBooking: inactive resource": () => bundle([{ resourceId: seed.resourceId }, { resourceId: "res-off" }], "16:00"),
      "createMultiResourceBooking: not linked": () => bundle([{ resourceId: seed.resourceId }, { resourceId: "res-unlinked" }], "16:00"),
      "createMultiResourceBooking: other organization": () => bundle([{ resourceId: seed.resourceId }, { resourceId: "res-org2" }], "16:00"),
      ...both("pool on the single-resource path", seed.eventTypeId, "pool-1"),
      "createReservation: pool on the single-resource path": () =>
        t.mutation(api.public.createReservation, { resourceId: "pool-1", actorId: "x@example.com", ...hour("16:00") }),
    })).toEqual({
      "getEventType: missing event": coded("EVENT_TYPE_NOT_FOUND", "Event type not found: ghost"),
      "createBooking: missing event": coded("EVENT_TYPE_NOT_FOUND", "Event type not found"),
      "createProvisionalBooking: missing event": coded("EVENT_TYPE_NOT_FOUND", "Event type not found"),
      "createMultiResourceBooking: missing event": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "updateEventType: missing event": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "deleteEventType: missing event": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "toggleEventTypeActive: missing event": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "linkResourceToEventType: missing event": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "createBooking: inactive event": coded("EVENT_TYPE_INACTIVE", "Event type is no longer active"),
      "createProvisionalBooking: inactive event": coded("EVENT_TYPE_INACTIVE", "Event type is no longer active"),
      "createBooking: missing resource": coded("RESOURCE_NOT_FOUND", "Resource not found"),
      "createProvisionalBooking: missing resource": coded("RESOURCE_NOT_FOUND", "Resource not found"),
      "linkResourceToEventType: missing resource": coded("RESOURCE_NOT_FOUND", 'Resource "ghost-res" not found'),
      "createBooking: inactive resource": coded("RESOURCE_INACTIVE", "Resource is no longer active"),
      "createProvisionalBooking: inactive resource": coded("RESOURCE_INACTIVE", "Resource is no longer active"),
      "createBooking: add-on alone": coded("RESOURCE_NOT_STANDALONE", 'Resource "addon-1" cannot be booked alone (isStandalone: false)'),
      "createProvisionalBooking: add-on alone": coded("RESOURCE_NOT_STANDALONE", 'Resource "addon-1" cannot be booked alone (isStandalone: false)'),
      "createMultiResourceBooking: add-on alone":
        coded("RESOURCE_NOT_STANDALONE", 'Resource "addon-1" cannot be booked alone (isStandalone: false): add a standalone resource to the booking'),
      "createBooking: not linked": coded("RESOURCE_NOT_LINKED", "Resource is not available for this event type"),
      "createProvisionalBooking: not linked": coded("RESOURCE_NOT_LINKED", "Resource is not available for this event type"),
      "createBooking: other organization": coded("ORGANIZATION_MISMATCH", "Resource belongs to another organization than the event type"),
      "createProvisionalBooking: other organization": coded("ORGANIZATION_MISMATCH", "Resource belongs to another organization than the event type"),
      "createMultiResourceBooking: inactive event": coded("EVENT_TYPE_INACTIVE", 'Event type "et-off" is no longer active'),
      "createMultiResourceBooking: other organization argument":
        coded("ORGANIZATION_MISMATCH", 'Organization "org-2" does not match the organization of event type "et-1"'),
      "createMultiResourceBooking: missing resource": coded("RESOURCE_NOT_FOUND", 'Resource "ghost-res" not found'),
      "createMultiResourceBooking: inactive resource": coded("RESOURCE_INACTIVE", 'Resource "res-off" is no longer active'),
      "createMultiResourceBooking: not linked": coded("RESOURCE_NOT_LINKED", 'Resource "res-unlinked" is not available for this event type'),
      "createMultiResourceBooking: other organization":
        coded("ORGANIZATION_MISMATCH", 'Resource "res-org2" belongs to another organization than the event type'),
      "createBooking: pool on the single-resource path":
        coded("POOL_REQUIRES_BUNDLE", "Fungible resources require createMultiResourceBooking with an explicit quantity"),
      "createProvisionalBooking: pool on the single-resource path":
        coded("POOL_REQUIRES_BUNDLE", "Fungible resources require createMultiResourceBooking with an explicit quantity"),
      "createReservation: pool on the single-resource path":
        coded("POOL_REQUIRES_BUNDLE", "Fungible resources require createMultiResourceBooking with an explicit quantity"),
    });
  });

  test("invalid time range", async () => {
    const { t } = setup();
    const { seed, movable } = await seedWorld(t);
    const empty = { start: at("15:00"), end: at("15:00") };
    const single = { eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, ...empty, timezone: "UTC", booker: BOOKER, location: LOCATION };
    const failures = await failuresOf({
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
    expect(Object.keys(failures)).toHaveLength(6);
    for (const [name, failure] of Object.entries(failures)) {
      expect(failure, name).toEqual(coded("INVALID_RANGE", "Invalid time range: end must be after start"));
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
      "getBookingByToken: unknown uid": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "getBookingByToken: wrong token": coded("INVALID_TOKEN", "Invalid token"),
      "cancelBookingByToken: unknown uid": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "cancelBookingByToken: wrong token": coded("INVALID_TOKEN", "Invalid token"),
      "rescheduleBookingByToken: unknown uid": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "rescheduleBookingByToken: wrong token": coded("INVALID_TOKEN", "Invalid token"),
      "rescheduleBooking: unknown id": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "cancelReservation: unknown id": coded("BOOKING_NOT_FOUND", "Reservation not found"),
      "cancelMultiResourceBooking: unknown id": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "transitionBookingState: unknown id": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "expireProvisionalBooking: unknown id": coded("BOOKING_NOT_FOUND", "Booking not found"),
      "cancelBookingByToken: cancelled": coded("INVALID_STATE", "Cannot cancel booking with status: cancelled"),
      "cancelReservation: completed": coded("INVALID_STATE", "Cannot cancel booking with status: completed"),
      "cancelMultiResourceBooking: cancelled": coded("INVALID_STATE", "Booking is already cancelled"),
      "cancelMultiResourceBooking: completed": coded("INVALID_STATE", "Cannot cancel booking with status: completed"),
      "rescheduleBooking: cancelled": coded("INVALID_STATE", "Cannot reschedule booking with status: cancelled"),
      "rescheduleBookingByToken: cancelled": coded("INVALID_STATE", "Cannot reschedule booking with status: cancelled"),
      "transitionBookingState: from a terminal state": coded("INVALID_STATE", "Invalid state transition: cancelled -> confirmed. Allowed: none"),
      "transitionBookingState: not allowed": coded("INVALID_STATE", "Invalid state transition: confirmed -> pending. Allowed: cancelled, completed"),
    });
  });
});

describe("check order: a request with several problems reports the first check", () => {
  test("createBooking and createProvisionalBooking share one order", async () => {
    const { t } = setup();
    const { seed } = await seedWorld(t);
    // range → pool → event exists → event active → resource exists → resource
    // active → standalone → linked → organization → slot free
    const requests: Record<string, { eventTypeId: string; resourceId: string; start: number; end: number }> = {
      "empty range, pool and missing event": { eventTypeId: "ghost", resourceId: "pool-1", start: at("15:00"), end: at("15:00") },
      "pool and missing event": { eventTypeId: "ghost", resourceId: "pool-1", ...hour("15:00") },
      "missing event and missing resource": { eventTypeId: "ghost", resourceId: "ghost-res", ...hour("15:00") },
      "inactive event and missing resource": { eventTypeId: "et-off", resourceId: "ghost-res", ...hour("15:00") },
      "missing resource": { eventTypeId: seed.eventTypeId, resourceId: "ghost-res", ...hour("15:00") },
      "inactive add-on, not linked": { eventTypeId: seed.eventTypeId, resourceId: "addon-off", ...hour("15:00") },
      "add-on, not linked": { eventTypeId: seed.eventTypeId, resourceId: "addon-unlinked", ...hour("15:00") },
      "not linked and slot taken": { eventTypeId: seed.eventTypeId, resourceId: "res-unlinked", ...hour("09:00") },
      "other organization and slot taken": { eventTypeId: seed.eventTypeId, resourceId: "res-org2", ...hour("09:00") },
    };
    const expected = {
      "empty range, pool and missing event": coded("INVALID_RANGE", "Invalid time range: end must be after start"),
      "pool and missing event": coded("POOL_REQUIRES_BUNDLE", "Fungible resources require createMultiResourceBooking with an explicit quantity"),
      "missing event and missing resource": coded("EVENT_TYPE_NOT_FOUND", "Event type not found"),
      "inactive event and missing resource": coded("EVENT_TYPE_INACTIVE", "Event type is no longer active"),
      "missing resource": coded("RESOURCE_NOT_FOUND", "Resource not found"),
      "inactive add-on, not linked": coded("RESOURCE_INACTIVE", "Resource is no longer active"),
      "add-on, not linked": coded("RESOURCE_NOT_STANDALONE", 'Resource "addon-unlinked" cannot be booked alone (isStandalone: false)'),
      "not linked and slot taken": coded("RESOURCE_NOT_LINKED", "Resource is not available for this event type"),
      "other organization and slot taken": coded("ORGANIZATION_MISMATCH", "Resource belongs to another organization than the event type"),
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

  // 0.5.0: the booking rules (every item, then the add-on rule) come before
  // capacity, as on the single paths; 0.4.x checked capacity first, so an
  // add-on alone on a taken slot reported the conflict.
  test("createMultiResourceBooking: range → request list → event → organization → each item → standalone → capacity", async () => {
    const { t } = setup();
    const { seed, bundle } = await seedWorld(t);
    const bundleOf = (
      eventTypeId: string,
      resources: Array<{ resourceId: string; quantity?: number }>,
      start: number,
      end: number,
      organizationId?: string,
    ) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId, organizationId, resources, start, end, timezone: "UTC", booker: BOOKER,
      });
    expect(await failuresOf({
      "empty range and missing event": () => bundleOf("ghost", [{ resourceId: seed.resourceId }], at("15:00"), at("15:00")),
      "duplicate resource and missing event": () =>
        bundleOf("ghost", [{ resourceId: seed.resourceId }, { resourceId: seed.resourceId }], at("15:00"), at("16:00")),
      "missing event and slot taken": () => bundleOf("ghost", [{ resourceId: seed.resourceId }], at("09:00"), at("10:00")),
      "inactive event and other organization argument": () =>
        bundleOf("et-off", [{ resourceId: seed.resourceId }], at("15:00"), at("16:00"), "org-2"),
      "other organization argument and missing resource": () =>
        bundleOf(seed.eventTypeId, [{ resourceId: "ghost-res" }], at("15:00"), at("16:00"), "org-2"),
      "items in the order given": () => bundle([{ resourceId: "res-unlinked" }, { resourceId: "ghost-res" }], "15:00"),
      "inactive add-on, not linked": () => bundle([{ resourceId: "addon-off" }], "15:00"),
      "add-on, not linked": () => bundle([{ resourceId: "addon-unlinked" }], "15:00"),
      "add-on with an ineligible room": () => bundle([{ resourceId: "addon-1" }, { resourceId: "res-off" }], "15:00"),
      "add-on alone on a taken slot": () => bundle([{ resourceId: "addon-1" }], "13:00"),
    })).toEqual({
      "empty range and missing event": coded("INVALID_RANGE", "Invalid time range: end must be after start"),
      "duplicate resource and missing event": coded("INVALID_INPUT", 'Duplicate resource ID: "res-1"'),
      "missing event and slot taken": coded("EVENT_TYPE_NOT_FOUND", 'Event type "ghost" not found'),
      "inactive event and other organization argument": coded("EVENT_TYPE_INACTIVE", 'Event type "et-off" is no longer active'),
      "other organization argument and missing resource":
        coded("ORGANIZATION_MISMATCH", 'Organization "org-2" does not match the organization of event type "et-1"'),
      "items in the order given": coded("RESOURCE_NOT_LINKED", 'Resource "res-unlinked" is not available for this event type'),
      "inactive add-on, not linked": coded("RESOURCE_INACTIVE", 'Resource "addon-off" is no longer active'),
      "add-on, not linked": coded("RESOURCE_NOT_LINKED", 'Resource "addon-unlinked" is not available for this event type'),
      "add-on with an ineligible room": coded("RESOURCE_INACTIVE", 'Resource "res-off" is no longer active'),
      "add-on alone on a taken slot":
        coded("RESOURCE_NOT_STANDALONE", 'Resource "addon-1" cannot be booked alone (isStandalone: false): add a standalone resource to the booking'),
    });
  });

  test("moves: range → booking → token → status → booking rules → destination", async () => {
    const { t } = setup();
    const { seed, movable } = await seedWorld(t);
    const cancelled = await book(t, seed, at("15:00"), at("16:00"));
    await t.mutation(api.public.cancelBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken! });
    const gone = await book(t, seed, at("16:00"), at("17:00"));
    await t.run((ctx) => ctx.db.delete(gone._id));
    // A booking 0.4.x accepted on another organization's room.
    const onOtherOrganization = await t.run(async (ctx) => {
      const row = await ctx.db.get(movable._id);
      const { _id, _creationTime, ...fields } = row!;
      return await ctx.db.insert("bookings", { ...fields, uid: "bk_org2", resourceId: "res-org2", start: at("17:00"), end: at("18:00") });
    });
    expect(await failuresOf({
      "rescheduleBooking: empty range, unknown id": () =>
        t.mutation(api.public.rescheduleBooking, { bookingId: gone._id, newStart: at("18:00"), newEnd: at("18:00") }),
      "rescheduleBookingByToken: empty range, unknown uid": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: "bk_unknown", token: "x", newStart: at("18:00"), newEnd: at("18:00") }),
      "rescheduleBookingByToken: wrong token on a cancelled booking": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: cancelled.uid, token: "wrong", newStart: at("09:00"), newEnd: at("10:00") }),
      "rescheduleBooking: cancelled booking onto a taken slot": () =>
        t.mutation(api.public.rescheduleBooking, { bookingId: cancelled._id, newStart: at("09:00"), newEnd: at("10:00") }),
      "rescheduleBooking: a booking on another organization's room": () =>
        t.mutation(api.public.rescheduleBooking, { bookingId: onOtherOrganization, newStart: at("09:00"), newEnd: at("10:00") }),
    })).toEqual({
      "rescheduleBooking: empty range, unknown id": coded("INVALID_RANGE", "Invalid time range: end must be after start"),
      "rescheduleBookingByToken: empty range, unknown uid": coded("INVALID_RANGE", "Invalid time range: end must be after start"),
      "rescheduleBookingByToken: wrong token on a cancelled booking": coded("INVALID_TOKEN", "Invalid token"),
      "rescheduleBooking: cancelled booking onto a taken slot": coded("INVALID_STATE", "Cannot reschedule booking with status: cancelled"),
      "rescheduleBooking: a booking on another organization's room":
        coded("ORGANIZATION_MISMATCH", "Resource belongs to another organization than the event type"),
    });
    // CONTROL: the movable booking itself can still be moved to a free hour.
    await expect(
      t.mutation(api.public.rescheduleBooking, { bookingId: movable._id, newStart: at("18:00"), newEnd: at("19:00") }),
    ).resolves.toMatchObject({ rescheduleUid: movable.uid });
  });
});

describe("configuration writes and arguments", () => {
  test("in use, already exists, not found and invalid input", async () => {
    const { t } = setup();
    const { seed } = await seedWorld(t);
    const weeklyHours = [{ dayOfWeek: 2, startTime: "09:00", endTime: "17:00" }];
    const schedule = { id: "sch-1", organizationId: ORG, name: "Hours", timezone: "UTC", weeklyHours };
    const scheduleDocId = await t.mutation(api.schedules.createSchedule, schedule);
    await t.mutation(api.schedules.createSchedule, { ...schedule, id: "sch-used" });
    await t.mutation(api.public.updateEventType, { id: "et-off", scheduleId: "sch-used" });
    const goneOverride = await t.mutation(api.schedules.createDateOverride, {
      scheduleId: scheduleDocId, date: TUESDAY, type: "unavailable",
    });
    await t.mutation(api.schedules.deleteDateOverride, { overrideId: goneOverride });
    const goneHook = await t.mutation(api.hooks.registerHook, {
      eventType: "booking.created", functionHandle: "function://probe",
    });
    await t.mutation(api.hooks.unregisterHook, { hookId: goneHook });

    expect(await failuresOf({
      "deleteEventType: with bookings": () => t.mutation(api.public.deleteEventType, { id: seed.eventTypeId }),
      "createResource: duplicate id": () =>
        t.mutation(api.resources.createResource, { id: seed.resourceId, organizationId: ORG, name: "x", type: "room", timezone: "UTC" }),
      "updateResource: missing resource": () => t.mutation(api.resources.updateResource, { id: "ghost-res", name: "x" }),
      "updateResource: pool with active bookings": () =>
        t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true, quantity: 3 }),
      "updateResource: pool flag with active single bookings": () =>
        t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true }),
      "updateResource: capacity below reservations": () => t.mutation(api.resources.updateResource, { id: "pool-1", quantity: 2 }),
      "deleteResource: with bookings": () => t.mutation(api.resources.deleteResource, { id: seed.resourceId }),
      "toggleResourceActive: missing resource": () => t.mutation(api.resources.toggleResourceActive, { id: "ghost-res", isActive: false }),
      "createSchedule: duplicate id": () => t.mutation(api.schedules.createSchedule, schedule),
      "updateSchedule: missing schedule": () => t.mutation(api.schedules.updateSchedule, { id: "ghost", name: "x" }),
      "deleteSchedule: missing schedule": () => t.mutation(api.schedules.deleteSchedule, { id: "ghost" }),
      "deleteSchedule: in use": () => t.mutation(api.schedules.deleteSchedule, { id: "sch-used" }),
      "createEventType: missing schedule": () =>
        t.mutation(api.public.createEventType, {
          id: "et-new", slug: "et-new", title: "x", lengthInMinutes: 60, timezone: "UTC", lockTimeZoneToggle: false,
          locations: [], scheduleId: "ghost",
        }),
      "updateEventType: missing schedule": () => t.mutation(api.public.updateEventType, { id: seed.eventTypeId, scheduleId: "ghost" }),
      "getEffectiveAvailability: missing schedule": () =>
        t.query(api.schedules.getEffectiveAvailability, { scheduleId: "ghost", date: TUESDAY }),
      "getMonthAvailability: missing schedule": () =>
        t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: TUESDAY, dateTo: TUESDAY, eventLength: 60, scheduleId: "ghost" }),
      "getMonthAvailability: resourceTimezone alone": () =>
        t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: TUESDAY, dateTo: TUESDAY, eventLength: 60, resourceTimezone: "UTC" }),
      "getDaySlots: availableSlots without a zone": () =>
        t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date: TUESDAY, eventLength: 60, availableSlots: [36] }),
      "getDaySlots: zone of another schedule": () =>
        t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date: TUESDAY, eventLength: 60, scheduleId: "sch-1", resourceTimezone: "Europe/Berlin" }),
      "updateDateOverride: missing override": () =>
        t.mutation(api.schedules.updateDateOverride, { overrideId: goneOverride, type: "unavailable" }),
      "deleteDateOverride: missing override": () => t.mutation(api.schedules.deleteDateOverride, { overrideId: goneOverride }),
      "updateHook: missing hook": () => t.mutation(api.hooks.updateHook, { hookId: goneHook, enabled: false }),
      "unregisterHook: missing hook": () => t.mutation(api.hooks.unregisterHook, { hookId: goneHook }),
      "getDaySlots: impossible date": () =>
        t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date: "2027-02-30", eventLength: 60 }),
      "getDaySlots: zero eventLength": () =>
        t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date: TUESDAY, eventLength: 0 }),
      "getMonthAvailability: dateFrom after dateTo": () =>
        t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: "2027-03-10", dateTo: TUESDAY, eventLength: 60 }),
      "getDaySlots: both reschedule arguments": () =>
        t.query(api.public.getDaySlots, {
          resourceId: seed.resourceId, date: TUESDAY, eventLength: 60, excludeBookingUid: "bk_1", rescheduleContext: { uid: "bk_1", token: "t" },
        }),
      "createResource: unknown time zone": () =>
        t.mutation(api.resources.createResource, { id: "res-mars", organizationId: ORG, name: "x", type: "room", timezone: "Mars/Olympus" }),
      "updateSchedule: inverted window": () =>
        t.mutation(api.schedules.updateSchedule, { id: "sch-1", weeklyHours: [{ dayOfWeek: 2, startTime: "10:00", endTime: "09:00" }] }),
      "registerHook: not a function handle": () =>
        t.mutation(api.hooks.registerHook, { eventType: "booking.created", functionHandle: "hooks:onCreated" }),
      "createMultiResourceBooking: no resources": () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: seed.eventTypeId, resources: [], ...hour("15:00"), timezone: "UTC", booker: BOOKER,
        }),
      "createEventType: zero length": () =>
        t.mutation(api.public.createEventType, {
          id: "et-new", slug: "et-new", title: "x", lengthInMinutes: 0, timezone: "UTC", lockTimeZoneToggle: false, locations: [],
        }),
      "createEventType: length outside its options": () =>
        t.mutation(api.public.createEventType, {
          id: "et-new", slug: "et-new", title: "x", lengthInMinutes: 30, lengthInMinutesOptions: [60, 90], timezone: "UTC",
          lockTimeZoneToggle: false, locations: [],
        }),
      "updateEventType: options without the stored length": () =>
        t.mutation(api.public.updateEventType, { id: seed.eventTypeId, lengthInMinutesOptions: [30, 90] }),
      "updateEventType: negative buffer": () => t.mutation(api.public.updateEventType, { id: seed.eventTypeId, bufferBefore: -5 }),
      "updateEventType: zero horizon": () => t.mutation(api.public.updateEventType, { id: seed.eventTypeId, maxFutureMinutes: 0 }),
      "createDateOverride: custom without hours": () =>
        t.mutation(api.schedules.createDateOverride, { scheduleId: scheduleDocId, date: TUESDAY, type: "custom" }),
      "getMonthAvailability: 94 days": () =>
        t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: "2027-03-01", dateTo: "2027-06-02", eventLength: 60 }),
      "getAvailability: longer than 366 days": () =>
        t.query(api.public.getAvailability, { resourceId: seed.resourceId, start: at("09:00"), end: at("09:00") + 367 * 86_400_000 }),
      "audit: limit 0": () => t.query(api.maintenance.audit, { check: "f10_weekday", limit: 0 }),
      "sweepOrphanedHolds: foreign cursor": () =>
        t.mutation(api.presence.sweepOrphanedHolds, { cursor: "not-a-cursor", limit: 10, dryRun: true }),
    })).toEqual({
      "deleteEventType: with bookings": coded("EVENT_TYPE_IN_USE", "Cannot delete event type with existing bookings. Deactivate it instead."),
      "createResource: duplicate id": coded("RESOURCE_ALREADY_EXISTS", 'Resource with ID "res-1" already exists'),
      "updateResource: missing resource": coded("RESOURCE_NOT_FOUND", 'Resource "ghost-res" not found'),
      "updateResource: pool with active bookings": coded("RESOURCE_IN_USE", "Cannot change inventory mode while resource has active bookings"),
      "updateResource: pool flag with active single bookings":
        coded("RESOURCE_IN_USE", "Cannot make a resource fungible while it has active single-resource bookings"),
      "updateResource: capacity below reservations": coded("RESOURCE_IN_USE", "Cannot reduce capacity below already reserved quantities"),
      "deleteResource: with bookings": coded("RESOURCE_IN_USE", "Cannot delete resource with existing bookings. Deactivate it instead."),
      "toggleResourceActive: missing resource": coded("RESOURCE_NOT_FOUND", 'Resource "ghost-res" not found'),
      "createSchedule: duplicate id": coded("SCHEDULE_ALREADY_EXISTS", 'Schedule with ID "sch-1" already exists'),
      "updateSchedule: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "deleteSchedule: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "deleteSchedule: in use":
        coded("SCHEDULE_IN_USE", 'Cannot delete schedule "sch-used": event type "et-off" uses it. Give its event types another schedule first.'),
      "createEventType: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "updateEventType: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "getEffectiveAvailability: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "getMonthAvailability: missing schedule": coded("SCHEDULE_NOT_FOUND", 'Schedule "ghost" not found'),
      "getMonthAvailability: resourceTimezone alone": coded(
        "INVALID_INPUT",
        "Incomplete schedule arguments: resourceTimezone needs scheduleId (pass neither for the legacy 09:00–17:00 UTC hours)",
      ),
      "getDaySlots: availableSlots without a zone": coded(
        "INVALID_INPUT",
        "Incomplete schedule arguments: availableSlots needs resourceTimezone or scheduleId (pass none of them for the legacy 09:00–17:00 UTC hours)",
      ),
      "getDaySlots: zone of another schedule": coded(
        "INVALID_INPUT",
        'Invalid resourceTimezone "Europe/Berlin": schedule "sch-1" uses "UTC". Omit resourceTimezone to use the schedule\'s zone.',
      ),
      "updateDateOverride: missing override": coded("DATE_OVERRIDE_NOT_FOUND", "Date override not found"),
      "deleteDateOverride: missing override": coded("DATE_OVERRIDE_NOT_FOUND", "Date override not found"),
      "updateHook: missing hook": coded("HOOK_NOT_FOUND", "Hook not found"),
      "unregisterHook: missing hook": coded("HOOK_NOT_FOUND", "Hook not found"),
      "getDaySlots: impossible date": coded("INVALID_INPUT", 'Invalid date "2027-02-30": expected a calendar date as YYYY-MM-DD'),
      "getDaySlots: zero eventLength": coded("INVALID_INPUT", "Invalid eventLength 0: expected a positive number of minutes"),
      "getMonthAvailability: dateFrom after dateTo": coded("INVALID_INPUT", "Invalid date range: dateFrom 2027-03-10 is after dateTo 2027-03-09"),
      "getDaySlots: both reschedule arguments": coded(
        "INVALID_INPUT",
        "Invalid reschedule arguments: pass rescheduleContext or excludeBookingUid, not both",
      ),
      "createResource: unknown time zone": coded("INVALID_INPUT", 'Invalid time zone "Mars/Olympus": expected an IANA time zone such as "Europe/Berlin"'),
      "updateSchedule: inverted window": coded("INVALID_INPUT", 'Invalid weeklyHours (dayOfWeek 2) window: startTime "10:00" must be before endTime "09:00"'),
      "registerHook: not a function handle": coded("INVALID_INPUT", 'Invalid hook functionHandle "hooks:onCreated": expected a function handle from createFunctionHandle'),
      "createMultiResourceBooking: no resources": coded("INVALID_INPUT", "At least one resource is required"),
      "createEventType: zero length": coded("INVALID_INPUT", "Invalid lengthInMinutes 0: expected a whole number of minutes greater than 0"),
      "createEventType: length outside its options":
        coded("INVALID_INPUT", "Invalid lengthInMinutes 30: expected one of lengthInMinutesOptions (60, 90)"),
      "updateEventType: options without the stored length":
        coded("INVALID_INPUT", "Invalid lengthInMinutes 60: expected one of lengthInMinutesOptions (30, 90)"),
      "updateEventType: negative buffer": coded("INVALID_INPUT", "Invalid bufferBefore -5: expected a number of minutes of 0 or more"),
      "updateEventType: zero horizon": coded("INVALID_INPUT", "Invalid maxFutureMinutes 0: expected a number of minutes greater than 0"),
      "createDateOverride: custom without hours":
        coded("INVALID_INPUT", 'Invalid date override: type "custom" needs customHours with at least one window'),
      "getMonthAvailability: 94 days":
        coded("INVALID_INPUT", "Invalid date range: dateFrom 2027-03-01 to dateTo 2027-06-02 covers 94 days; at most 93 are allowed"),
      "getAvailability: longer than 366 days": coded("INVALID_RANGE", "Invalid time range: at most 366 days are allowed"),
      "audit: limit 0": coded("INVALID_INPUT", "limit must be an integer from 1 to 500"),
      "sweepOrphanedHolds: foreign cursor": coded("INVALID_INPUT", "Invalid sweep cursor"),
    });
  });
});

describe("hosts: codes instead of message needles (N3)", () => {
  // The reference host's 0.4.x translation table, copied verbatim (read-only)
  // from convexbooking/convex/public.ts:191-227.
  const HOST_NEEDLES: Array<[needle: string, code: string]> = [
    ["Time slot no longer available", "SLOT_NOT_AVAILABLE"],
    ["Resource is not available for the requested time range", "SLOT_NOT_AVAILABLE"],
    ["Conflict detected on", "SLOT_NOT_AVAILABLE"],
    ["Invalid time range", "INVALID_RANGE"],
    ["Event type not found", "EVENT_TYPE_NOT_FOUND"],
    ["Event type is no longer active", "EVENT_TYPE_INACTIVE"],
    ["Resource not found", "RESOURCE_NOT_FOUND"],
    ["Resource is no longer active", "RESOURCE_INACTIVE"],
    ["cannot be booked alone", "RESOURCE_NOT_STANDALONE"],
    ["Resource is not available for this event type", "NOT_LINKED"],
    ["Booking not found", "NOT_FOUND"],
    ["Invalid token", "INVALID_TOKEN"],
  ];
  const byNeedle = (message: string) => {
    if (/Cannot (reschedule|cancel) booking with status: (\w+)/.test(message)) return "INVALID_STATE";
    return HOST_NEEDLES.find(([needle]) => message.includes(needle))?.[1] ?? "BOOKING_FAILED";
  };

  test("the needles still read data.message as in 0.4.x; data.code also names bundle and move conflicts", async () => {
    const { t } = setup();
    const { seed, bundle, movable } = await seedWorld(t);
    const single = { eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, ...hour("09:00"), timezone: "UTC", booker: BOOKER, location: LOCATION };
    const failures = await failuresOf({
      "createBooking: taken": () => t.mutation(api.public.createBooking, single),
      "createReservation: taken": () =>
        t.mutation(api.public.createReservation, { resourceId: seed.resourceId, actorId: "x@example.com", ...hour("09:00") }),
      "createMultiResourceBooking: taken": () => bundle([{ resourceId: seed.resourceId }], "09:00"),
      "rescheduleBookingByToken: taken": () =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: movable.uid, token: movable.managementToken!, newStart: at("09:00"), newEnd: at("10:00") }),
      "createBooking: missing event": () => t.mutation(api.public.createBooking, { ...single, eventTypeId: "ghost" }),
      "createMultiResourceBooking: missing event": () =>
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          eventTypeId: "ghost", resources: [{ resourceId: seed.resourceId }], ...hour("16:00"), timezone: "UTC", booker: BOOKER,
        }),
    });
    const read = (pick: (failure: BookingErrorData) => string) =>
      Object.fromEntries(
        Object.entries(failures).map(([name, failure]) => [name, typeof failure === "string" ? failure : pick(failure)]),
      );

    // Unchanged texts: a host that applies its needles to data.message gets
    // its 0.4.x answers, including the generic fallback for bundles and moves.
    expect(read((failure) => byNeedle(failure.message))).toEqual({
      "createBooking: taken": "SLOT_NOT_AVAILABLE",
      "createReservation: taken": "SLOT_NOT_AVAILABLE",
      "createMultiResourceBooking: taken": "BOOKING_FAILED",
      "rescheduleBookingByToken: taken": "BOOKING_FAILED",
      "createBooking: missing event": "EVENT_TYPE_NOT_FOUND",
      "createMultiResourceBooking: missing event": "BOOKING_FAILED",
    });
    // One code per condition, whatever the entry point.
    expect(read((failure) => failure.code)).toEqual({
      "createBooking: taken": "SLOT_UNAVAILABLE",
      "createReservation: taken": "SLOT_UNAVAILABLE",
      "createMultiResourceBooking: taken": "SLOT_UNAVAILABLE",
      "rescheduleBookingByToken: taken": "SLOT_UNAVAILABLE",
      "createBooking: missing event": "EVENT_TYPE_NOT_FOUND",
      "createMultiResourceBooking: missing event": "EVENT_TYPE_NOT_FOUND",
    });
  });

  test("an unexpected failure stays a plain Error", async () => {
    const { t } = setup();
    const { seed } = await seedWorld(t);
    // A second row with the same external id breaks an invariant the
    // component relies on (`.unique()`); that is no domain failure.
    await t.run((ctx) =>
      ctx.db.insert("resources", {
        id: seed.resourceId, organizationId: ORG, name: "copy", type: "room", timezone: "UTC",
        isActive: true, createdAt: 0, updatedAt: 0,
      }),
    );
    const error = await t
      .mutation(api.public.createBooking, {
        eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, ...hour("15:00"), timezone: "UTC", booker: BOOKER, location: LOCATION,
      })
      .then(() => null, (rejection: unknown) => rejection);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConvexError);
    expect(isBookingError(error)).toBe(false);
  });
});
