// ============================================
// HOOK PAYLOADS, VERSION 2
// ============================================
//
// A hook registered with `payloadVersion: 2` receives one envelope per event
// name, whichever function emitted the event, built from the booking as
// written. Its handle runs with the envelope as its arguments, so a host
// handler can declare `args: bookingHookEventV2`. The shape is frozen within
// version 2: an added key would fail such handlers just like a removed one.
// It never carries the management token (fetch the booking by `bookingId`
// in trusted host code when you need it).
// docs/hook-payloads-v2.md renders this validator.
//
// Only `convex/values` (and the status set beside it) is imported: the root
// entry exports it for host functions.
import { v } from "convex/values";
import { bookingStatusValidator } from "./booking-status.js";
/** The events a version 2 hook can receive. */
export const BOOKING_HOOK_EVENTS_V2 = [
    "booking.created",
    "booking.pending",
    "booking.confirmed",
    "booking.declined",
    "booking.cancelled",
    "booking.completed",
    "booking.rescheduled",
];
/**
 * The arguments a `payloadVersion: 2` hook receives, the same object type
 * for every event. Declare it as a handler's `args` (Convex takes only an
 * object validator there) to validate every delivery.
 */
export const bookingHookEventV2 = v.object({
    version: v.literal(2),
    event: v.union(...BOOKING_HOOK_EVENTS_V2.map((event) => v.literal(event))),
    /** The booking's document ID (for `booking.rescheduled`: the new booking's). */
    bookingId: v.string(),
    uid: v.string(),
    /** Absent for bookings without organization (legacy rows, organization-less event types). */
    organizationId: v.optional(v.string()),
    /** The primary resource: a bundle's first item. */
    resourceId: v.string(),
    /** Every resource the booking holds: a bundle's items in order, else `[resourceId]`. */
    resourceIds: v.array(v.string()),
    /** `"legacy"` for `createReservation` bookings. */
    eventTypeId: v.string(),
    /** The status after the event. */
    status: bookingStatusValidator,
    /** The status before the event; set by transitions and cancellations. */
    previousStatus: v.optional(bookingStatusValidator),
    start: v.number(),
    end: v.number(),
    timezone: v.string(),
    bookerName: v.string(),
    bookerEmail: v.string(),
    eventTitle: v.string(),
    /** The reason recorded for the change, when there is one. */
    reason: v.optional(v.string()),
    /** The actor recorded in the booking history, when there is one. */
    changedBy: v.optional(v.string()),
    /** True for bookings with bundle items. */
    isMultiResource: v.boolean(),
    // `booking.rescheduled` only: the fields above describe the new booking (a
    // move keeps the status), and these name the moved original.
    /** The moved original's document ID. */
    originalBookingId: v.optional(v.string()),
    /** Equals `bookingId`. */
    newBookingId: v.optional(v.string()),
    /** The moved original's start. */
    previousStart: v.optional(v.number()),
    /** The moved original's end. */
    previousEnd: v.optional(v.number()),
});
//# sourceMappingURL=hook-events-v2.js.map