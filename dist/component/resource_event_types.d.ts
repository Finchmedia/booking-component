import { type DatabaseReader, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
/** Whether the pair is linked; tolerates duplicate rows and writes nothing. */
export declare function isLinked(db: DatabaseReader, resourceId: string, eventTypeId: string): Promise<boolean>;
/**
 * Whether a resource may serve an event type's bookings as far as
 * organizations go: an event type with an organization takes only that
 * organization's resources; one without (a global or legacy event type) takes
 * any. Links and every booking check use this rule.
 */
export declare function sharesOrganization(resource: Doc<"resources">, eventType: Doc<"event_types">): boolean;
/**
 * Before an event type without organization is adopted into
 * `organizationId` (createEventType on its id): the links stay, so every
 * linked resource must belong to that organization, as the link mutations
 * require. Links whose resource no longer exists do not count
 * (link_integrity lists them).
 */
export declare function assertLinksAdoptable(db: DatabaseReader, eventTypeId: string, organizationId: string): Promise<void>;
/**
 * Deletes every link row of a resource or of an event type and returns how
 * many there were. deleteResource and deleteEventType call it, so an id
 * created again later starts unlinked.
 */
export declare function deleteLinks(ctx: MutationCtx, of: {
    resourceId: string;
} | {
    eventTypeId: string;
}): Promise<number>;
/**
 * Get all event types linked to a resource
 * Usage: User selects Studio A → show available event types
 */
export declare const getEventTypesForResource: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    organizationId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    scheduleId?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    requiresConfirmation?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    id: string;
    timezone: string;
    lengthInMinutes: number;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
    lockTimeZoneToggle: boolean;
    slug: string;
    title: string;
}[]>>;
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
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    metadata?: Record<string, string> | undefined;
    quantity?: number | undefined;
    type: string;
    id: string;
    organizationId: string;
    timezone: string;
    isActive: boolean;
    name: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
/**
 * Check if a specific resource-event type link exists
 */
export declare const hasResourceEventTypeLink: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    eventTypeId: string;
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
    resourceId: string;
    eventTypeId: string;
}, Promise<import("convex/values").GenericId<"resource_event_types">>>;
/**
 * Unlink a resource from an event type
 */
export declare const unlinkResourceFromEventType: import("convex/server").RegisteredMutation<"public", {
    resourceId: string;
    eventTypeId: string;
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
 * Delete all links for a resource. deleteResource does this itself since
 * 0.5.0; this removes link rows that earlier deletes left behind.
 */
export declare const deleteAllLinksForResource: import("convex/server").RegisteredMutation<"public", {
    resourceId: string;
}, Promise<{
    deleted: number;
}>>;
/**
 * Delete all links for an event type. deleteEventType does this itself since
 * 0.5.0; this removes link rows that earlier deletes left behind.
 */
export declare const deleteAllLinksForEventType: import("convex/server").RegisteredMutation<"public", {
    eventTypeId: string;
}, Promise<{
    deleted: number;
}>>;
//# sourceMappingURL=resource_event_types.d.ts.map