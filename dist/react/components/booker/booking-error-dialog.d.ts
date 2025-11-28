import type { ValidationError } from "../../hooks/use-booking-validation";
interface BookingErrorDialogProps {
    error: ValidationError;
    onReset?: () => void;
    onEventTypeReset?: () => void;
    onNavigate?: (path: string) => void;
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
export declare function BookingErrorDialog({ error, onReset, onEventTypeReset, onNavigate, }: BookingErrorDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=booking-error-dialog.d.ts.map