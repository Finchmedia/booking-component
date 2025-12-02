/**
 * Get all event types linked to a resource
 * Usage: User selects Studio A → show available event types
 */
export declare const getEventTypesForResource: any;
/**
 * Get all resources linked to an event type
 * Usage: Admin views event type → show linked resources
 */
export declare const getResourcesForEventType: any;
/**
 * Check if a specific resource-event type link exists
 */
export declare const hasResourceEventTypeLink: any;
/**
 * Get all resource IDs linked to an event type (lightweight)
 * Returns just IDs for cases where you don't need full resource data
 */
export declare const getResourceIdsForEventType: any;
/**
 * Get all event type IDs linked to a resource (lightweight)
 */
export declare const getEventTypeIdsForResource: any;
/**
 * Link a resource to an event type
 */
export declare const linkResourceToEventType: any;
/**
 * Unlink a resource from an event type
 */
export declare const unlinkResourceFromEventType: any;
/**
 * Set all resources for an event type (replace existing links)
 * Usage: Admin updates event type form with resource checkboxes
 */
export declare const setResourcesForEventType: any;
/**
 * Set all event types for a resource (replace existing links)
 * Usage: Admin updates resource form with event type checkboxes
 */
export declare const setEventTypesForResource: any;
/**
 * Delete all links for a resource (used when deleting a resource)
 */
export declare const deleteAllLinksForResource: any;
/**
 * Delete all links for an event type (used when deleting an event type)
 */
export declare const deleteAllLinksForEventType: any;
//# sourceMappingURL=resource_event_types.d.ts.map