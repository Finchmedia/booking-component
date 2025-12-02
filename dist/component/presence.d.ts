/**
 * signals that a user is present in one or more slots (time slots).
 * Updates their timestamp and ensures a cleanup job is scheduled for each slot.
 * Accepts an array of slots to batch multiple heartbeats into a single transaction.
 */
export declare const heartbeat: any;
/**
 * Explicitly removes a user from one or more slots.
 * Called when a user navigates away or unmounts.
 * Accepts an array of slots to batch multiple leave operations into a single transaction.
 */
export declare const leave: any;
/**
 * Returns a list of users currently present in a slot.
 * filters out stale entries just in case cleanup hasn't run yet.
 */
export declare const list: any;
/**
 * Returns all active presence holds for a specific resource on a given date.
 * Uses range query optimization to efficiently fetch all slots with a date prefix.
 *
 * @param resourceId - The resource ID (e.g., "studio-a")
 * @param date - The date prefix in ISO format (e.g., "2025-11-28")
 * @returns Array of active presence records for that resource+date
 */
export declare const getDatePresence: any;
/**
 * Returns count of unique users with active presence for a resource or event type.
 * Used by admin UI to warn before deactivating resources/event types.
 *
 * @param resourceId - Optional resource ID to filter by
 * @param eventTypeId - Optional event type ID to filter by
 * @returns Object with count and array of unique user IDs
 */
export declare const getActivePresenceCount: any;
/**
 * Internal mutation run by the scheduler.
 * Checks if a user has timed out. If so, deletes them.
 * If they are still active, reschedules itself.
 */
export declare const cleanup: any;
//# sourceMappingURL=presence.d.ts.map