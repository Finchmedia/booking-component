import { assertValidRange, getRequiredSlots } from "./utils";
/** Only these states may release or move an inventory reservation. */
export function holdsActiveInventory(status) {
    return ["provisional", "pending", "confirmed"].includes(status);
}
export function assertPositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive safe integer`);
    }
}
/** Keep the existing one-unit bitmap representation compatible. */
export function usesQuantityInventory(resource) {
    return resource?.isFungible === true && (resource.quantity ?? 1) > 1;
}
export function validateResourceCapacity(resource) {
    const quantity = resource.quantity ?? 1;
    assertPositiveInteger(quantity, "Resource capacity");
    if (!resource.isFungible && quantity !== 1) {
        throw new Error("Non-fungible resources must have capacity one");
    }
}
export function validateResourceRequests(resources) {
    if (resources.length === 0)
        throw new Error("At least one resource is required");
    const seen = new Set();
    for (const resource of resources) {
        if (seen.has(resource.resourceId)) {
            throw new Error(`Duplicate resource ID: "${resource.resourceId}"`);
        }
        seen.add(resource.resourceId);
        assertPositiveInteger(resource.quantity ?? 1, "Requested quantity");
    }
}
export function validateRequestedQuantity(resource, quantity) {
    assertPositiveInteger(quantity, "Requested quantity");
    if (resource)
        validateResourceCapacity(resource);
    if (!resource?.isFungible && quantity !== 1) {
        throw new Error("Non-fungible resources require quantity one");
    }
}
export async function isFungibleResource(ctx, resourceId) {
    const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", resourceId))
        .unique();
    return resource?.isFungible === true;
}
export async function assertSingleResourceSupported(ctx, resourceId) {
    if (await isFungibleResource(ctx, resourceId)) {
        throw new Error("Fungible resources require createMultiResourceBooking with an explicit quantity");
    }
}
/** Reserve each item in the caller's mutation; a conflict rolls back the whole move. */
export async function reserveResourceSlots(ctx, resources, start, end) {
    assertValidRange(start, end);
    validateResourceRequests(resources);
    const slotsByDate = getRequiredSlots(start, end);
    for (const request of resources) {
        const resource = await ctx.db
            .query("resources")
            .withIndex("by_external_id", (q) => q.eq("id", request.resourceId))
            .unique();
        const quantity = request.quantity ?? 1;
        validateRequestedQuantity(resource, quantity);
        const capacity = resource?.quantity ?? 1;
        for (const [date, slots] of slotsByDate) {
            if (usesQuantityInventory(resource)) {
                const row = await ctx.db
                    .query("quantity_availability")
                    .withIndex("by_resource_date", (q) => q.eq("resourceId", request.resourceId).eq("date", date))
                    .unique();
                const quantities = { ...(row?.slotQuantities ?? {}) };
                for (const slot of slots) {
                    const booked = quantities[slot] ?? 0;
                    if (booked + quantity > capacity) {
                        throw new Error(`Resource "${request.resourceId}" is not available for the requested quantity`);
                    }
                    quantities[slot] = booked + quantity;
                }
                if (row)
                    await ctx.db.patch(row._id, { slotQuantities: quantities });
                else
                    await ctx.db.insert("quantity_availability", {
                        resourceId: request.resourceId,
                        date,
                        slotQuantities: quantities,
                    });
            }
            else {
                const row = await ctx.db
                    .query("daily_availability")
                    .withIndex("by_resource_date", (q) => q.eq("resourceId", request.resourceId).eq("date", date))
                    .unique();
                if (quantity > capacity ||
                    slots.some((slot) => row?.busySlots.includes(slot))) {
                    throw new Error(`Resource "${request.resourceId}" is not available for the selected time`);
                }
                const busySlots = [...(row?.busySlots ?? []), ...slots].sort((a, b) => a - b);
                if (row)
                    await ctx.db.patch(row._id, { busySlots });
                else
                    await ctx.db.insert("daily_availability", {
                        resourceId: request.resourceId,
                        date,
                        busySlots,
                    });
            }
        }
    }
}
//# sourceMappingURL=inventory_helpers.js.map