import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { holdsActiveInventory, usesQuantityInventory, validateResourceCapacity } from "./inventory_helpers";
import { resourceDoc, successResult, successWithAffectedUsers, } from "./validators";
/** A representation change must never reinterpret an existing active hold. */
async function assertNoActiveBookings(ctx, resourceId) {
    const primaryBookings = await ctx.db.query("bookings")
        .withIndex("by_resource_start", q => q.eq("resourceId", resourceId)).collect();
    if (primaryBookings.some(booking => holdsActiveInventory(booking.status))) {
        throw new Error("Cannot change inventory mode while resource has active bookings");
    }
    const items = await ctx.db.query("booking_items")
        .withIndex("by_resource", q => q.eq("resourceId", resourceId)).collect();
    for (const item of items) {
        const booking = await ctx.db.get(item.bookingId);
        if (booking && holdsActiveInventory(booking.status)) {
            throw new Error("Cannot change inventory mode while resource has active bookings");
        }
    }
}
/** Completed bookings keep historical counters; only current/future slots constrain capacity. */
function slotIsCurrentOrFuture(date, slot, now) {
    const today = new Date(now).toISOString().slice(0, 10);
    return date > today || (date === today && slot >= Math.floor((now % 86_400_000) / 900_000));
}
// ============================================
// RESOURCE QUERIES
// ============================================
export const getResource = query({
    args: { id: v.string() },
    returns: v.union(resourceDoc, v.null()),
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.id))
            .unique();
    },
});
export const getResourceById = query({
    args: { resourceId: v.id("resources") },
    returns: v.union(resourceDoc, v.null()),
    handler: async (ctx, args) => {
        return await ctx.db.get(args.resourceId);
    },
});
export const listResources = query({
    args: {
        organizationId: v.string(),
        type: v.optional(v.string()),
        activeOnly: v.optional(v.boolean()),
    },
    returns: v.array(resourceDoc),
    handler: async (ctx, args) => {
        // by_org_type when a type is given, else by_org (same creation order either way).
        const type = args.type;
        const resources = type
            ? await ctx.db
                .query("resources")
                .withIndex("by_org_type", (q) => q.eq("organizationId", args.organizationId).eq("type", type))
                .collect()
            : await ctx.db
                .query("resources")
                .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
                .collect();
        let filtered = resources;
        // Filter active only if specified
        if (args.activeOnly) {
            filtered = filtered.filter((r) => r.isActive);
        }
        return filtered;
    },
});
export const listResourcesByType = query({
    args: {
        organizationId: v.string(),
        type: v.string(),
    },
    returns: v.array(resourceDoc),
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resources")
            .withIndex("by_org_type", (q) => q.eq("organizationId", args.organizationId).eq("type", args.type))
            .collect();
    },
});
// ============================================
// RESOURCE MUTATIONS
// ============================================
export const createResource = mutation({
    args: {
        id: v.string(),
        organizationId: v.string(),
        name: v.string(),
        type: v.string(),
        description: v.optional(v.string()),
        timezone: v.string(),
        quantity: v.optional(v.number()),
        isFungible: v.optional(v.boolean()),
        isStandalone: v.optional(v.boolean()),
        isActive: v.optional(v.boolean()),
        // Free-form host-app metadata (see schema.ts)
        metadata: v.optional(v.record(v.string(), v.string())),
    },
    returns: v.id("resources"),
    handler: async (ctx, args) => {
        validateResourceCapacity(args);
        // Check for existing ID
        const existing = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.id))
            .unique();
        if (existing) {
            throw new Error(`Resource with ID "${args.id}" already exists`);
        }
        // Legacy reservations can precede a resource document. Giving their ID a
        // pooled counter representation must not hide its existing bitmap holds.
        if (usesQuantityInventory(args)) {
            await assertNoActiveBookings(ctx, args.id);
            const now = Date.now();
            const today = new Date(now).toISOString().slice(0, 10);
            const reservedRows = await ctx.db.query("daily_availability")
                .withIndex("by_resource_date", q => q.eq("resourceId", args.id).gte("date", today)).collect();
            if (reservedRows.some(row => row.busySlots.some(slot => slotIsCurrentOrFuture(row.date, slot, now)))) {
                throw new Error("Cannot change inventory mode while resource slots are reserved");
            }
        }
        const now = Date.now();
        return await ctx.db.insert("resources", {
            id: args.id,
            organizationId: args.organizationId,
            name: args.name,
            type: args.type,
            description: args.description,
            timezone: args.timezone,
            quantity: args.quantity,
            isFungible: args.isFungible,
            isStandalone: args.isStandalone,
            metadata: args.metadata,
            isActive: args.isActive ?? true,
            createdAt: now,
            updatedAt: now,
        });
    },
});
export const updateResource = mutation({
    args: {
        id: v.string(),
        name: v.optional(v.string()),
        type: v.optional(v.string()),
        description: v.optional(v.string()),
        timezone: v.optional(v.string()),
        quantity: v.optional(v.number()),
        isFungible: v.optional(v.boolean()),
        isStandalone: v.optional(v.boolean()),
        isActive: v.optional(v.boolean()),
        // Replaces the stored map as a whole when provided (callers merge
        // beforehand). Omitting it keeps the stored map; there is no clear form —
        // remove individual keys by passing the map without them.
        metadata: v.optional(v.record(v.string(), v.string())),
    },
    returns: v.id("resources"),
    handler: async (ctx, args) => {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.id))
            .unique();
        if (!resource) {
            throw new Error(`Resource "${args.id}" not found`);
        }
        const nextCapacity = {
            quantity: args.quantity ?? resource.quantity,
            isFungible: args.isFungible ?? resource.isFungible,
        };
        validateResourceCapacity(nextCapacity);
        const changesInventoryMode = usesQuantityInventory(resource) !== usesQuantityInventory(nextCapacity);
        const reducesCapacity = (nextCapacity.quantity ?? 1) < (resource.quantity ?? 1);
        if (changesInventoryMode || reducesCapacity) {
            if (changesInventoryMode)
                await assertNoActiveBookings(ctx, args.id);
            const now = Date.now();
            const today = new Date(now).toISOString().slice(0, 10);
            const quantityRows = await ctx.db.query("quantity_availability")
                .withIndex("by_resource_date", q => q.eq("resourceId", args.id).gte("date", today)).collect();
            for (const row of quantityRows) {
                const reserved = Object.entries(row.slotQuantities)
                    .filter(([slot]) => slotIsCurrentOrFuture(row.date, Number(slot), now))
                    .map(([, count]) => count);
                if (changesInventoryMode && reserved.some(count => count > 0)) {
                    throw new Error("Cannot change inventory mode while resource slots are reserved");
                }
                if (reserved.some(count => count > (nextCapacity.quantity ?? 1))) {
                    throw new Error("Cannot reduce capacity below already reserved quantities");
                }
            }
            if (changesInventoryMode) {
                const bitmapRows = await ctx.db.query("daily_availability")
                    .withIndex("by_resource_date", q => q.eq("resourceId", args.id).gte("date", today)).collect();
                if (bitmapRows.some(row => row.busySlots.some(slot => slotIsCurrentOrFuture(row.date, slot, now)))) {
                    throw new Error("Cannot change inventory mode while resource slots are reserved");
                }
            }
        }
        const updates = { updatedAt: Date.now() };
        if (args.name !== undefined)
            updates.name = args.name;
        if (args.type !== undefined)
            updates.type = args.type;
        if (args.description !== undefined)
            updates.description = args.description;
        if (args.timezone !== undefined)
            updates.timezone = args.timezone;
        if (args.quantity !== undefined)
            updates.quantity = args.quantity;
        if (args.isFungible !== undefined)
            updates.isFungible = args.isFungible;
        if (args.isStandalone !== undefined)
            updates.isStandalone = args.isStandalone;
        if (args.isActive !== undefined)
            updates.isActive = args.isActive;
        if (args.metadata !== undefined)
            updates.metadata = args.metadata;
        await ctx.db.patch(resource._id, updates);
        return resource._id;
    },
});
export const deleteResource = mutation({
    args: { id: v.string() },
    returns: successResult,
    handler: async (ctx, args) => {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.id))
            .unique();
        if (!resource) {
            throw new Error(`Resource "${args.id}" not found`);
        }
        // Check for existing bookings (prefix query on the compound index)
        const bookings = await ctx.db
            .query("bookings")
            .withIndex("by_resource_start", (q) => q.eq("resourceId", args.id))
            .first();
        const bookedItem = await ctx.db.query("booking_items")
            .withIndex("by_resource", q => q.eq("resourceId", args.id)).first();
        if (bookings || bookedItem) {
            throw new Error("Cannot delete resource with existing bookings. Deactivate it instead.");
        }
        await ctx.db.delete(resource._id);
        return { success: true };
    },
});
export const toggleResourceActive = mutation({
    args: {
        id: v.string(),
        isActive: v.boolean(),
    },
    returns: successWithAffectedUsers,
    handler: async (ctx, args) => {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.id))
            .unique();
        if (!resource) {
            throw new Error(`Resource "${args.id}" not found`);
        }
        // Check for active presence (final safety guard). Deliberately no
        // [resourceId, updated] index — `updated` churns on every heartbeat and
        // this is a rare admin write, so the JS staleness filter is the cheaper trade.
        const TIMEOUT_MS = 10_000;
        const now = Date.now();
        const presenceRecords = await ctx.db
            .query("presence")
            .withIndex("by_resource_slot_updated", (q) => q.eq("resourceId", args.id))
            .collect();
        const activePresence = presenceRecords.filter((p) => now - p.updated <= TIMEOUT_MS);
        const uniqueUsers = [...new Set(activePresence.map((p) => p.user))];
        const affectedUsers = uniqueUsers.length;
        if (affectedUsers > 0) {
            console.warn(`[toggleResourceActive] Warning: ${affectedUsers} user(s) currently booking resource "${args.id}". ` +
                `Toggling status to ${args.isActive ? "active" : "inactive"} anyway. ` +
                `Users: ${uniqueUsers.join(", ")}`);
        }
        await ctx.db.patch(resource._id, {
            isActive: args.isActive,
            updatedAt: Date.now(),
        });
        return { success: true, affectedUsers };
    },
});
// ============================================
// RESOURCE AVAILABILITY HELPERS
// ============================================
export const getResourceAvailability = query({
    args: {
        resourceId: v.string(),
        date: v.string(),
    },
    returns: v.array(v.number()),
    handler: async (ctx, args) => {
        const resource = await ctx.db.query("resources")
            .withIndex("by_external_id", q => q.eq("id", args.resourceId)).unique();
        if (usesQuantityInventory(resource)) {
            const quantityDoc = await ctx.db.query("quantity_availability")
                .withIndex("by_resource_date", q => q.eq("resourceId", args.resourceId).eq("date", args.date)).unique();
            const counts = (quantityDoc?.slotQuantities ?? {});
            return Object.entries(counts)
                .filter(([, count]) => count >= (resource?.quantity ?? 1))
                .map(([slot]) => Number(slot)).sort((a, b) => a - b);
        }
        const availability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) => q.eq("resourceId", args.resourceId).eq("date", args.date))
            .unique();
        return availability?.busySlots ?? [];
    },
});
// For quantity-based resources
export const getQuantityAvailability = query({
    args: {
        resourceId: v.string(),
        date: v.string(),
    },
    // `slotQuantities` is `v.any()` in schema.ts; do not tighten it here.
    returns: v.object({ totalQuantity: v.number(), bookedQuantities: v.any() }),
    handler: async (ctx, args) => {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
            .unique();
        if (!resource) {
            return { totalQuantity: 0, bookedQuantities: {} };
        }
        if (!usesQuantityInventory(resource)) {
            const availability = await ctx.db.query("daily_availability")
                .withIndex("by_resource_date", q => q.eq("resourceId", args.resourceId).eq("date", args.date)).unique();
            return {
                totalQuantity: resource.quantity ?? 1,
                bookedQuantities: Object.fromEntries((availability?.busySlots ?? []).map(slot => [String(slot), 1])),
            };
        }
        const quantityDoc = await ctx.db
            .query("quantity_availability")
            .withIndex("by_resource_date", (q) => q.eq("resourceId", args.resourceId).eq("date", args.date))
            .unique();
        return {
            totalQuantity: resource.quantity ?? 1,
            bookedQuantities: quantityDoc?.slotQuantities ?? {},
        };
    },
});
//# sourceMappingURL=resources.js.map