"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { TimeSlotButton } from "./time-slot-button";
export const TimeSlotsPanel = ({ selectedDate, availableSlots, reservedSlots, loading, isReloading, timeFormat, onTimeFormatChange, onSlotSelect, }) => {
    // Get user's timezone for displaying slot times
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Merge available and reserved slots into single chronologically-sorted list
    const allSlots = React.useMemo(() => {
        return [
            ...availableSlots.map((slot) => ({ ...slot, isReserved: false })),
            ...reservedSlots.map((slot) => ({ ...slot, isReserved: true })),
        ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }, [availableSlots, reservedSlots]);
    // Format selected date for clear display
    const formatSelectedDate = (date) => {
        if (!date)
            return "Select a date";
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        // Check if it's today or tomorrow for friendly labels
        if (date.toDateString() === today.toDateString()) {
            return `Today, ${date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            })}`;
        }
        if (date.toDateString() === tomorrow.toDateString()) {
            return `Tomorrow, ${date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            })}`;
        }
        // For other dates, show: "Fri, Jun 27" (includes day, month, date)
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    };
    return (_jsxs("div", { className: "w-full border-t border-border md:w-60 lg:w-72 md:border-t-0 md:border-l", children: [_jsx("div", { className: "p-4", children: _jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-semibold text-foreground", children: formatSelectedDate(selectedDate) }), _jsxs("div", { className: "flex overflow-hidden rounded-md border border-border bg-muted", children: [_jsx("button", { onClick: () => onTimeFormatChange("12h"), className: `px-2 py-1 text-xs font-medium transition-colors ${timeFormat === "12h"
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:text-foreground"}`, children: "12h" }), _jsx("button", { onClick: () => onTimeFormatChange("24h"), className: `px-2 py-1 text-xs font-medium transition-colors ${timeFormat === "24h"
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:text-foreground"}`, children: "24h" })] })] }) }), _jsx("div", { className: "relative", children: _jsx("div", { className: `scrollbar-thin scrollbar-track-muted scrollbar-thumb-accent hover:scrollbar-thumb-accent/80 max-h-96 overflow-y-auto px-6 pb-4 transition-opacity duration-200 ${isReloading ? "opacity-50 pointer-events-none" : "opacity-100"}`, children: _jsx("div", { className: "space-y-2", children: !selectedDate ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "Please select a date to see available times" })) : loading ? (_jsx("div", { className: "space-y-2", children: [...Array(6)].map((_, i) => (_jsx("div", { className: "h-9 animate-pulse rounded-md bg-accent" }, i))) })) : allSlots.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No available times for this date" })) : (allSlots.map((slot) => (_jsx(TimeSlotButton, { slot: slot, timeFormat: timeFormat, timezone: userTimezone, onSlotSelect: onSlotSelect, isReserved: slot.isReserved }, slot.time)))) }) }) })] }));
};
//# sourceMappingURL=time-slots-panel.js.map