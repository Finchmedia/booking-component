import { assertValidRange, getRequiredSlots } from "./utils";
import { assertSingleResourceSupported } from "./inventory_helpers";
import { isLinked } from "./resource_event_types";
import { releaseAllSlotsForBooking } from "./slot_helpers";
// ============================================
// BOOKING LIFECYCLE
// ============================================
// Steps several entry points share. Payloads, hooks and error texts of the
// individual entry points stay with them.
/**
 * The checks createBooking and createProvisionalBooking share, in the order
 * hosts see their errors: range, pool, event type (exists, active), resource
 * (exists, active, standalone), link, free slots. Returns the event type and
 * the slots to hold per UTC date.
 */
export async function assertSingleBookable(ctx, args) {
    // Basic range validation (shared guard): NaN/Infinity and end <= start
    // would otherwise silently reserve zero slots.
    assertValidRange(args.start, args.end);
    await assertSingleResourceSupported(ctx, args.resourceId);
    // Event type (for the snapshot) must exist and be active.
    const eventType = await ctx.db
        .query("event_types")
        .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
        .first();
    if (!eventType)
        throw new Error("Event type not found");
    if (eventType.isActive === false) {
        throw new Error("Event type is no longer active");
    }
    // Resource must exist and be active.
    const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
        .unique();
    if (!resource)
        throw new Error("Resource not found");
    if (resource.isActive === false) {
        throw new Error("Resource is no longer active");
    }
    // A single-resource booking books the resource on its own — not allowed
    // for add-ons (isStandalone: false); use createMultiResourceBooking with a
    // standalone resource instead.
    if (resource.isStandalone === false) {
        throw new Error(`Resource "${args.resourceId}" cannot be booked alone (isStandalone: false)`);
    }
    if (!(await isLinked(ctx.db, args.resourceId, args.eventTypeId))) {
        throw new Error("Resource is not available for this event type");
    }
    // Availability per calendar day. getRequiredSlots maps a range spanning
    // UTC midnight to the correct slots of each day (the former
    // `start % 86400000` chunk math reserved nothing across midnight).
    const requiredSlots = getRequiredSlots(args.start, args.end);
    for (const [date, slots] of requiredSlots.entries()) {
        const dayAvailability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) => q.eq("resourceId", args.resourceId).eq("date", date))
            .unique();
        if (dayAvailability) {
            for (const slot of slots) {
                if (dayAvailability.busySlots.includes(slot)) {
                    throw new Error("Time slot no longer available");
                }
            }
        }
    }
    return { eventType, requiredSlots };
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
//# sourceMappingURL=booking_lifecycle.js.map