"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { TimeSlotButton } from "./time-slot-button";
export const TimeSlotsPanel = ({ selectedDate, availableSlots, reservedSlots, loading, timeFormat, onTimeFormatChange, onSlotSelect, timezone, }) => {
    // Use passed timezone for displaying slot times (may be locked to event type TZ)
    const displayTimezone = timezone;
    // Merge available and reserved slots into single chronologically-sorted list
    const allSlots = React.useMemo(() => {
        return [
            ...availableSlots.map((slot) => ({ ...slot, isReserved: false })),
            ...reservedSlots.map((slot) => ({ ...slot, isReserved: true })),
        ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }, [availableSlots, reservedSlots]);
    // Format selected date using browser locale (e.g. "Freitag, 20. März")
    const formatSelectedDate = (date) => {
        if (!date)
            return "Select a date";
        return date.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
        });
    };
    return (_jsxs("div", { className: "w-full border-t border-border md:w-60 lg:w-72 md:border-t-0 md:border-l", children: [_jsxs("div", { className: "p-4 pb-2", children: [_jsx("h3", { className: "mb-2 text-sm font-semibold text-foreground", children: formatSelectedDate(selectedDate) }), _jsx("div", { className: "mb-3 flex justify-center", children: _jsxs("div", { className: "flex overflow-hidden rounded-md border border-border bg-muted", children: [_jsx("button", { onClick: () => onTimeFormatChange("12h"), className: `px-2 py-1 text-xs font-medium transition-colors ${timeFormat === "12h"
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:text-foreground"}`, children: "12h" }), _jsx("button", { onClick: () => onTimeFormatChange("24h"), className: `px-2 py-1 text-xs font-medium transition-colors ${timeFormat === "24h"
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:text-foreground"}`, children: "24h" })] }) })] }), _jsx("div", { className: "relative", children: _jsx("div", { className: "scrollbar-thin scrollbar-track-muted scrollbar-thumb-accent hover:scrollbar-thumb-accent/80 max-h-96 overflow-y-auto px-6 pb-4", children: _jsx("div", { className: "space-y-2", children: !selectedDate ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "Please select a date to see available times" })) : loading ? (_jsx("div", { className: "space-y-2", children: [...Array(6)].map((_, i) => (_jsx("div", { className: "h-9 animate-pulse rounded-md bg-accent" }, i))) })) : allSlots.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No available times for this date" })) : (allSlots.map((slot) => (_jsx(TimeSlotButton, { slot: slot, timeFormat: timeFormat, timezone: displayTimezone, onSlotSelect: onSlotSelect, isReserved: slot.isReserved }, slot.time)))) }) }) })] }));
};
//# sourceMappingURL=time-slots-panel.js.map