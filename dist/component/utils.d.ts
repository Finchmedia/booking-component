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
 *
 * The zone offset depends on the instant, and the instant is what is being
 * computed — so the offset read at the naive instant (wall clock taken as
 * UTC) is only a first guess. In the hour before a DST switch that guess
 * already carries the post-switch offset and lands one hour off (01:00 CET on
 * the spring-forward day came back as 23:00Z instead of 00:00Z; 01:00 CEST on
 * the fall-back day as 00:00Z, which is 02:00 local). The offset is therefore
 * re-read at the guessed instant and corrected once — the same fix-up
 * date-fns-tz applies. Resolution of the two DST edge cases:
 * - ambiguous time (fall-back hour occurs twice): the LATER instant, i.e. the
 *   offset in force after the switch;
 * - non-existent time (spring-forward gap): folded forward with the larger
 *   offset (02:30 → the instant of 01:30). generateDaySlotsWithTimezone skips
 *   such times so that the fold never duplicates a candidate.
 *
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
 * One bookable start offered by the slot generators.
 *
 * - `start`: the UTC instant as ISO string.
 * - `slotsByDate`: the UTC 15-minute slot indices the booking
 *   [start, start + eventLength) occupies, keyed by UTC calendar date —
 *   exactly what getRequiredSlots returns and what the write paths reserve in
 *   daily_availability. A candidate late in a local day can span two UTC
 *   dates (23:30Z → [94, 95] today + [0, 1] tomorrow).
 * - `slots`: the same indices flattened, in order (each 0–95). Handy for
 *   callers that only need the index list; availability checks must use
 *   `slotsByDate`, because slot 0 of the next day is not slot 0 of the day
 *   `start` falls on.
 */
export interface SlotCandidate {
    start: string;
    slots: number[];
    slotsByDate: Map<string, number[]>;
}
/**
 * Generates all possible time slots for a given day within business hours
 * LEGACY: Uses hardcoded UTC business hours. Prefer generateDaySlotsWithTimezone.
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns Candidates (see SlotCandidate); all slots lie on `date`
 */
export declare function generateDaySlots(date: string, eventLengthMinutes: number, intervalMinutes?: number): SlotCandidate[];
/**
 * Generates time slots for a day using schedule-based availability hours
 * Timezone-aware: converts resource's local business hours to UTC slots
 *
 * Candidate starts are anchored PER contiguous run of available slots
 * (split-shift support): each availability window offers starts from its own
 * beginning in `intervalMinutes` steps. For a single contiguous window this
 * yields the exact same candidate list as a single global grid.
 *
 * @param date - ISO date string (e.g., "2025-12-03") in resource's timezone context
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes
 * @param availableSlots - Array of available slot indices in resource's LOCAL timezone (from schedule)
 * @param timezone - Resource's IANA timezone (e.g., "Europe/Berlin")
 * @returns Candidates (see SlotCandidate). The UTC instants — and therefore
 *   the daily_availability rows the slots live on — can fall on the UTC date
 *   before or after `date` when the resource's business day crosses UTC
 *   midnight (Pacific/Auckland 09:00 is 21:00Z of the previous day), so
 *   consumers must check `slotsByDate` against the row of EACH date it names.
 */
export declare function generateDaySlotsWithTimezone(date: string, eventLengthMinutes: number, intervalMinutes: number, availableSlots: number[], timezone: string): SlotCandidate[];
/**
 * Checks if a set of slots are available (not in busySlots array)
 */
export declare function areSlotsAvailable(requiredSlots: number[], busySlots: number[]): boolean;
/**
 * Checks a candidate against the busy slots of EVERY UTC date it touches.
 * `busyByDate` maps a UTC date to that day's busy slot indices; a date with
 * no entry counts as free.
 */
export declare function isCandidateAvailable(candidate: SlotCandidate, busyByDate: Map<string, number[]>): boolean;
/**
 * Shared range guard for every write path that reserves slots: NaN/Infinity
 * and `end <= start` are rejected, because getRequiredSlots maps such a range
 * to ZERO slots and the booking would be created without holding anything.
 * Past-/notice-window checks stay the caller's responsibility by design.
 */
export declare function assertValidRange(start: number, end: number): void;
/**
 * Checks if a day has any available slots for a given event length
 * Optimized to exit early and avoid object generation
 *
 * WARNING: `availableSlots` and `busySlots` MUST be in the SAME coordinate
 * system. This function does NO timezone conversion. If you pass a schedule's
 * LOCAL wall-clock slot indices (e.g. from computeAvailabilityForDate) while
 * `busySlots` are UTC indices, the comparison is meaningless (e.g. Europe/Berlin
 * days read as free regardless of bookings). For any timezone-aware schedule,
 * use generateDaySlotsWithTimezone + areSlotsAvailable instead — that is how
 * getMonthAvailability / getDaySlots decide availability. This function is only
 * used by the legacy (schedule-less, hardcoded 9–17 UTC) path.
 *
 * @param eventLengthMinutes - Duration in minutes
 * @param busySlots - Array of busy slot indices
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @param availableSlots - Optional available slot indices in the SAME coordinate system as busySlots; if provided, used instead of hardcoded 9–17
 * @returns boolean
 */
export declare function isDayAvailable(eventLengthMinutes: number, busySlots: number[], intervalMinutes?: number, availableSlots?: number[]): boolean;
//# sourceMappingURL=utils.d.ts.map