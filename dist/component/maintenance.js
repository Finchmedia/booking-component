// ============================================
// MAINTENANCE / RESET
// ============================================
//
// The component's tables are isolated from the host app — it cannot touch them
// through its own ctx.db. Demo sandboxes, seed scripts and test fixtures
// therefore need reset functions INSIDE the component.
//
// Two levels:
// - wipeAllBookingData: bookings + history + items + slot occupancy. Keeps the
//   setup (resources, schedules, overrides, event types, links, hooks) so the
//   calendar is empty but still bookable.
// - wipeAllData: everything above PLUS the setup tables. Presence tables are
//   left alone in both cases: they are transient real-time locks holding
//   references to scheduled functions (markAsGone) and expire on their own.
//
// Both mutations are unauthenticated at the component boundary — the host app
// decides who may call them (wrap them in an admin-only mutation).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
// Resets run on modest data sets; the batch keeps per-iteration memory small.
// Convex transaction limits remain the hard upper bound for a single call.
const DELETE_BATCH = 500;
async function deleteAllRows(ctx, table) {
    let deleted = 0;
    for (;;) {
        const rows = await ctx.db.query(table).take(DELETE_BATCH);
        if (rows.length === 0)
            break;
        for (const row of rows) {
            await ctx.db.delete(row._id);
        }
        deleted += rows.length;
        if (rows.length < DELETE_BATCH)
            break;
    }
    return deleted;
}
const bookingDataCounts = {
    bookings: v.number(),
    bookingHistory: v.number(),
    bookingItems: v.number(),
    dailyAvailability: v.number(),
    quantityAvailability: v.number(),
};
async function wipeBookingData(ctx) {
    // Dependent rows first, then the bookings themselves.
    const bookingHistory = await deleteAllRows(ctx, "booking_history");
    const bookingItems = await deleteAllRows(ctx, "booking_items");
    const bookings = await deleteAllRows(ctx, "bookings");
    const dailyAvailability = await deleteAllRows(ctx, "daily_availability");
    const quantityAvailability = await deleteAllRows(ctx, "quantity_availability");
    return {
        bookings,
        bookingHistory,
        bookingItems,
        dailyAvailability,
        quantityAvailability,
    };
}
/**
 * Deletes ALL booking data (bookings + history + items + slot occupancy) but
 * keeps the setup (resources, schedules, event types, links, hooks). Afterwards
 * the calendar is empty and every slot is free again.
 */
export const wipeAllBookingData = mutation({
    args: {},
    returns: v.object(bookingDataCounts),
    handler: async (ctx) => {
        return await wipeBookingData(ctx);
    },
});
/**
 * Deletes ALL component data: booking data (see wipeAllBookingData) AND the
 * setup tables (resources, schedules, date overrides, event types,
 * resource ↔ event type links, hooks). Presence tables are left alone.
 * Intended for sandbox resets before re-seeding.
 */
export const wipeAllData = mutation({
    args: {},
    returns: v.object({
        ...bookingDataCounts,
        resources: v.number(),
        schedules: v.number(),
        dateOverrides: v.number(),
        eventTypes: v.number(),
        resourceEventTypes: v.number(),
        hooks: v.number(),
    }),
    handler: async (ctx) => {
        const bookingData = await wipeBookingData(ctx);
        // Dependent setup rows first (overrides reference schedules, links
        // reference resources/event types), then the parents.
        const dateOverrides = await deleteAllRows(ctx, "date_overrides");
        const resourceEventTypes = await deleteAllRows(ctx, "resource_event_types");
        const hooks = await deleteAllRows(ctx, "hooks");
        const schedules = await deleteAllRows(ctx, "schedules");
        const eventTypes = await deleteAllRows(ctx, "event_types");
        const resources = await deleteAllRows(ctx, "resources");
        return {
            ...bookingData,
            resources,
            schedules,
            dateOverrides,
            eventTypes,
            resourceEventTypes,
            hooks,
        };
    },
});
/**
 * Raw slot occupancy of one resource/day — for verification and debugging
 * (getDaySlots only returns the FREE slots and says nothing about bookings).
 * Returns the busySlots array, or null when no row exists for that day.
 */
export const getDailyAvailability = query({
    args: { resourceId: v.string(), date: v.string() },
    returns: v.union(v.null(), v.array(v.number())),
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) => q.eq("resourceId", args.resourceId).eq("date", args.date))
            .unique();
        return row?.busySlots ?? null;
    },
});
//# sourceMappingURL=maintenance.js.map