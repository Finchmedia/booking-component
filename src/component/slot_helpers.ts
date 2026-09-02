import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getRequiredSlots } from "./utils";

// ============================================
// SLOT RELEASE HELPERS
// ============================================
// Shared by every cancel-like path (cancel, decline, expire, reschedule) so
// that slot bookkeeping is done in exactly one place.

/**
 * Releases the busy slots of [start, end) on a resource's daily_availability
 * bitmap (non-fungible resources: one holder per slot). Spans UTC midnight
 * correctly because getRequiredSlots maps the slots per calendar day.
 */
export async function releaseBookingSlots(
  ctx: MutationCtx,
  resourceId: string,
  start: number,
  end: number,
): Promise<void> {
  const slotsToFree = getRequiredSlots(start, end);
  for (const [date, slots] of slotsToFree.entries()) {
    const availability = await ctx.db
      .query("daily_availability")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", resourceId).eq("date", date)
      )
      .unique();

    if (!availability) continue;

    const updatedSlots = availability.busySlots.filter(
      (slot: number) => !slots.includes(slot)
    );
    await ctx.db.patch(availability._id, { busySlots: updatedSlots });
  }
}

/**
 * Releases `quantity` units of [start, end) on a pooled (fungible) resource's
 * quantity_availability counters, clamping at zero.
 */
export async function releaseQuantitySlots(
  ctx: MutationCtx,
  resourceId: string,
  start: number,
  end: number,
  quantity: number,
): Promise<void> {
  const slotsToFree = getRequiredSlots(start, end);
  for (const [date, slots] of slotsToFree.entries()) {
    const quantityDoc = await ctx.db
      .query("quantity_availability")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", resourceId).eq("date", date)
      )
      .unique();

    if (!quantityDoc) continue;

    const bookedQuantities = {
      ...(quantityDoc.slotQuantities as Record<string, number>),
    };
    for (const slot of slots) {
      bookedQuantities[slot.toString()] = Math.max(
        0,
        (bookedQuantities[slot.toString()] ?? 0) - quantity
      );
    }
    await ctx.db.patch(quantityDoc._id, { slotQuantities: bookedQuantities });
  }
}

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
export async function releaseAllSlotsForBooking(
  ctx: MutationCtx,
  booking: Pick<Doc<"bookings">, "_id" | "resourceId" | "start" | "end">,
): Promise<void> {
  const items = await ctx.db
    .query("booking_items")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect();

  if (items.length === 0) {
    await releaseBookingSlots(ctx, booking.resourceId, booking.start, booking.end);
    return;
  }

  for (const item of items) {
    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", item.resourceId))
      .unique();

    const totalQuantity = resource?.quantity ?? 1;
    const isFungible = resource?.isFungible ?? false;

    if (isFungible && totalQuantity > 1) {
      await releaseQuantitySlots(
        ctx,
        item.resourceId,
        booking.start,
        booking.end,
        item.quantity
      );
    } else {
      await releaseBookingSlots(ctx, item.resourceId, booking.start, booking.end);
    }
  }
}
