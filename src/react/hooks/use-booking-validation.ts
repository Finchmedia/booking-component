"use client";

import { useMemo } from "react";
import type { EventType, Resource } from "../types.js";
import { allowedDurations } from "../../shared/durations.js";

export type ValidationErrorType =
  | "event_deleted"
  | "event_deactivated"
  | "resource_deleted"
  | "resource_deactivated"
  | "duration_invalid"
  | "resource_unlinked";

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
export function eventDeletedError(resourceId: string): ValidationError {
  return {
    type: "event_deleted",
    recovery: "select-event-type",
    message:
      "This event type has been deleted and is no longer available for booking.",
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
export function useBookingValidation(
  eventType: EventType | null | undefined,
  resource: Resource | null | undefined,
  hasLink: boolean | null | undefined,
  selectedDuration: number,
  resourceId: string
): ValidationResult {
  return useMemo(() => {
    // Loading state: any query is still loading
    if (
      eventType === undefined ||
      resource === undefined ||
      hasLink === undefined
    ) {
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
          message:
            "This event type has been deactivated and is no longer available for booking.",
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
          message:
            "This resource has been deleted and is no longer available for booking.",
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
          message:
            "This resource has been deactivated and is no longer available for booking.",
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
          message:
            "The selected booking duration is no longer available. Please select a new duration.",
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
