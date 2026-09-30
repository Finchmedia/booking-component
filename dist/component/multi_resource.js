import { createBookingEmailContext } from "./emails/context.js";
import { bookingEmailOptionsValidator } from "../emails.js";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getRequiredSlots, assertValidRange } from "./utils";
import { assertOrganizationOfResources, assertResourcesBookable, buildHookEventV2, loadBookableEventType, terminateBooking, withEventTypeOrganization, } from "./booking_lifecycle";
import { generateManagementToken } from "./tokens";
import { holdsActiveInventory, reserveResourceSlots, usesQuantityInventory, validateRequestedQuantity, validateResourceRequests, } from "./inventory_helpers";
import { bookingDoc, bookingWithItemsDoc, successResult } from "./validators";
import { throwBookingError } from "../shared/booking-errors.js";
import { assertBookingDetails } from "./input_validation";
// ============================================
// MULTI-RESOURCE AVAILABILITY CHECK
// ============================================
export const checkMultiResourceAvailability = query({
    args: {
        resources: v.array(v.object({
            resourceId: v.string(),
            quantity: v.optional(v.number()),
        })),
        start: v.number(),
        end: v.number(),
    },
    returns: v.object({
        available: v.boolean(),
        resources: v.array(v.object({
            resourceId: v.string(),
            available: v.boolean(),
            requestedQuantity: v.number(),
            availableQuantity: v.number(),
            conflicts: v.array(v.number()),
        })),
    }),
    handler: async (ctx, args) => {
        assertValidRange(args.start, args.end);
        validateResourceRequests(args.resources);
        const results = [];
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
            const conflicts = [];
            for (const [date, slots] of requiredSlots.entries()) {
                if (usesQuantityInventory(resource)) {
                    // Quantity-based resource
                    const quantityDoc = await ctx.db
                        .query("quantity_availability")
                        .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", resourceReq.resourceId).eq("date", date))
                        .unique();
                    const bookedQuantities = quantityDoc?.slotQuantities ?? {};
                    for (const slot of slots) {
                        const booked = bookedQuantities[slot.toString()] ?? 0;
                        const available = totalQuantity - booked;
                        minAvailable = Math.min(minAvailable, available);
                        if (available < requestedQty) {
                            isAvailable = false;
                            conflicts.push(slot);
                        }
                    }
                }
                else {
                    // Regular resource (quantity = 1)
                    const availability = await ctx.db
                        .query("daily_availability")
                        .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", resourceReq.resourceId).eq("date", date))
                        .unique();
                    const busySlots = availability?.busySlots ?? [];
                    for (const slot of slots) {
                        if (requestedQty > totalQuantity || busySlots.includes(slot)) {
                            isAvailable = false;
                            if (busySlots.includes(slot))
                                minAvailable = 0;
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
        resources: v.array(v.object({
            resourceId: v.string(),
            quantity: v.optional(v.number()),
        })),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        booker: v.object({
            name: v.string(),
            email: v.string(),
            phone: v.optional(v.string()),
            notes: v.optional(v.string()),
        }),
        location: v.optional(v.object({
            type: v.string(),
            value: v.optional(v.string()),
        })),
        // Resend config passed from main app (components can't access process.env)
        resendOptions: v.optional(bookingEmailOptionsValidator),
    },
    returns: bookingDoc,
    handler: async (ctx, args) => {
        // 0. Zone and booker address, as for single bookings. Range guard —
        // shared with every other write path (an inverted or NaN range maps to
        // zero slots and would create a booking that holds nothing).
        assertBookingDetails(args);
        assertValidRange(args.start, args.end);
        validateResourceRequests(args.resources);
        // 1. The event type exists and is active.
        const eventType = await loadBookableEventType(ctx, args.eventTypeId, "bundle");
        // The bundle belongs to its event type's organization, as single bookings
        // do. A different organizationId is rejected; for an event type without
        // organization the argument is the fallback, and it must be the
        // organization of the booked resources (checked below). Used for the row
        // and for hook routing alike.
        if (eventType.organizationId !== undefined &&
            args.organizationId !== undefined &&
            args.organizationId !== eventType.organizationId) {
            throwBookingError("ORGANIZATION_MISMATCH", `Organization "${args.organizationId}" does not match the organization of event type "${args.eventTypeId}"`);
        }
        const organizationId = eventType.organizationId ?? args.organizationId;
        // 2. Every item exists, is active, is linked and shares the event type's
        // organization, all items share one organization (also under an event
        // type without organization), and at least one of them is standalone
        // (the add-on rule counts only these eligible resources). Unknown ids are
        // rejected.
        const resourcesOrganizationId = await assertResourcesBookable(ctx, eventType, args.resources.map((r) => r.resourceId), "bundle");
        assertOrganizationOfResources(eventType, args.organizationId, resourcesOrganizationId, args.resources[0].resourceId);
        // 3. Check ALL resources are available (fail-fast)
        const requiredSlots = getRequiredSlots(args.start, args.end);
        for (const resourceReq of args.resources) {
            const requestedQty = resourceReq.quantity ?? 1;
            // Get resource
            const resource = await ctx.db
                .query("resources")
                .withIndex("by_external_id", (q) => q.eq("id", resourceReq.resourceId))
                .unique();
            const totalQuantity = resource?.quantity ?? 1;
            validateRequestedQuantity(resource, requestedQty);
            for (const [date, slots] of requiredSlots.entries()) {
                if (usesQuantityInventory(resource)) {
                    // Quantity-based
                    const quantityDoc = await ctx.db
                        .query("quantity_availability")
                        .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", resourceReq.resourceId).eq("date", date))
                        .unique();
                    const bookedQuantities = quantityDoc?.slotQuantities ?? {};
                    for (const slot of slots) {
                        const booked = bookedQuantities[slot.toString()] ?? 0;
                        if (booked + requestedQty > totalQuantity) {
                            throwBookingError("QUANTITY_UNAVAILABLE", `Resource "${resourceReq.resourceId}" is not available for the requested quantity`);
                        }
                    }
                }
                else {
                    // Regular
                    const availability = await ctx.db
                        .query("daily_availability")
                        .withIndex("by_resourceId_and_date", (q) => q.eq("resourceId", resourceReq.resourceId).eq("date", date))
                        .unique();
                    const busySlots = availability?.busySlots ?? [];
                    for (const slot of slots) {
                        if (requestedQty > totalQuantity || busySlots.includes(slot)) {
                            throwBookingError("SLOT_UNAVAILABLE", `Resource "${resourceReq.resourceId}" is not available for the selected time`);
                        }
                    }
                }
            }
        }
        // 4. Create main booking record (use first resource as primary)
        const primaryResourceId = args.resources[0].resourceId;
        const bookingUid = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const managementToken = generateManagementToken();
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
            organizationId,
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
        // 5. Create booking_items for each resource
        for (const resourceReq of args.resources) {
            await ctx.db.insert("booking_items", {
                bookingId,
                resourceId: resourceReq.resourceId,
                quantity: resourceReq.quantity ?? 1,
            });
        }
        // 6. Reserve every item using the same inventory contract as rescheduling.
        await reserveResourceSlots(ctx, args.resources, args.start, args.end);
        // 7. Record initial state in history
        await ctx.db.insert("booking_history", {
            bookingId,
            fromStatus: "",
            toStatus: eventType.requiresConfirmation ? "pending" : "confirmed",
            changedBy: "system",
            reason: "Booking created",
            timestamp: now,
        });
        const booking = await ctx.db.get(bookingId);
        if (!booking)
            throw new Error("Booking not found after write");
        // 8. Trigger booking.created hook
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.created",
            emailContext: createBookingEmailContext(eventType.requiresConfirmation ? "pending" : "confirmed", booking, args.resendOptions),
            organizationId,
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
            payloadV2: await buildHookEventV2(ctx, "booking.created", bookingId, { changedBy: "system" }),
            resendOptions: args.resendOptions,
        });
        // 9. Return the captured booking.
        return booking;
    },
});
// ============================================
// GET BOOKING WITH ITEMS
// ============================================
/** The whole booking, `managementToken` included (see public.getBookingByUid), plus its items. */
export const getBookingWithItems = query({
    args: { bookingId: v.id("bookings") },
    returns: v.union(bookingWithItemsDoc, v.null()),
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.bookingId);
        if (!booking)
            return null;
        const items = await ctx.db
            .query("booking_items")
            .withIndex("by_bookingId", (q) => q.eq("bookingId", args.bookingId))
            .collect();
        // Get resource details for each item
        const itemsWithResources = await Promise.all(items.map(async (item) => {
            const resource = await ctx.db
                .query("resources")
                .withIndex("by_external_id", (q) => q.eq("id", item.resourceId))
                .unique();
            return {
                ...item,
                resource,
            };
        }));
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
            throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
        }
        if (booking.status === "cancelled") {
            throwBookingError("INVALID_STATE", "Booking is already cancelled");
        }
        if (!holdsActiveInventory(booking.status)) {
            throwBookingError("INVALID_STATE", `Cannot cancel booking with status: ${booking.status}`);
        }
        // Notify the event type's organization when the booking's resources
        // agree, else the stored one (withEventTypeOrganization). Release every
        // booked resource (quantity_availability for pooled resources,
        // daily_availability otherwise), record history and stamp the
        // cancellation — shared with every other cancel path.
        const notified = await withEventTypeOrganization(ctx, booking);
        const changedBy = args.cancelledBy ?? "unknown";
        await terminateBooking(ctx, booking, {
            to: "cancelled",
            reason: args.reason,
            changedBy,
            now: Date.now(),
        });
        // Trigger booking.cancelled hook
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.cancelled",
            emailContext: createBookingEmailContext("cancelled", notified, args.resendOptions, { reason: args.reason }),
            organizationId: notified.organizationId,
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
            payloadV2: await buildHookEventV2(ctx, "booking.cancelled", booking._id, {
                previousStatus: booking.status,
                reason: args.reason,
                changedBy,
            }),
            resendOptions: args.resendOptions,
        });
        return { success: true };
    },
});
//# sourceMappingURL=multi_resource.js.map