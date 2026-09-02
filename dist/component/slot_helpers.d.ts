import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
/**
 * Releases the busy slots of [start, end) on a resource's daily_availability
 * bitmap (non-fungible resources: one holder per slot). Spans UTC midnight
 * correctly because getRequiredSlots maps the slots per calendar day.
 */
export declare function releaseBookingSlots(ctx: MutationCtx, resourceId: string, start: number, end: number): Promise<void>;
/**
 * Releases `quantity` units of [start, end) on a pooled (fungible) resource's
 * quantity_availability counters, clamping at zero.
 */
export declare function releaseQuantitySlots(ctx: MutationCtx, resourceId: string, start: number, end: number, quantity: number): Promise<void>;
/**
 * Releases everything a booking currently holds.
 *
 * - Multi-resource bookings (booking_items present): released per item —
 *   quantity_availability for pooled resources (isFungible && quantity > 1),
 *   daily_availability otherwise. This is the same logic
 *   cancelMultiResourceBooking uses, so a cancel/decline through
 *   transitionBookingState and a cancelMultiResourceBooking call leave the
 *   availability tables in the same state. booking_items rows are kept as the
 *   record of what was booked (getBookingWithItems keeps working).
 * - Single-resource bookings (no items): daily_availability of
 *   booking.resourceId.
 */
export declare function releaseAllSlotsForBooking(ctx: MutationCtx, booking: Pick<Doc<"bookings">, "_id" | "resourceId" | "start" | "end">): Promise<void>;
//# sourceMappingURL=slot_helpers.d.ts.map