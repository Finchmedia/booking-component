import type { EventType, Resource } from "../types";
export type ValidationErrorType = "event_deleted" | "event_deactivated" | "resource_deleted" | "resource_deactivated" | "duration_invalid" | "resource_unlinked";
export interface ValidationError {
    type: ValidationErrorType;
    message: string;
    recoveryPath: string;
}
export interface ValidationResult {
    status: "loading" | "valid" | "error";
    error?: ValidationError;
}
/**
 * Validates booking flow state reactively.
 * Monitors event type, resource, and link state for mid-booking changes.
 *
 * @param eventType - Event type query result (may be null/undefined)
 * @param resource - Resource query result (may be null/undefined)
 * @param hasLink - Link state query result (may be null/undefined)
 * @param selectedDuration - Currently selected duration in minutes
 * @param resourceId - Resource ID for recovery path
 * @returns Validation result with status and optional error
 */
export declare function useBookingValidation(eventType: EventType | null | undefined, resource: Resource | null | undefined, hasLink: boolean | null | undefined, selectedDuration: number, resourceId: string): ValidationResult;
//# sourceMappingURL=use-booking-validation.d.ts.map