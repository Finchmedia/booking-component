"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
/**
 * Blocking error dialog for mid-booking validation failures.
 * Uses a modal overlay to force user action.
 *
 * Recovery actions:
 * - event_deleted / event_deactivated / resource_unlinked → onEventTypeReset callback
 * - resource_deleted / resource_deactivated → onNavigate callback with path
 * - duration_invalid → onReset callback
 */
export function BookingErrorDialog({ error, onReset, onEventTypeReset, onNavigate, }) {
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
        }
        else if (error.type === "event_deleted" ||
            error.type === "event_deactivated" ||
            error.type === "resource_unlinked") {
            onEventTypeReset?.();
        }
        else {
            onNavigate?.(error.recoveryPath);
        }
    };
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "fixed inset-0 bg-background/80 backdrop-blur-sm" }), _jsx("div", { className: "relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("h2", { className: "text-lg font-semibold text-foreground", children: "Booking No Longer Available" }), _jsx("p", { className: "text-sm text-muted-foreground", children: error.message })] }), _jsx("div", { className: "flex justify-end", children: _jsx("button", { onClick: handleAction, className: "px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors", children: getActionLabel() }) })] }) })] }));
}
//# sourceMappingURL=booking-error-dialog.js.map