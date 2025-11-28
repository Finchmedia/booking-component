export declare const DAYS: string[];
export declare const MONTHS: string[];
export declare const formatTime: (timeString: string, timeFormat: "12h" | "24h", timezone: string) => string;
export interface CalendarDay {
    date: Date;
    day: number;
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
    isSelected: boolean;
    hasSlots: boolean;
    disabled: boolean;
}
export declare const generateCalendarDays: (currentDate: Date, selectedDate: Date | null, monthSlots: Record<string, boolean>) => CalendarDay[];
//# sourceMappingURL=date-utils.d.ts.map