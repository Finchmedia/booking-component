"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { CalendarGrid } from "./calendar-grid";
import { TimeSlotsPanel } from "./time-slots-panel";
import { EventMetaPanel } from "./event-meta-panel";
import { useBookingAPI } from "../../context";
import { useConvexSlots } from "../../hooks/use-convex-slots";
import { useIntersectionObserver } from "../../hooks/use-intersection-observer";
export const Calendar = ({ resourceId, eventTypeId, onSlotSelect, title, description, showHeader, organizerName, organizerAvatar, 
// Controlled state
selectedDate, onDateChange, currentMonth, onMonthChange, selectedDuration, onDurationChange, timezone, onTimezoneChange, timeFormat, onTimeFormatChange, }) => {
    const api = useBookingAPI();
    // Fetch event type configuration
    const eventType = useQuery(api.getEventType, { eventTypeId });
    // Show loading state if event type is still loading
    if (eventType === undefined) {
        return (_jsx("div", { className: "bg-card overflow-hidden rounded-xl border border-border shadow p-8", children: _jsx("div", { className: "h-96 w-full bg-muted animate-pulse rounded-md" }) }));
    }
    // Event type timezone (overrides browser timezone when locked)
    const eventTimezone = eventType?.timezone || "Europe/Berlin";
    const isTimezoneLocked = eventType?.lockTimeZoneToggle || false;
    // Use controlled duration from props
    const eventLength = selectedDuration;
    // Extract slot interval and all duration options for smart defaulting
    const slotInterval = eventType?.slotInterval;
    const allDurationOptions = eventType
        ? [eventType.lengthInMinutes, ...(eventType.lengthInMinutesOptions || [])]
        : undefined;
    // Intersection observer to detect when calendar becomes visible
    const [calendarRef, isIntersecting, hasIntersected] = useIntersectionObserver({
        rootMargin: "500px",
        triggerOnce: true,
    });
    // Use Convex hook for slots data - only enabled when visible
    const { monthSlots, availableSlots, reservedSlots, isLoading, isReloading, fetchMonthSlots, fetchSlots, } = useConvexSlots(resourceId, eventLength, slotInterval, allDurationOptions, hasIntersected);
    // Auto-select today's date
    const autoSelectToday = () => {
        if (!selectedDate) {
            const today = new Date();
            onDateChange(today);
            fetchSlots(today);
        }
    };
    // Handle date selection
    const handleDateSelect = (date) => {
        onDateChange(date);
        fetchSlots(date);
    };
    // Navigation
    const goToPreviousMonth = () => {
        onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };
    const goToNextMonth = () => {
        onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };
    // Fetch month slots when calendar becomes visible or month changes
    useEffect(() => {
        if (hasIntersected) {
            fetchMonthSlots(currentMonth);
        }
    }, [
        hasIntersected,
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        fetchMonthSlots,
    ]);
    // Auto-select today's date when month slots are loaded
    useEffect(() => {
        if (Object.keys(monthSlots).length > 0) {
            autoSelectToday();
        }
    }, [monthSlots]);
    // Fetch slots for selected date when it changes (including on mount with persisted date)
    useEffect(() => {
        if (selectedDate) {
            fetchSlots(selectedDate);
        }
    }, [selectedDate, fetchSlots]);
    return (_jsxs("div", { ref: calendarRef, className: "bg-card overflow-hidden rounded-xl border border-border shadow", children: [showHeader && (_jsxs("div", { className: "border-b border-border p-6 text-center", children: [_jsx("h1", { className: "mb-2 text-2xl font-bold text-foreground", children: title }), _jsx("p", { className: "text-muted-foreground", children: description })] })), _jsxs("div", { className: "flex flex-col md:flex-row", children: [_jsx(EventMetaPanel, { eventType: eventType, selectedDuration: selectedDuration, onDurationChange: onDurationChange, userTimezone: timezone, onTimezoneChange: onTimezoneChange, timezoneLocked: isTimezoneLocked, organizerName: organizerName, organizerAvatar: organizerAvatar }), _jsx(CalendarGrid, { currentDate: currentMonth, selectedDate: selectedDate, monthSlots: monthSlots, onDateSelect: handleDateSelect, onPreviousMonth: goToPreviousMonth, onNextMonth: goToNextMonth }), _jsx(TimeSlotsPanel, { selectedDate: selectedDate, availableSlots: availableSlots, reservedSlots: reservedSlots, loading: isLoading, isReloading: isReloading, timeFormat: timeFormat, onTimeFormatChange: onTimeFormatChange, onSlotSelect: (slot) => onSlotSelect({ slot, duration: selectedDuration }) })] })] }));
};
//# sourceMappingURL=calendar.js.map