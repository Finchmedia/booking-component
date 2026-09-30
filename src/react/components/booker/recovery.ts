import type {
  ValidationError,
  ValidationErrorType,
  ValidationRecovery,
} from "../../hooks/use-booking-validation.js";

/** Host callbacks that can perform a validation error's recovery. */
export interface RecoveryHandlers {
  /** Called for "reset-duration" */
  onReset?: () => void;
  /** Called for "select-event-type" */
  onEventTypeReset?: () => void;
  /** Called for "select-resource" with the deprecated recoveryPath */
  onNavigate?: (path: string) => void;
}

// Errors built without `recovery` (for example by hosts rendering the dialog)
const RECOVERY_BY_TYPE: Record<ValidationErrorType, ValidationRecovery> = {
  event_deleted: "select-event-type",
  event_deactivated: "select-event-type",
  resource_unlinked: "select-event-type",
  resource_deleted: "select-resource",
  resource_deactivated: "select-resource",
  duration_invalid: "reset-duration",
};

/**
 * The action that performs an error's recovery, or undefined when the matching
 * callback is missing. Without an action there is no exit to offer, so the
 * error is shown inline instead of as a modal dialog.
 */
export function getRecoveryAction(
  error: ValidationError,
  { onReset, onEventTypeReset, onNavigate }: RecoveryHandlers
): (() => void) | undefined {
  const recovery = error.recovery ?? RECOVERY_BY_TYPE[error.type];
  switch (recovery) {
    case "reset-duration":
      return onReset && (() => onReset());
    case "select-event-type":
      return onEventTypeReset && (() => onEventTypeReset());
    case "select-resource":
      return onNavigate && (() => onNavigate(error.recoveryPath));
  }
}
