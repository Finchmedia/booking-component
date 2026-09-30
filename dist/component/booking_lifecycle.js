import { assertValidRange, getRequiredSlots } from "./utils";
import { assertSingleResourceSupported } from "./inventory_helpers";
import { isLinked, sharesOrganization } from "./resource_event_types";
import { releaseAllSlotsForBooking } from "./slot_helpers";
import { throwBookingError } from "../shared/booking-errors.js";
/** `Event type` / `Resource`, followed by the quoted id in bundle texts. */
function subject(kind, id, texts) {
    return texts === "bundle" ? `${kind} "${id}"` : kind;
}
/** An event type takes bookings unless deactivated. */
function isActiveEventType(eventType) {
    return eventType.isActive !== false;
}
/** A resource takes bookings unless deactivated. */
function isActiveResource(resource) {
    return resource.isActive !== false;
}
/** A resource may be booked on its own unless it is an add-on (isStandalone: false). */
function isStandaloneResource(resource) {
    return resource.isStandalone !== false;
}
/** The eventTypeId of createReservation rows; createEventType refuses it. */
export const LEGACY_EVENT_TYPE_ID = "legacy";
/**
 * Whether `booking` is a legacy createReservation row, exempt from the
 * booking rules: it names the reserved event type ID "legacy" and no event
 * type has that ID. While an event type created with it before 0.5.0
 * exists, the bookings naming it (createReservation rows included) follow
 * its rules like any other booking.
 */
export async function isLegacyReservation(findEventType, booking) {
    return booking.eventTypeId === LEGACY_EVENT_TYPE_ID && (await findEventType(LEGACY_EVENT_TYPE_ID)) === null;
}
/** The event type with this external ID (the first, should there be two). */
function findEventType(ctx, id) {
    return ctx.db
        .query("event_types")
        .withIndex("by_external_id", (q) => q.eq("id", id))
        .first();
}
/** The event type of a booking: it exists and is active. */
export async function loadBookableEventType(ctx, eventTypeId, texts) {
    const eventType = await findEventType(ctx, eventTypeId);
    if (!eventType) {
        throwBookingError("EVENT_TYPE_NOT_FOUND", `${subject("Event type", eventTypeId, texts)} not found`);
    }
    if (!isActiveEventType(eventType)) {
        throwBookingError("EVENT_TYPE_INACTIVE", `${subject("Event type", eventTypeId, texts)} is no longer active`);
    }
    return eventType;
}
/**
 * The resources of a booking under `eventType`, in the order given: each
 * exists, is active, is linked and shares the event type's organization, all
 * share one organization, and one of them is standalone. For "single" the
 * one resource must be standalone itself, checked before its link, as
 * createBooking always did. Returns the organization of the resources: the
 * event type's when it has one, else the one they share.
 */
export async function assertResourcesBookable(ctx, eventType, resourceIds, texts) {
    let hasStandaloneResource = false;
    let first;
    for (const resourceId of resourceIds) {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", resourceId))
            .unique();
        const name = subject("Resource", resourceId, texts);
        if (!resource)
            throwBookingError("RESOURCE_NOT_FOUND", `${name} not found`);
        if (!isActiveResource(resource)) {
            throwBookingError("RESOURCE_INACTIVE", `${name} is no longer active`);
        }
        // A single-resource booking books the resource on its own — not allowed
        // for add-ons (isStandalone: false); use createMultiResourceBooking with a
        // standalone resource instead.
        if (texts === "single" && !isStandaloneResource(resource)) {
            throwBookingError("RESOURCE_NOT_STANDALONE", `Resource "${resourceId}" cannot be booked alone (isStandalone: false)`);
        }
        if (!(await isLinked(ctx.db, resourceId, eventType.id))) {
            throwBookingError("RESOURCE_NOT_LINKED", `${name} is not available for this event type`);
        }
        if (!sharesOrganization(resource, eventType)) {
            throwBookingError("ORGANIZATION_MISMATCH", `${name} belongs to another organization than the event type`);
        }
        // An event type without organization links any organization's
        // resources, but one booking never spans two organizations. (With an
        // organization, the check above already admits only its own.)
        first ??= resource;
        if (resource.organizationId !== first.organizationId) {
            throwBookingError("ORGANIZATION_MISMATCH", `${name} belongs to another organization than resource "${first.id}"`);
        }
        if (isStandaloneResource(resource))
            hasStandaloneResource = true;
    }
    // An add-on (e.g. rental equipment) needs a standalone companion, and only
    // resources that passed the checks above count as one.
    if (!hasStandaloneResource) {
        const ids = resourceIds.map((id) => `"${id}"`).join(", ");
        throwBookingError("RESOURCE_NOT_STANDALONE", `Resource ${ids} cannot be booked alone (isStandalone: false): add a standalone resource to the booking`);
    }
    return eventType.organizationId ?? first?.organizationId;
}
/**
 * Rejects an organization a booking of an event type without organization
 * names (the bundle argument, or the stored value on a move or
 * confirmation) when it is not the one its resources share: that booking
 * would be listed for, and notify, an organization that owns none of them.
 */
export function assertOrganizationOfResources(eventType, organizationId, resourcesOrganizationId, firstResourceId) {
    if (eventType.organizationId === undefined &&
        organizationId !== undefined &&
        organizationId !== resourcesOrganizationId) {
        throwBookingError("ORGANIZATION_MISMATCH", `Organization "${organizationId}" does not match the organization of resource "${firstResourceId}"`);
    }
}
/**
 * The booking rules for an existing booking against the current
 * configuration: its event type and every resource it holds (all
 * booking_items of a bundle, else its resource). Moves call it for the
 * destination before releasing anything; transitionBookingState before
 * confirming a booking or submitting a hold as a request. Returns the event
 * type, or null for a legacy row.
 */
export async function assertStillBookable(ctx, booking, items) {
    // A legacy createReservation row has no event type; it keeps the legacy
    // path's rules.
    if (await isLegacyReservation((id) => findEventType(ctx, id), booking))
        return null;
    const texts = items.length > 0 ? "bundle" : "single";
    const resourceIds = items.length > 0 ? items.map((item) => item.resourceId) : [booking.resourceId];
    const eventType = await loadBookableEventType(ctx, booking.eventTypeId, texts);
    const organizationId = await assertResourcesBookable(ctx, eventType, resourceIds, texts);
    assertOrganizationOfResources(eventType, booking.organizationId, organizationId, resourceIds[0]);
    return eventType;
}
const RULE_PROBLEMS = [
    "eventTypeMissing",
    "eventTypeInactive",
    "resourceMissing",
    "resourceInactive",
    "resourceNotLinked",
    "crossOrganization",
    "noStandalone",
];
/**
 * The rules assertStillBookable applies to `booking` and its resources (its
 * booking_items, else its resource), as every rule it fails instead of the
 * first error: what a move or confirmation of the booking would be rejected
 * for today. Legacy rows fail none. `crossOrganization` covers a resource of
 * another organization than the event type, resources of two organizations,
 * and a stored organization that is not the resources' one (event types
 * without organization). `noStandalone` is reported only when every
 * resource exists and none is standalone, so that repairing the other
 * problems would not be enough.
 */
export async function bookingRuleProblems(find, booking, resourceIds) {
    if (await isLegacyReservation(find.eventType, booking))
        return [];
    const found = new Set();
    const eventType = await find.eventType(booking.eventTypeId);
    if (!eventType)
        found.add("eventTypeMissing");
    else if (!isActiveEventType(eventType))
        found.add("eventTypeInactive");
    let hasStandaloneResource = false;
    let first;
    for (const resourceId of resourceIds) {
        const resource = await find.resource(resourceId);
        if (!resource) {
            found.add("resourceMissing");
            continue;
        }
        if (!isActiveResource(resource))
            found.add("resourceInactive");
        if (isStandaloneResource(resource))
            hasStandaloneResource = true;
        first ??= resource;
        if (resource.organizationId !== first.organizationId)
            found.add("crossOrganization");
        if (!eventType)
            continue;
        if (!(await find.linked(resourceId, eventType.id)))
            found.add("resourceNotLinked");
        if (!sharesOrganization(resource, eventType))
            found.add("crossOrganization");
    }
    if (eventType &&
        eventType.organizationId === undefined &&
        first !== undefined &&
        booking.organizationId !== undefined &&
        booking.organizationId !== first.organizationId) {
        found.add("crossOrganization");
    }
    if (!hasStandaloneResource && !found.has("resourceMissing"))
        found.add("noStandalone");
    return RULE_PROBLEMS.filter((problem) => found.has(problem));
}
/**
 * The checks createBooking and createProvisionalBooking share, in the order
 * hosts see their errors: range, pool, event type (exists, active), resource
 * (exists, active, standalone), link, organization, free slots. Returns the
 * event type and the slots to hold per UTC date.
 */
export async function assertSingleBookable(ctx, args) {
    // Basic range validation (shared guard): NaN/Infinity and end <= start
    // would otherwise silently reserve zero slots.
    assertValidRange(args.start, args.end);
    await assertSingleResourceSupported(ctx, args.resourceId);
    const eventType = await loadBookableEventType(ctx, args.eventTypeId, "single");
    await assertResourcesBookable(ctx, eventType, [args.resourceId], "single");
    // Availability per calendar day. getRequiredSlots maps a range spanning
    // UTC midnight to the correct slots of each day (the former
    // `start % 86400000` chunk math reserved nothing across midnight).
    const requiredSlots = getRequiredSlots(args.start, args.end);
    for (const [date, slots] of requiredSlots.entries()) {
        const dayAvailability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", args.resourceId).eq("date", date))
            .unique();
        if (dayAvailability) {
            for (const slot of slots) {
                if (dayAvailability.busySlots.includes(slot)) {
                    throwBookingError("SLOT_UNAVAILABLE", "Time slot no longer available");
                }
            }
        }
    }
    return { eventType, requiredSlots };
}
/**
 * The organization of a booking's event type when the stored rows
 * corroborate it, or why they do not: the event type exists and has an
 * organization, and every resource the booking occupies (its resourceId and
 * each booking item) exists and belongs to that organization too; the
 * reason names the first resource that fails. Nothing records the
 * organization a booking was made for, and an event type can move to
 * another organization later; the resources, owners of the booked
 * inventory, corroborate it. backfillBookingOrganizations, the audit's
 * booking_integrity and withEventTypeOrganization share this rule. Reads
 * only, never throws. `loadItems` lets a caller that also needs the items
 * read them once.
 */
export async function corroboratedOrganization(db, booking, eventType, resource, loadItems = () => db
    .query("booking_items")
    .withIndex("by_bookingId", (q) => q.eq("bookingId", booking._id))
    .collect()) {
    if (!eventType)
        return { reason: "event_type_missing" };
    const organizationId = eventType.organizationId;
    if (organizationId === undefined)
        return { reason: "event_type_without_organization" };
    const items = await loadItems();
    for (const resourceId of new Set([booking.resourceId, ...items.map((item) => item.resourceId)])) {
        const resourceOrganizationId = (await resource(resourceId))?.organizationId;
        if (resourceOrganizationId === undefined) {
            return { reason: "resource_missing", eventTypeOrganizationId: organizationId, resourceId };
        }
        if (resourceOrganizationId !== organizationId) {
            return {
                reason: "resource_organization_differs",
                eventTypeOrganizationId: organizationId,
                resourceId,
                resourceOrganizationId,
            };
        }
    }
    return { organizationId };
}
/**
 * The booking as its notifications describe it, in the organization every
 * hook and email about an existing booking goes to. A booking stored before
 * 0.5.0 without its event type's organization or with another one is given
 * it here, in the caller's transaction and before hooks and emails are
 * queued, only when every resource it occupies belongs to that organization
 * (corroboratedOrganization); hook routing, the email context and both
 * payload versions then name it. Otherwise the stored organization stays and
 * is notified, as in 0.4.x: legacy createReservation rows, deleted event
 * types or ones without organization, and bookings holding a missing
 * resource or another organization's (booking_integrity lists the latter as
 * organizationMismatch). Never rejects: cancelling, declining, completing
 * and expiring always succeed.
 */
export async function withEventTypeOrganization(ctx, booking) {
    const eventType = await findEventType(ctx, booking.eventTypeId);
    if (eventType?.organizationId === undefined || eventType.organizationId === booking.organizationId)
        return booking;
    const corroborated = await corroboratedOrganization(ctx.db, booking, eventType, (id) => ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", id))
        .first());
    if (!("organizationId" in corroborated))
        return booking;
    await ctx.db.patch(booking._id, { organizationId: corroborated.organizationId });
    return { ...booking, organizationId: corroborated.organizationId };
}
/**
 * Ends an active booking (provisional, pending or confirmed; the caller has
 * checked): releases everything it holds, records one history row and stamps
 * status, cancelledAt, updatedAt and cancellationReason.
 *
 * Releases from the pre-cancel snapshot BEFORE patching the status:
 * releaseAllSlotsForBooking returns early for terminal statuses, so a
 * re-read of the patched row would silently keep the inventory busy.
 */
export async function terminateBooking(ctx, booking, opts) {
    await releaseAllSlotsForBooking(ctx, booking);
    await ctx.db.insert("booking_history", {
        bookingId: booking._id,
        fromStatus: booking.status,
        toStatus: opts.to,
        changedBy: opts.changedBy,
        reason: opts.reason,
        timestamp: opts.now,
    });
    await ctx.db.patch(booking._id, {
        status: opts.to,
        cancelledAt: opts.now,
        cancellationReason: opts.reason,
        updatedAt: opts.now,
    });
}
/**
 * The version 2 hook payload of an event, read from the booking as the
 * emitting mutation wrote it (call it after the writes). `details` are what
 * the booking does not store: the status before the event, the reason and
 * the actor the mutation recorded, and for a move the original booking.
 * The management token is never included.
 */
export async function buildHookEventV2(ctx, event, bookingId, details = {}) {
    const booking = await ctx.db.get(bookingId);
    if (!booking)
        throw new Error("Booking not found after write");
    const items = await ctx.db
        .query("booking_items")
        .withIndex("by_bookingId", (q) => q.eq("bookingId", bookingId))
        .collect();
    const payload = {
        version: 2,
        event,
        bookingId: booking._id,
        uid: booking.uid,
        organizationId: booking.organizationId,
        resourceId: booking.resourceId,
        resourceIds: items.length > 0 ? items.map((item) => item.resourceId) : [booking.resourceId],
        eventTypeId: booking.eventTypeId,
        status: booking.status,
        previousStatus: details.previousStatus,
        start: booking.start,
        end: booking.end,
        timezone: booking.timezone,
        bookerName: booking.bookerName,
        bookerEmail: booking.bookerEmail,
        eventTitle: booking.eventTitle,
        reason: details.reason,
        changedBy: details.changedBy,
        isMultiResource: items.length > 0,
    };
    if (event !== "booking.rescheduled")
        return payload;
    const original = details.original;
    if (!original)
        throw new Error("A booking.rescheduled payload needs the original booking");
    return {
        ...payload,
        originalBookingId: original._id,
        newBookingId: booking._id,
        previousStart: original.start,
        previousEnd: original.end,
    };
}
//# sourceMappingURL=booking_lifecycle.js.map