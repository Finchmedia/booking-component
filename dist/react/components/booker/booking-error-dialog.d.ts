import React from "react";
import type { ValidationError } from "../../hooks/use-booking-validation.js";
import { type RecoveryHandlers } from "./recovery.js";
interface BookingErrorDialogProps extends RecoveryHandlers {
    error: ValidationError;
}
/**
 * Error for mid-booking validation failures.
 *
 * With the callback for the error's recovery it is a modal alert dialog whose
 * action (and Escape) performs the recovery:
 * - event_deleted / event_deactivated / resource_unlinked → onEventTypeReset()
 * - resource_deleted / resource_deactivated → onNavigate(recoveryPath), a deprecated path
 * - duration_invalid → onReset()
 *
 * Without that callback there is no exit to offer, so it renders a non-modal
 * inline alert and leaves the rest of the page reachable.
 */
export declare function BookingErrorDialog({ error, onReset, onEventTypeReset, onNavigate, }: BookingErrorDialogProps): React.JSX.Element;
export {};
//# sourceMappingURL=booking-error-dialog.d.ts.map