export declare const DAYS: string[];
export declare const MONTHS: string[];
/**
 * Get today's date string in a specific timezone
 * @param timezone - IANA timezone (e.g., "Europe/Berlin")
 * @returns Date string "YYYY-MM-DD"
 */
export declare const getTodayInTimezone: (timezone: string) => string;
/**
 * Format a Date object as "YYYY-MM-DD" in a specific timezone
 * This prevents off-by-one errors for UTC+ timezone users
 * @param date - JavaScript Date object
 * @param timezone - IANA timezone (e.g., "Europe/Berlin")
 * @returns Date string "YYYY-MM-DD"
 */
export declare const formatDateInTimezone: (date: Date, timezone: string) => string;
/**
 * Check if two dates represent the same calendar day in a timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @param timezone - IANA timezone
 * @returns true if same calendar day
 */
export declare const isSameDayInTimezone: (date1: Date, date2: Date, timezone: string) => boolean;
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
/**
 * Generate calendar days for a given month with timezone awareness
 *
 * @param currentDate - Date representing the month to display
 * @param selectedDate - Currently selected date (or null)
 * @param monthSlots - Map of date strings to availability
 * @param timezone - IANA timezone for date calculations (e.g., "Europe/Berlin")
 * @returns Array of CalendarDay objects
 */
export declare const generateCalendarDays: (currentDate: Date, selectedDate: Date | null, monthSlots: Record<string, boolean>, timezone?: string) => CalendarDay[];
//# sourceMappingURL=date-utils.d.ts.map