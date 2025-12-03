export declare const SLOT_DURATION_MS: number;
export declare const SLOTS_PER_DAY: number;
export declare const BUSINESS_HOURS_START = 36;
export declare const BUSINESS_HOURS_END = 68;
/**
 * Get the day of week for a date in a specific timezone
 * @param dateStr - ISO date string "2025-12-03"
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Day of week (0=Sunday, 6=Saturday)
 */
export declare function getDayOfWeekInTimezone(dateStr: string, timezone: string): number;
/**
 * Get the date string (YYYY-MM-DD) for a timestamp in a specific timezone
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Date string "2025-12-03"
 */
export declare function getDateInTimezone(timestamp: number, timezone: string): string;
/**
 * Convert a wall-clock time in a specific timezone to a UTC timestamp
 * @param dateStr - ISO date string "2025-12-03"
 * @param time - Time string "09:00" or "14:30"
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Unix timestamp in milliseconds (UTC)
 */
export declare function wallClockToUTC(dateStr: string, time: string, timezone: string): number;
/**
 * Convert a "HH:MM" time string to a slot index (0-95)
 * @param time - Time string "09:00" or "14:30"
 * @returns Slot index
 */
export declare function timeToSlotIndex(time: string): number;
/**
 * Convert a slot index (0-95) to a "HH:MM" time string
 * @param slotIndex - Slot index
 * @returns Time string "09:00"
 */
export declare function slotIndexToTime(slotIndex: number): string;
/**
 * Get the UTC slot index for a wall-clock time in a specific timezone on a given date
 * Handles timezone offset and DST automatically
 * @param dateStr - ISO date string "2025-12-03"
 * @param localSlotIndex - Slot index in resource's local timezone (0-95)
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Object with UTC date and slot index (may differ from input due to timezone offset)
 */
export declare function localSlotToUTCSlot(dateStr: string, localSlotIndex: number, timezone: string): {
    utcDate: string;
    utcSlot: number;
};
export declare function timestampToSlot(timestamp: number): {
    date: string;
    slot: number;
};
export declare function getRequiredSlots(start: number, end: number): Map<string, number[]>;
/**
 * Converts a slot index to a time string in ISO format
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param slotIndex - Slot index (0-95)
 * @returns ISO timestamp string (e.g., "2025-06-17T14:00:00.000Z")
 */
export declare function slotToTimestamp(date: string, slotIndex: number): string;
/**
 * Generates all possible time slots for a given day within business hours
 * LEGACY: Uses hardcoded UTC business hours. Prefer generateDaySlotsWithTimezone.
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns Array of { start: ISO timestamp, slot indices }
 */
export declare function generateDaySlots(date: string, eventLengthMinutes: number, intervalMinutes?: number): Array<{
    start: string;
    slots: number[];
}>;
/**
 * Generates time slots for a day using schedule-based availability hours
 * Timezone-aware: converts resource's local business hours to UTC slots
 *
 * @param date - ISO date string (e.g., "2025-12-03") in resource's timezone context
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes
 * @param availableSlots - Array of available slot indices in resource's LOCAL timezone (from schedule)
 * @param timezone - Resource's IANA timezone (e.g., "Europe/Berlin")
 * @returns Array of { start: ISO timestamp (UTC), slots: UTC slot indices }
 */
export declare function generateDaySlotsWithTimezone(date: string, eventLengthMinutes: number, intervalMinutes: number, availableSlots: number[], timezone: string): Array<{
    start: string;
    slots: number[];
}>;
/**
 * Checks if a set of slots are available (not in busySlots array)
 */
export declare function areSlotsAvailable(requiredSlots: number[], busySlots: number[]): boolean;
/**
 * Checks if a day has any available slots for a given event length
 * Optimized to exit early and avoid object generation
 * @param eventLengthMinutes - Duration in minutes
 * @param busySlots - Array of busy slot indices
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns boolean
 */
export declare function isDayAvailable(eventLengthMinutes: number, busySlots: number[], intervalMinutes?: number): boolean;
//# sourceMappingURL=utils.d.ts.map