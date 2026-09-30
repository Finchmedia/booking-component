import type { EventType, Resource } from "../types.js";
export type ValidationErrorType = "event_deleted" | "event_deactivated" | "resource_deleted" | "resource_deactivated" | "duration_invalid" | "resource_unlinked";
/**
 * What the user can do next. Hosts map it to their own routes:
 * - "select-event-type": choose another event type for this resource
 * - "select-resource": choose another resource
 * - "reset-duration": pick an available duration again (the Booker does this itself)
 */
export type ValidationRecovery = "select-event-type" | "select-resource" | "reset-duration";
export interface ValidationError {
    type: ValidationErrorType;
    message: string;
    /** Semantic recovery for this error. Always set by useBookingValidation. */
    recovery?: ValidationRecovery;
    /**
     * @deprecated Hard-codes the demo host's routes ("/book", "/book/<resourceId>")
     * and "reset". Use `recovery` and map it to your own routes.
     */
    recoveryPath: string;
}
export interface ValidationResult {
    status: "loading" | "valid" | "error";
    error?: ValidationError;
}
/**
 * @internal The error for a missing event type: the host's getEventType
 * resolved to null. Shared by the Booker's validation and the Calendar.
 */
export declare function eventDeletedError(resourceId: string): ValidationError;
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
export declare function useBookingValidation(eventType: EventType | null | undefined, resource: Resource | null | undefined, hasLink: boolean | null | undefined, selectedDuration: number, resourceId: string): ValidationResult;
//# sourceMappingURL=use-booking-validation.d.ts.map