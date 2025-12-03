"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { CalendarNavigation } from "./calendar-navigation";
import { CalendarDayButton } from "./calendar-day-button";
import { DAYS, generateCalendarDays } from "../../utils/date-utils";
export const CalendarGrid = ({ currentDate, selectedDate, monthSlots, onDateSelect, onPreviousMonth, onNextMonth, timezone, }) => {
    const calendarDays = generateCalendarDays(currentDate, selectedDate, monthSlots, timezone);
    return (_jsxs("div", { className: "flex-1 p-4 lg:max-w-[472px] lg:mx-auto", children: [_jsx(CalendarNavigation, { currentDate: currentDate, onPreviousMonth: onPreviousMonth, onNextMonth: onNextMonth }), _jsx("div", { className: "mb-1 grid grid-cols-7 gap-2", children: DAYS.map((day) => (_jsx("div", { className: "flex h-14 w-14 items-center justify-center text-sm font-medium text-muted-foreground", children: day }, day))) }), _jsx("div", { className: "grid grid-cols-7 gap-2", children: calendarDays.map((day) => (_jsx(CalendarDayButton, { day: day, onDateSelect: onDateSelect }, day.date.toISOString()))) })] }));
};
//# sourceMappingURL=calendar-grid.js.map