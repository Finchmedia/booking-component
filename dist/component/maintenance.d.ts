/**
 * Deletes ALL booking data (bookings + history + items + slot occupancy) but
 * keeps the setup (resources, schedules, event types, links, hooks). Afterwards
 * the calendar is empty and every slot is free again.
 */
export declare const wipeAllBookingData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    bookings: number;
    bookingHistory: number;
    bookingItems: number;
    dailyAvailability: number;
    quantityAvailability: number;
}>>;
/**
 * Deletes ALL component data: booking data (see wipeAllBookingData) AND the
 * setup tables (resources, schedules, date overrides, event types,
 * resource ↔ event type links, hooks). Presence tables are left alone.
 * Intended for sandbox resets before re-seeding.
 */
export declare const wipeAllData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    resources: number;
    schedules: number;
    dateOverrides: number;
    eventTypes: number;
    resourceEventTypes: number;
    hooks: number;
    bookings: number;
    bookingHistory: number;
    bookingItems: number;
    dailyAvailability: number;
    quantityAvailability: number;
}>>;
/**
 * Raw slot occupancy of one resource/day — for verification and debugging
 * (getDaySlots only returns the FREE slots and says nothing about bookings).
 * Returns the busySlots array, or null when no row exists for that day.
 */
export declare const getDailyAvailability: import("convex/server").RegisteredQuery<"public", {
    date: string;
    resourceId: string;
}, Promise<number[] | null>>;
//# sourceMappingURL=maintenance.d.ts.map