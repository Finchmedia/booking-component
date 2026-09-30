import { fromLocalFields, monthGrid, toLocalMidnight, todayIn } from "./civil-date";

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Format a Date object as "YYYY-MM-DD" in a specific timezone
 * This prevents off-by-one errors for UTC+ timezone users
 * @param date - JavaScript Date object
 * @param timezone - IANA timezone (e.g., "Europe/Berlin")
 * @returns Date string "YYYY-MM-DD"
 */
export const formatDateInTimezone = (date: Date, timezone: string): string => {
  return date.toLocaleDateString("sv-SE", { timeZone: timezone });
};

// Helper function to get date string in local timezone
// Format time based on preference and user's timezone
export const formatTime = (
  timeString: string,
  timeFormat: "12h" | "24h",
  timezone: string
) => {
  const date = new Date(timeString);

  // Ensure we're displaying in user's selected timezone
  if (timeFormat === "24h") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    });
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
};

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
export const generateCalendarDays = (
  currentDate: Date,
  selectedDate: Date | null,
  monthSlots: Record<string, boolean>,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): CalendarDay[] => {
  const month = fromLocalFields(currentDate).slice(0, 7);
  const today = todayIn(timezone);
  const selected = selectedDate ? fromLocalFields(selectedDate) : null;

  return monthGrid(currentDate.getFullYear(), currentDate.getMonth() + 1).map(
    (civilDate) => {
      const isCurrentMonth = civilDate.startsWith(month);
      const isPast = civilDate < today;

      return {
        date: toLocalMidnight(civilDate),
        civilDate,
        day: Number(civilDate.slice(8)),
        isCurrentMonth,
        isPast,
        isToday: civilDate === today,
        isSelected: civilDate === selected,
        // O(1) lookup by the same key the cell shows
        hasSlots: Boolean(monthSlots[civilDate]),
        disabled: isPast || !isCurrentMonth,
      };
    }
  );
};
