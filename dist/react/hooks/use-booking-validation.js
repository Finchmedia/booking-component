"use client";
import { useMemo } from "react";
import { allowedDurations } from "../../shared/durations.js";
/**
 * @internal The error for a missing event type: the host's getEventType
 * resolved to null. Shared by the Booker's validation and the Calendar.
 */
export function eventDeletedError(resourceId) {
    return {
        type: "event_deleted",
        recovery: "select-event-type",
        message: "This event type has been deleted and is no longer available for booking.",
        recoveryPath: `/book/${resourceId}`,
    };
}
/**
 * Validates booking flow state reactively.
 * Monitors event type, resource, and link state for mid-booking changes.
 *
 * @param eventType - Event type query result (may be null/undefined)
 * @param resource - Resource query result (may be null/undefined)
 * @param hasLink - Link state query result (may be null/undefined)
 * @param selectedDuration - Currently selected duration in minutes
 * @param resourceId - Resource ID for the deprecated recoveryPath
 * @returns Validation result with status and optional error
 */
export function useBookingValidation(eventType, resource, hasLink, selectedDuration, resourceId) {
    return useMemo(() => {
        // Loading state: any query is still loading
        if (eventType === undefined ||
            resource === undefined ||
            hasLink === undefined) {
            return { status: "loading" };
        }
        // 1. Event type deleted
        if (eventType === null) {
            return { status: "error", error: eventDeletedError(resourceId) };
        }
        // 2. Event type deactivated
        if (eventType.isActive === false) {
            return {
                status: "error",
                error: {
                    type: "event_deactivated",
                    recovery: "select-event-type",
                    message: "This event type has been deactivated and is no longer available for booking.",
                    recoveryPath: `/book/${resourceId}`,
                },
            };
        }
        // 3. Resource deleted
        if (resource === null) {
            return {
                status: "error",
                error: {
                    type: "resource_deleted",
                    recovery: "select-resource",
                    message: "This resource has been deleted and is no longer available for booking.",
                    recoveryPath: "/book",
                },
            };
        }
        // 4. Resource deactivated
        if (resource.isActive === false) {
            return {
                status: "error",
                error: {
                    type: "resource_deactivated",
                    recovery: "select-resource",
                    message: "This resource has been deactivated and is no longer available for booking.",
                    recoveryPath: "/book",
                },
            };
        }
        // 5. Selected duration removed from options
        if (!allowedDurations(eventType).includes(selectedDuration)) {
            return {
                status: "error",
                error: {
                    type: "duration_invalid",
                    recovery: "reset-duration",
                    message: "The selected booking duration is no longer available. Please select a new duration.",
                    recoveryPath: "reset", // Special value to signal calendar reset
                },
            };
        }
        // 6. Resource unlinked from event type
        if (hasLink === false) {
            return {
                status: "error",
                error: {
                    type: "resource_unlinked",
                    recovery: "select-event-type",
                    message: "This resource is no longer available for this event type.",
                    recoveryPath: `/book/${resourceId}`,
                },
            };
        }
        // All validations passed
        return { status: "valid" };
    }, [eventType, resource, hasLink, selectedDuration, resourceId]);
}
//# sourceMappingURL=use-booking-validation.js.map