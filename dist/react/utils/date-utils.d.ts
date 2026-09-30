export declare const DAYS: string[];
export declare const MONTHS: string[];
/**
 * Format a Date object as "YYYY-MM-DD" in a specific timezone
 * This prevents off-by-one errors for UTC+ timezone users
 * @param date - JavaScript Date object
 * @param timezone - IANA timezone (e.g., "Europe/Berlin")
 * @returns Date string "YYYY-MM-DD"
 */
export declare const formatDateInTimezone: (date: Date, timezone: string) => string;
export declare const formatTime: (timeString: string, timeFormat: "12h" | "24h", timezone: string) => string;
export interface CalendarDay {
    /** Carrier for the day: local midnight, so its local fields name `civilDate` */
    date: Date;
    /**
     * The day as "YYYY-MM-DD". It is the cell's label, its availability key and
     * the date to query. Always set by generateCalendarDays.
     */
    civilDate?: string;
    day: number;
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
    isSelected: boolean;
    hasSlots: boolean;
    disabled: boolean;
}
/**
 * Generate the 42 days of a Monday-first month view.
 *
 * Days are civil dates: a cell's label, `civilDate`, its `monthSlots` key and
 * `date` (a local-midnight carrier) name the same day in every browser zone.
 * Today and past days are judged in `timezone`.
 *
 * @param currentDate - Date whose local year and month are displayed
 * @param selectedDate - Selected day as a carrier (its local fields), or null
 * @param monthSlots - Map of "YYYY-MM-DD" to availability
 * @param timezone - IANA timezone that decides today (e.g., "Europe/Berlin")
 * @returns Array of CalendarDay objects
 */
export declare const generateCalendarDays: (currentDate: Date, selectedDate: Date | null, monthSlots: Record<string, boolean>, timezone?: string) => CalendarDay[];
//# sourceMappingURL=date-utils.d.ts.map