export declare const SLOT_DURATION_MS: number;
export declare const SLOTS_PER_DAY: number;
export declare const BUSINESS_HOURS_START = 36;
export declare const BUSINESS_HOURS_END = 68;
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