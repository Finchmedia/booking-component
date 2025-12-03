export const SLOT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const SLOTS_PER_DAY = 24 * 4; // 96

// Default business hours (in slot indices, 0-95) - used as fallback
// These represent UTC slot indices when no schedule timezone is provided
// 9:00 AM = slot 36 (9 * 4)
// 5:00 PM = slot 68 (17 * 4)
export const BUSINESS_HOURS_START = 36; // 9:00 AM
export const BUSINESS_HOURS_END = 68; // 5:00 PM

// ============================================================================
// TIMEZONE UTILITIES
// These use native Intl API which works correctly in Convex queries/mutations
// ============================================================================

/**
 * Get the day of week for a date in a specific timezone
 * @param dateStr - ISO date string "2025-12-03"
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Day of week (0=Sunday, 6=Saturday)
 */
export function getDayOfWeekInTimezone(dateStr: string, timezone: string): number {
    // Parse the date string and get what day it is in the target timezone
    // We use noon UTC to avoid edge cases around midnight
    const timestamp = new Date(dateStr + "T12:00:00.000Z").getTime();

    const formatter = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: timezone,
    });

    const weekdayStr = formatter.format(new Date(timestamp));
    const dayMap: Record<string, number> = {
        "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6
    };

    return dayMap[weekdayStr] ?? 0;
}

/**
 * Get the date string (YYYY-MM-DD) for a timestamp in a specific timezone
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Date string "2025-12-03"
 */
export function getDateInTimezone(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    // sv-SE locale gives us YYYY-MM-DD format directly
    return date.toLocaleDateString("sv-SE", { timeZone: timezone });
}

/**
 * Parse time components from a formatted date string in a timezone
 * Uses Intl.DateTimeFormat with formatToParts for reliable parsing
 */
function getTimePartsInTimezone(timestamp: number, timezone: string): { hours: number; minutes: number } {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        timeZone: timezone,
    });

    const parts = formatter.formatToParts(date);
    let hours = 0;
    let minutes = 0;

    for (const part of parts) {
        if (part.type === "hour") {
            hours = parseInt(part.value, 10);
        } else if (part.type === "minute") {
            minutes = parseInt(part.value, 10);
        }
    }

    // Handle midnight edge case (some locales return 24 for midnight)
    if (hours === 24) hours = 0;

    return { hours, minutes };
}

/**
 * Convert a wall-clock time in a specific timezone to a UTC timestamp
 * @param dateStr - ISO date string "2025-12-03"
 * @param time - Time string "09:00" or "14:30"
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Unix timestamp in milliseconds (UTC)
 */
export function wallClockToUTC(dateStr: string, time: string, timezone: string): number {
    const [hours, minutes] = time.split(":").map(Number);

    // Strategy: Start with an estimate and refine
    // Create a date at the specified wall-clock time assuming it's UTC
    const utcEstimate = new Date(`${dateStr}T${time}:00.000Z`).getTime();

    // Check what time that actually is in the target timezone
    const { hours: actualHours, minutes: actualMinutes } = getTimePartsInTimezone(utcEstimate, timezone);

    // Calculate the difference and adjust
    const targetMinutes = hours * 60 + minutes;
    const actualMinutes_total = actualHours * 60 + actualMinutes;
    const diffMinutes = targetMinutes - actualMinutes_total;

    // The UTC timestamp we need is the estimate adjusted by the difference
    // This accounts for the timezone offset including DST
    return utcEstimate + diffMinutes * 60 * 1000;
}

/**
 * Convert a "HH:MM" time string to a slot index (0-95)
 * @param time - Time string "09:00" or "14:30"
 * @returns Slot index
 */
export function timeToSlotIndex(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 4 + Math.floor(minutes / 15);
}

/**
 * Convert a slot index (0-95) to a "HH:MM" time string
 * @param slotIndex - Slot index
 * @returns Time string "09:00"
 */
export function slotIndexToTime(slotIndex: number): string {
    const hours = Math.floor(slotIndex / 4);
    const minutes = (slotIndex % 4) * 15;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Get the UTC slot index for a wall-clock time in a specific timezone on a given date
 * Handles timezone offset and DST automatically
 * @param dateStr - ISO date string "2025-12-03"
 * @param localSlotIndex - Slot index in resource's local timezone (0-95)
 * @param timezone - IANA timezone "Europe/Berlin"
 * @returns Object with UTC date and slot index (may differ from input due to timezone offset)
 */
export function localSlotToUTCSlot(
    dateStr: string,
    localSlotIndex: number,
    timezone: string
): { utcDate: string; utcSlot: number } {
    const localTime = slotIndexToTime(localSlotIndex);
    const utcTimestamp = wallClockToUTC(dateStr, localTime, timezone);
    const { date, slot } = timestampToSlot(utcTimestamp);
    return { utcDate: date, utcSlot: slot };
}

export function timestampToSlot(timestamp: number): {
    date: string;
    slot: number;
} {
    const dateObj = new Date(timestamp);
    const date = dateObj.toISOString().split("T")[0];

    // Calculate minutes since midnight UTC
    const hours = dateObj.getUTCHours();
    const minutes = dateObj.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    const slot = Math.floor(totalMinutes / 15);

    return { date, slot };
}

export function getRequiredSlots(
    start: number,
    end: number
): Map<string, number[]> {
    const slots = new Map<string, number[]>();
    let current = start;

    // Normalize start to the beginning of the slot?
    // For now, let's assume inputs are already aligned or we just take the containing slot.
    // Actually, if start is 14:05, it occupies the 14:00-14:15 slot.

    while (current < end) {
        const { date, slot } = timestampToSlot(current);

        if (!slots.has(date)) {
            slots.set(date, []);
        }

        const daySlots = slots.get(date)!;
        if (!daySlots.includes(slot)) {
            daySlots.push(slot);
        }

        // Move to next slot
        current += SLOT_DURATION_MS;

        // Align current to exact slot boundary to avoid drift
        const remainder = current % SLOT_DURATION_MS;
        if (remainder !== 0) {
            current -= remainder;
        }
    }

    return slots;
}

/**
 * Converts a slot index to a time string in ISO format
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param slotIndex - Slot index (0-95)
 * @returns ISO timestamp string (e.g., "2025-06-17T14:00:00.000Z")
 */
export function slotToTimestamp(date: string, slotIndex: number): string {
    const hours = Math.floor(slotIndex / 4);
    const minutes = (slotIndex % 4) * 15;
    return `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
}

/**
 * Generates all possible time slots for a given day within business hours
 * LEGACY: Uses hardcoded UTC business hours. Prefer generateDaySlotsWithTimezone.
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns Array of { start: ISO timestamp, slot indices }
 */
export function generateDaySlots(
    date: string,
    eventLengthMinutes: number,
    intervalMinutes: number = 15
): Array<{ start: string; slots: number[] }> {
    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = Math.ceil(intervalMinutes / 15);
    const possibleSlots: Array<{ start: string; slots: number[] }> = [];

    // Generate slots from business hours start to end, ensuring we don't go past business hours
    // We increment by `step` instead of 1
    for (let slotIndex = BUSINESS_HOURS_START; slotIndex + slotsNeeded <= BUSINESS_HOURS_END; slotIndex += step) {
        const slots = Array.from({ length: slotsNeeded }, (_, i) => slotIndex + i);
        const startTime = slotToTimestamp(date, slotIndex);
        possibleSlots.push({ start: startTime, slots });
    }

    return possibleSlots;
}

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
export function generateDaySlotsWithTimezone(
    date: string,
    eventLengthMinutes: number,
    intervalMinutes: number,
    availableSlots: number[],
    timezone: string
): Array<{ start: string; slots: number[] }> {
    if (availableSlots.length === 0) {
        return [];
    }

    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = Math.ceil(intervalMinutes / 15);
    const possibleSlots: Array<{ start: string; slots: number[] }> = [];

    // Sort available slots to find contiguous blocks
    const sortedSlots = [...availableSlots].sort((a, b) => a - b);
    const minSlot = sortedSlots[0];
    const maxSlot = sortedSlots[sortedSlots.length - 1];

    // Create a Set for O(1) availability lookup
    const availableSet = new Set(availableSlots);

    // Iterate through potential start times within available range
    for (let localSlotIndex = minSlot; localSlotIndex + slotsNeeded <= maxSlot + 1; localSlotIndex += step) {
        // Check if all required slots are available in local time
        let allAvailable = true;
        for (let i = 0; i < slotsNeeded; i++) {
            if (!availableSet.has(localSlotIndex + i)) {
                allAvailable = false;
                break;
            }
        }

        if (allAvailable) {
            // Convert the local start time to UTC
            const localTime = slotIndexToTime(localSlotIndex);
            const utcTimestamp = wallClockToUTC(date, localTime, timezone);
            const { date: utcDate, slot: utcStartSlot } = timestampToSlot(utcTimestamp);

            // Generate the UTC slot indices for this booking
            const utcSlots = Array.from({ length: slotsNeeded }, (_, i) => utcStartSlot + i);

            // The start time is the UTC timestamp as ISO string
            const startTime = new Date(utcTimestamp).toISOString();

            possibleSlots.push({ start: startTime, slots: utcSlots });
        }
    }

    return possibleSlots;
}

/**
 * Checks if a set of slots are available (not in busySlots array)
 */
export function areSlotsAvailable(
    requiredSlots: number[],
    busySlots: number[]
): boolean {
    return !requiredSlots.some(slot => busySlots.includes(slot));
}

/**
 * Checks if a day has any available slots for a given event length
 * Optimized to exit early and avoid object generation
 * @param eventLengthMinutes - Duration in minutes
 * @param busySlots - Array of busy slot indices
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns boolean
 */
export function isDayAvailable(
    eventLengthMinutes: number,
    busySlots: number[],
    intervalMinutes: number = 15
): boolean {
    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = Math.ceil(intervalMinutes / 15);

    // Iterate through potential start times
    // We use the same loop logic as generateDaySlots but without object creation
    for (let slotIndex = BUSINESS_HOURS_START; slotIndex + slotsNeeded <= BUSINESS_HOURS_END; slotIndex += step) {
        // Check if this specific block is free
        let isBlockFree = true;
        for (let i = 0; i < slotsNeeded; i++) {
            if (busySlots.includes(slotIndex + i)) {
                isBlockFree = false;
                break;
            }
        }

        // If we found ONE valid block, the day has availability. Return true immediately.
        if (isBlockFree) {
            return true;
        }
    }

    return false;
}
