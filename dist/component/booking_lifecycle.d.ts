import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
/**
 * The checks createBooking and createProvisionalBooking share, in the order
 * hosts see their errors: range, pool, event type (exists, active), resource
 * (exists, active, standalone), link, free slots. Returns the event type and
 * the slots to hold per UTC date.
 */
export declare function assertSingleBookable(ctx: QueryCtx, args: {
    eventTypeId: string;
    resourceId: string;
    start: number;
    end: number;
}): Promise<{
    eventType: Doc<"event_types">;
    requiredSlots: Map<string, number[]>;
}>;
/**
 * Ends an active booking (provisional, pending or confirmed; the caller has
 * checked): releases everything it holds, records one history row and stamps
 * status, cancelledAt, updatedAt and cancellationReason.
 *
 * Releases from the pre-cancel snapshot BEFORE patching the status:
 * releaseAllSlotsForBooking returns early for terminal statuses, so a
 * re-read of the patched row would silently keep the inventory busy.
 */
export declare function terminateBooking(ctx: MutationCtx, booking: Doc<"bookings">, opts: {
    to: "cancelled" | "declined";
    reason?: string;
    changedBy?: string;
    now: number;
}): Promise<void>;
//# sourceMappingURL=booking_lifecycle.d.ts.map