// ============================================
// BOOKING STATUSES
// ============================================
//
// Every value the component stores in `bookings.status`, declared once: the
// schema, the history table, the transition and list arguments, the return
// validators (derived from the schema) and the version 2 hook payload use
// this set, so the generated types carry it instead of `string`.
//
// - "provisional": a hold from createProvisionalBooking; not listed by
//   default, never notified.
// - "pending": awaits approval (the event type requires confirmation).
// - "confirmed": booked.
// - "cancelled": ended by a cancel, an expiry, or a move (the moved
//   original; its successor keeps the status).
// - "declined": a pending request an administrator rejected.
// - "completed": a confirmed booking marked done.
//
// Only `convex/values` is imported: the root entry exports the set for host
// functions, and @mrfinch/booking/react may read it in the browser.
import { v } from "convex/values";
/** Every status a booking can have, in lifecycle order. */
export const BOOKING_STATUSES = [
    "provisional",
    "pending",
    "confirmed",
    "cancelled",
    "declined",
    "completed",
];
/** The validator of a booking status: one literal per entry of BOOKING_STATUSES. */
export const bookingStatusValidator = v.union(...BOOKING_STATUSES.map((status) => v.literal(status)));
/** True for a value this version of the package stores as a booking status. */
export function isBookingStatus(value) {
    return typeof value === "string" && BOOKING_STATUSES.includes(value);
}
//# sourceMappingURL=booking-status.js.map