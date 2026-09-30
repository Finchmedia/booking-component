"use client";

import React, { useEffect, useId, useRef } from "react";
import type { ValidationError } from "../../hooks/use-booking-validation.js";
import { getRecoveryAction, type RecoveryHandlers } from "./recovery.js";

interface BookingErrorDialogProps extends RecoveryHandlers {
  error: ValidationError;
}

const TITLE = "Booking No Longer Available";

/**
 * Error for mid-booking validation failures.
 *
 * With the callback for the error's recovery it is a modal alert dialog whose
 * action (and Escape) performs the recovery. The callback receives the
 * recovery kind:
 * - event_deleted / event_deactivated / resource_unlinked → onEventTypeReset
 * - resource_deleted / resource_deactivated → onNavigate (deprecated path first)
 * - duration_invalid → onReset
 *
 * Without that callback there is no exit to offer, so it renders a non-modal
 * inline alert and leaves the rest of the page reachable.
 */
export function BookingErrorDialog({
  error,
  onReset,
  onEventTypeReset,
  onNavigate,
}: BookingErrorDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const action = getRecoveryAction(error, { onReset, onEventTypeReset, onNavigate });
  const isModal = !!action;

  // Open as a modal (inert background, Escape as cancel) and focus the action
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isModal || !dialog) return;
    if (!dialog.open) dialog.showModal();
    actionRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [isModal]);

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

  if (!action) {
    return (
      <div
        role="alert"
        className="mb-4 space-y-2 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-lg font-semibold text-foreground">{TITLE}</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      // Escape: the error persists, so perform the recovery instead of closing
      onCancel={(event) => {
        event.preventDefault();
        action();
      }}
      className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-lg backdrop:bg-background/80 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {TITLE}
          </h2>
          <p id={messageId} className="text-sm text-muted-foreground">
            {error.message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <button
            ref={actionRef}
            type="button"
            onClick={action}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            {getActionLabel()}
          </button>
        </div>
      </div>
    </dialog>
  );
}
