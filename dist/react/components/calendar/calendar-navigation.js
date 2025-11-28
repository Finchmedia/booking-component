"use client";
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS } from "../../utils/date-utils";
export const CalendarNavigation = ({ currentDate, onPreviousMonth, onNextMonth, }) => {
    return (_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsxs("h2", { className: "text-xl font-semibold text-foreground", children: [MONTHS[currentDate.getMonth()], " ", currentDate.getFullYear()] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: onPreviousMonth, "aria-label": "Previous month", className: "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:border-border hover:text-foreground", children: _jsx(ChevronLeft, { className: "h-4 w-4" }) }), _jsx("button", { onClick: onNextMonth, "aria-label": "Next month", className: "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:border-border hover:text-foreground", children: _jsx(ChevronRight, { className: "h-4 w-4" }) })] })] }));
};
//# sourceMappingURL=calendar-navigation.js.map