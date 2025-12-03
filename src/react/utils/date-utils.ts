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
 * Get today's date string in a specific timezone
 * @param timezone - IANA timezone (e.g., "Europe/Berlin")
 * @returns Date string "YYYY-MM-DD"
 */
export const getTodayInTimezone = (timezone: string): string => {
  const now = new Date();
  return now.toLocaleDateString("sv-SE", { timeZone: timezone });
};

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

/**
 * Check if two dates represent the same calendar day in a timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @param timezone - IANA timezone
 * @returns true if same calendar day
 */
export const isSameDayInTimezone = (
  date1: Date,
  date2: Date,
  timezone: string
): boolean => {
  return (
    formatDateInTimezone(date1, timezone) ===
    formatDateInTimezone(date2, timezone)
  );
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
export const generateCalendarDays = (
  currentDate: Date,
  selectedDate: Date | null,
  monthSlots: Record<string, boolean>,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): CalendarDay[] => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);

  // Adjust to Monday start (getDay() returns 0 for Sunday)
  const dayOffset = (firstDay.getDay() + 6) % 7;
  startDate.setDate(firstDay.getDate() - dayOffset);

  const days = [];
  // Get today's date string in the target timezone for comparison
  const todayStr = getTodayInTimezone(timezone);

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const isCurrentMonth = date.getMonth() === month;

    // Format the date in the target timezone for proper comparison
    const dateStr = formatDateInTimezone(date, timezone);
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isSelected =
      !!selectedDate && isSameDayInTimezone(date, selectedDate, timezone);

    // Check if this date has available slots using O(1) lookup
    const hasSlots = Boolean(monthSlots[dateStr]);

    days.push({
      date,
      day: date.getDate(),
      isCurrentMonth,
      isPast,
      isToday,
      isSelected,
      hasSlots,
      disabled: isPast || !isCurrentMonth,
    });
  }

  return days;
};
