/**
 * Get all event types linked to a resource
 * Usage: User selects Studio A → show available event types
 */
export declare const getEventTypesForResource: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
}, Promise<({
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    organizationId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    description?: string | undefined;
    scheduleId?: string | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    id: string;
    slug: string;
    title: string;
    lengthInMinutes: number;
    timezone: string;
    lockTimeZoneToggle: boolean;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
} | null)[]>>;
/**
 * Get all resources linked to an event type
 * Usage: Admin views event type → show linked resources
 */
export declare const getResourcesForEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"resources">;
    _creationTime: number;
    description?: string | undefined;
    quantity?: number | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    id: string;
    type: string;
    organizationId: string;
    timezone: string;
    isActive: boolean;
    name: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
/**
 * Check if a specific link exists
 */
export declare const hasLink: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
    resourceId: string;
}, Promise<boolean>>;
/**
 * Get all resource IDs linked to an event type (lightweight)
 * Returns just IDs for cases where you don't need full resource data
 */
export declare const getResourceIdsForEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<string[]>>;
/**
 * Get all event type IDs linked to a resource (lightweight)
 */
export declare const getEventTypeIdsForResource: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
}, Promise<string[]>>;
/**
 * Link a resource to an event type
 */
export declare const linkResourceToEventType: import("convex/server").RegisteredMutation<"public", {
    eventTypeId: string;
    resourceId: string;
}, Promise<import("convex/values").GenericId<"resource_event_types">>>;
/**
 * Unlink a resource from an event type
 */
export declare const unlinkResourceFromEventType: import("convex/server").RegisteredMutation<"public", {
    eventTypeId: string;
    resourceId: string;
}, Promise<{
    success: boolean;
    existed: boolean;
}>>;
/**
 * Set all resources for an event type (replace existing links)
 * Usage: Admin updates event type form with resource checkboxes
 */
export declare const setResourcesForEventType: import("convex/server").RegisteredMutation<"public", {
    eventTypeId: string;
    resourceIds: string[];
}, Promise<{
    success: boolean;
}>>;
/**
 * Set all event types for a resource (replace existing links)
 * Usage: Admin updates resource form with event type checkboxes
 */
export declare const setEventTypesForResource: import("convex/server").RegisteredMutation<"public", {
    resourceId: string;
    eventTypeIds: string[];
}, Promise<{
    success: boolean;
}>>;
/**
 * Delete all links for a resource (used when deleting a resource)
 */
export declare const deleteAllLinksForResource: import("convex/server").RegisteredMutation<"public", {
    resourceId: string;
}, Promise<{
    deleted: number;
}>>;
/**
 * Delete all links for an event type (used when deleting an event type)
 */
export declare const deleteAllLinksForEventType: import("convex/server").RegisteredMutation<"public", {
    eventTypeId: string;
}, Promise<{
    deleted: number;
}>>;
//# sourceMappingURL=resource_event_types.d.ts.map