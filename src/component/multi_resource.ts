import { createBookingEmailContext } from "./emails/context.js";
import { bookingEmailOptionsValidator } from "../emails.js";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getRequiredSlots, assertValidRange } from "./utils";
import { releaseAllSlotsForBooking } from "./slot_helpers";
import {
  holdsActiveInventory,
  reserveResourceSlots,
  usesQuantityInventory,
  validateRequestedQuantity,
  validateResourceRequests,
} from "./inventory_helpers";
import { bookingDoc, bookingWithItemsDoc, successResult } from "./validators";

// Generate a secure random token (64 hex chars = 256 bits)
function generateSecureToken(): string {
  const segments: string[] = [];
  for (let i = 0; i < 8; i++) {
    segments.push(Math.random().toString(36).substring(2));
  }
  return segments.join('') + Date.now().toString(36);
}

// ============================================
// MULTI-RESOURCE AVAILABILITY CHECK
// ============================================

export const checkMultiResourceAvailability = query({
  args: {
    resources: v.array(
      v.object({
        resourceId: v.string(),
        quantity: v.optional(v.number()),
      })
    ),
    start: v.number(),
    end: v.number(),
  },
  returns: v.object({
    available: v.boolean(),
    resources: v.array(
      v.object({
        resourceId: v.string(),
        available: v.boolean(),
        requestedQuantity: v.number(),
        availableQuantity: v.number(),
        conflicts: v.array(v.number()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    assertValidRange(args.start, args.end);
    validateResourceRequests(args.resources);
    const results: Array<{
      resourceId: string;
      available: boolean;
      requestedQuantity: number;
      availableQuantity: number;
      conflicts: number[];
    }> = [];

    const requiredSlots = getRequiredSlots(args.start, args.end);

    for (const resourceReq of args.resources) {
      const requestedQty = resourceReq.quantity ?? 1;

      // Get resource to check if it's quantity-based
      const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", resourceReq.resourceId))
        .unique();

      const totalQuantity = resource?.quantity ?? 1;
      validateRequestedQuantity(resource, requestedQty);

      // For each date in the range, check availability
      let isAvailable = true;
      let minAvailable = totalQuantity;
      const conflicts: number[] = [];

      for (const [date, slots] of requiredSlots.entries()) {
        if (usesQuantityInventory(resource)) {
          // Quantity-based resource
          const quantityDoc = await ctx.db
            .query("quantity_availability")
            .withIndex("by_resource_date", (q) =>
              q.eq("resourceId", resourceReq.resourceId).eq("date", date)
            )
            .unique();

          const bookedQuantities = (quantityDoc?.slotQuantities ?? {}) as Record<
            string,
            number
          >;

          for (const slot of slots) {
            const booked = bookedQuantities[slot.toString()] ?? 0;
            const available = totalQuantity - booked;
            minAvailable = Math.min(minAvailable, available);

            if (available < requestedQty) {
              isAvailable = false;
              conflicts.push(slot);
            }
          }
        } else {
          // Regular resource (quantity = 1)
          const availability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) =>
              q.eq("resourceId", resourceReq.resourceId).eq("date", date)
            )
            .unique();

          const busySlots = availability?.busySlots ?? [];

          for (const slot of slots) {
            if (requestedQty > totalQuantity || busySlots.includes(slot)) {
              isAvailable = false;
              if (busySlots.includes(slot)) minAvailable = 0;
              conflicts.push(slot);
            }
          }
        }
      }

      results.push({
        resourceId: resourceReq.resourceId,
        available: isAvailable,
        requestedQuantity: requestedQty,
        availableQuantity: minAvailable,
        conflicts,
      });
    }

    const allAvailable = results.every((r) => r.available);

    return {
      available: allAvailable,
      resources: results,
    };
  },
});

// ============================================
// MULTI-RESOURCE BOOKING
// ============================================

export const createMultiResourceBooking = mutation({
  args: {
    eventTypeId: v.string(),
    organizationId: v.optional(v.string()),
    resources: v.array(
      v.object({
        resourceId: v.string(),
        quantity: v.optional(v.number()),
      })
    ),
    start: v.number(),
    end: v.number(),
    timezone: v.string(),
    booker: v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    location: v.optional(
      v.object({
        type: v.string(),
        value: v.optional(v.string()),
      })
    ),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // 0. Range guard — shared with every other write path (an inverted or
    // NaN range maps to zero slots and would create a booking that holds
    // nothing).
    assertValidRange(args.start, args.end);
    validateResourceRequests(args.resources);

    // 1. Get event type for metadata
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
      .unique();

    if (!eventType) {
      throw new Error(`Event type "${args.eventTypeId}" not found`);
    }

    // 2. Check ALL resources are available (fail-fast)
    const requiredSlots = getRequiredSlots(args.start, args.end);

    // `isStandalone: false` marks an add-on (e.g. rental equipment) that can
    // only be booked together with a standalone resource. Unknown resources
    // (no document) count as standalone.
    let hasStandaloneResource = false;

    for (const resourceReq of args.resources) {
      const requestedQty = resourceReq.quantity ?? 1;

      // Get resource
      const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", resourceReq.resourceId))
        .unique();

      const totalQuantity = resource?.quantity ?? 1;
      validateRequestedQuantity(resource, requestedQty);
      if (resource?.isStandalone !== false) {
        hasStandaloneResource = true;
      }

      for (const [date, slots] of requiredSlots.entries()) {
        if (usesQuantityInventory(resource)) {
          // Quantity-based
          const quantityDoc = await ctx.db
            .query("quantity_availability")
            .withIndex("by_resource_date", (q) =>
              q.eq("resourceId", resourceReq.resourceId).eq("date", date)
            )
            .unique();

          const bookedQuantities = (quantityDoc?.slotQuantities ?? {}) as Record<
            string,
            number
          >;

          for (const slot of slots) {
            const booked = bookedQuantities[slot.toString()] ?? 0;
            if (booked + requestedQty > totalQuantity) {
              throw new Error(
                `Resource "${resourceReq.resourceId}" is not available for the requested quantity`
              );
            }
          }
        } else {
          // Regular
          const availability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) =>
              q.eq("resourceId", resourceReq.resourceId).eq("date", date)
            )
            .unique();

          const busySlots = availability?.busySlots ?? [];

          for (const slot of slots) {
            if (requestedQty > totalQuantity || busySlots.includes(slot)) {
              throw new Error(
                `Resource "${resourceReq.resourceId}" is not available for the selected time`
              );
            }
          }
        }
      }
    }

    if (!hasStandaloneResource) {
      const ids = args.resources.map((r) => `"${r.resourceId}"`).join(", ");
      throw new Error(
        `Resource ${ids} cannot be booked alone (isStandalone: false): add a standalone resource to the booking`
      );
    }

    // 3. Create main booking record (use first resource as primary)
    const primaryResourceId = args.resources[0].resourceId;
    const bookingUid = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const managementToken = generateSecureToken();
    const now = Date.now();

    const bookingId = await ctx.db.insert("bookings", {
      resourceId: primaryResourceId,
      actorId: args.booker.email, // Use email as actor ID
      start: args.start,
      end: args.end,
      status: eventType.requiresConfirmation ? "pending" : "confirmed",
      uid: bookingUid,
      managementToken,
      eventTypeId: args.eventTypeId,
      organizationId: args.organizationId,
      timezone: args.timezone,
      bookerName: args.booker.name,
      bookerEmail: args.booker.email,
      bookerPhone: args.booker.phone,
      bookerNotes: args.booker.notes,
      eventTitle: eventType.title,
      eventDescription: eventType.description,
      location: args.location ?? { type: "address" },
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create booking_items for each resource
    for (const resourceReq of args.resources) {
      await ctx.db.insert("booking_items", {
        bookingId,
        resourceId: resourceReq.resourceId,
        quantity: resourceReq.quantity ?? 1,
      });
    }

    // 5. Reserve every item using the same inventory contract as rescheduling.
    await reserveResourceSlots(ctx, args.resources, args.start, args.end);

    // 6. Record initial state in history
    await ctx.db.insert("booking_history", {
      bookingId,
      fromStatus: "",
      toStatus: eventType.requiresConfirmation ? "pending" : "confirmed",
      changedBy: "system",
      reason: "Booking created",
      timestamp: now,
    });

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found after write");

    // 7. Trigger booking.created hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.created",
      emailContext: createBookingEmailContext(eventType.requiresConfirmation ? "pending" : "confirmed", booking, args.resendOptions),
      organizationId: args.organizationId,
      payload: {
        bookingId,
        resourceId: primaryResourceId,
        eventTypeId: args.eventTypeId,
        start: args.start,
        end: args.end,
        timezone: args.timezone,
        status: eventType.requiresConfirmation ? "pending" : "confirmed",
        bookerName: args.booker.name,
        bookerEmail: args.booker.email,
        eventTitle: eventType.title,
        uid: bookingUid,
        managementToken,
        isMultiResource: true,
        resources: args.resources,
      },
      resendOptions: args.resendOptions,
    });

    // 8. Return the captured booking.
    return booking;
  },
});

// ============================================
// GET BOOKING WITH ITEMS
// ============================================

export const getBookingWithItems = query({
  args: { bookingId: v.id("bookings") },
  returns: v.union(bookingWithItemsDoc, v.null()),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;

    const items = await ctx.db
      .query("booking_items")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();

    // Get resource details for each item
    const itemsWithResources = await Promise.all(
      items.map(async (item) => {
        const resource = await ctx.db
          .query("resources")
          .withIndex("by_external_id", (q) => q.eq("id", item.resourceId))
          .unique();
        return {
          ...item,
          resource,
        };
      })
    );

    return {
      ...booking,
      items: itemsWithResources,
    };
  },
});

// ============================================
// CANCEL MULTI-RESOURCE BOOKING
// ============================================

export const cancelMultiResourceBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.optional(v.string()),
    cancelledBy: v.optional(v.string()),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status === "cancelled") {
      throw new Error("Booking is already cancelled");
    }

    if (!holdsActiveInventory(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`);
    }

    // Release slots for each booked resource (quantity_availability for pooled
    // resources, daily_availability otherwise). Shared with the state-machine
    // cancel/decline path so both leave the availability tables identical.
    await releaseAllSlotsForBooking(ctx, booking);

    // Update booking status
    const now = Date.now();
    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: args.reason,
      updatedAt: now,
    });

    // Record in history
    await ctx.db.insert("booking_history", {
      bookingId: args.bookingId,
      fromStatus: booking.status,
      toStatus: "cancelled",
      changedBy: args.cancelledBy ?? "unknown",
      reason: args.reason,
      timestamp: now,
    });

    // Trigger booking.cancelled hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.cancelled",
      emailContext: createBookingEmailContext("cancelled", booking, args.resendOptions, { reason: args.reason }),
      organizationId: booking.organizationId,
      payload: {
        bookingId: args.bookingId,
        resourceId: booking.resourceId,
        eventTypeId: booking.eventTypeId,
        start: booking.start,
        end: booking.end,
        timezone: booking.timezone,
        status: "cancelled",
        bookerEmail: booking.bookerEmail,
        bookerName: booking.bookerName,
        eventTitle: booking.eventTitle,
        previousStatus: booking.status,
        reason: args.reason,
        cancelledBy: args.cancelledBy,
        isMultiResource: true,
      },
      resendOptions: args.resendOptions,
    });

    return { success: true };
  },
});
