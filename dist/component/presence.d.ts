/**
 * signals that a user is present in one or more slots (time slots).
 * Updates their timestamp and ensures a cleanup job is scheduled for each slot.
 * Accepts an array of slots to batch multiple heartbeats into a single transaction.
 */
export declare const heartbeat: import("convex/server").RegisteredMutation<"public", {
    eventTypeId?: string | undefined;
    data?: any;
    resourceId: string;
    user: string;
    slots: string[];
}, Promise<void>>;
/**
 * Explicitly removes a user from one or more slots.
 * Called when a user navigates away or unmounts.
 * Accepts an array of slots to batch multiple leave operations into a single transaction.
 */
export declare const leave: import("convex/server").RegisteredMutation<"public", {
    resourceId: string;
    user: string;
    slots: string[];
}, Promise<void>>;
/**
 * Returns a list of users currently present in a slot.
 * filters out stale entries just in case cleanup hasn't run yet.
 */
export declare const list: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    slot: string;
}, Promise<{
    _id: import("convex/values").GenericId<"presence">;
    _creationTime: number;
    eventTypeId?: string | undefined;
    data?: any;
    resourceId: string;
    user: string;
    slot: string;
    updated: number;
}[]>>;
/**
 * Returns all active presence holds for a specific resource on a given date.
 * Uses range query optimization to efficiently fetch all slots with a date prefix.
 *
 * @param resourceId - The resource ID (e.g., "studio-a")
 * @param date - The date prefix in ISO format (e.g., "2025-11-28")
 * @returns Array of active presence records for that resource+date
 */
export declare const getDatePresence: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    date: string;
}, Promise<{
    slot: string;
    user: string;
    updated: number;
}[]>>;
/**
 * Returns count of unique users with active presence for a resource or event type.
 * Used by admin UI to warn before deactivating resources/event types.
 *
 * @param resourceId - Optional resource ID to filter by
 * @param eventTypeId - Optional event type ID to filter by
 * @returns Object with count and array of unique user IDs
 */
export declare const getActivePresenceCount: import("convex/server").RegisteredQuery<"public", {
    eventTypeId?: string | undefined;
    resourceId?: string | undefined;
}, Promise<{
    count: number;
    users: string[];
}>>;
/**
 * Internal mutation run by the scheduler.
 * Checks if a user has timed out. If so, deletes them.
 * If they are still active, reschedules itself.
 */
export declare const cleanup: import("convex/server").RegisteredMutation<"internal", {
    resourceId: string;
    user: string;
    slot: string;
}, Promise<void>>;
//# sourceMappingURL=presence.d.ts.map