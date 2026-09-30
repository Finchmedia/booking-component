// Errors built without `recovery` (for example by hosts rendering the dialog)
const RECOVERY_BY_TYPE = {
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
export function getRecoveryAction(error, { onReset, onEventTypeReset, onNavigate }) {
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
//# sourceMappingURL=recovery.js.map