import React from "react";
import type { MonthSlots } from "../../types";
interface CalendarGridProps {
    currentDate: Date;
    selectedDate: Date | null;
    monthSlots: MonthSlots;
    onDateSelect: (date: Date) => void;
    onPreviousMonth: () => void;
    onNextMonth: () => void;
}
export declare const CalendarGrid: React.FC<CalendarGridProps>;
export {};
//# sourceMappingURL=calendar-grid.d.ts.map