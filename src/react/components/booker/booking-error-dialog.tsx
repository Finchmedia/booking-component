"use client";

import React from "react";
import type { ValidationError } from "../../hooks/use-booking-validation";

interface BookingErrorDialogProps {
  error: ValidationError;
  onReset?: () => void; // Called for duration_invalid case
  onEventTypeReset?: () => void; // Called for event_deleted/deactivated/unlinked
  onNavigate?: (path: string) => void; // Called for navigation (resource_deleted/deactivated)
}

/**
 * Blocking error dialog for mid-booking validation failures.
 * Uses a modal overlay to force user action.
 *
 * Recovery actions:
 * - event_deleted / event_deactivated / resource_unlinked → onEventTypeReset callback
 * - resource_deleted / resource_deactivated → onNavigate callback with path
 * - duration_invalid → onReset callback
 */
export function BookingErrorDialog({
  error,
  onReset,
  onEventTypeReset,
  onNavigate,
}: BookingErrorDialogProps) {
  const getActionLabel = () => {
    switch (error.type) {
      case "event_deleted":
      case "event_deactivated":
      case "resource_unlinked":
        return "Back to Event Selection";
      case "resource_deleted":
      case "resource_deactivated":
        return "Back to Resources";
      case "duration_invalid":
        return "Reset Calendar";
      default:
        return "Continue";
    }
  };

  const handleAction = () => {
    if (error.recoveryPath === "reset") {
      onReset?.();
    } else if (
      error.type === "event_deleted" ||
      error.type === "event_deactivated" ||
      error.type === "resource_unlinked"
    ) {
      onEventTypeReset?.();
    } else {
      onNavigate?.(error.recoveryPath);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Booking No Longer Available
            </h2>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>

          {/* Footer */}
          <div className="flex justify-end">
            <button
              onClick={handleAction}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              {getActionLabel()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
