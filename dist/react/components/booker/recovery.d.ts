import type { ValidationError } from "../../hooks/use-booking-validation.js";
/** Host callbacks that can perform a validation error's recovery. */
export interface RecoveryHandlers {
    /** Called for "reset-duration" */
    onReset?: () => void;
    /** Called for "select-event-type" */
    onEventTypeReset?: () => void;
    /** Called for "select-resource" with the deprecated recoveryPath */
    onNavigate?: (path: string) => void;
}
/**
 * The action that performs an error's recovery, or undefined when the matching
 * callback is missing. Without an action there is no exit to offer, so the
 * error is shown inline instead of as a modal dialog.
 */
export declare function getRecoveryAction(error: ValidationError, { onReset, onEventTypeReset, onNavigate }: RecoveryHandlers): (() => void) | undefined;
//# sourceMappingURL=recovery.d.ts.map