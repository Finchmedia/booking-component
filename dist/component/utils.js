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
export function getDayOfWeekInTimezone(dateStr, timezone) {
    // Parse the date string and get what day it is in the target timezone
    // We use noon UTC to avoid edge cases around midnight
    const timestamp = new Date(dateStr + "T12:00:00.000Z").getTime();
    const formatter = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: timezone,
    });
    const weekdayStr = formatter.format(new Date(timestamp));
    const dayMap = {
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
export function getDateInTimezone(timestamp, timezone) {
    const date = new Date(timestamp);
    // sv-SE locale gives us YYYY-MM-DD format directly
    return date.toLocaleDateString("sv-SE", { timeZone: timezone });
}
/**
 * Parse time components from a formatted date string in a timezone
 * Uses Intl.DateTimeFormat with formatToParts for reliable parsing
 */
function getTimePartsInTimezone(timestamp, timezone) {
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
        }
        else if (part.type === "minute") {
            minutes = parseInt(part.value, 10);
        }
    }
    // Handle midnight edge case (some locales return 24 for midnight)
    if (hours === 24)
        hours = 0;
    return { hours, minutes };
}
// One formatter per timezone: the month view converts ~16 candidates × ~31
// days × up to 3 offset look-ups, and constructing Intl.DateTimeFormat is the
// expensive part of each conversion.
const wallClockFormatters = new Map();
function getWallClockFormatter(timezone) {
    let fmt = wallClockFormatters.get(timezone);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
        wallClockFormatters.set(timezone, fmt);
    }
    return fmt;
}
/** The wall-clock reading of an instant in a timezone. */
function getWallClockParts(instantMs, timezone) {
    const parts = getWallClockFormatter(timezone).formatToParts(new Date(instantMs));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const hour = get("hour");
    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: hour === 24 ? 0 : hour, // some engines print midnight as "24"
        minute: get("minute"),
        second: get("second"),
    };
}
/**
 * Zone offset (ms, positive east of UTC) in force at an instant:
 * (wall clock read as UTC) − instant.
 */
function getOffsetMs(instantMs, timezone) {
    const p = getWallClockParts(instantMs, timezone);
    const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    // formatToParts has second precision; compare against whole seconds.
    return wallClockAsUtc - (instantMs - (instantMs % 1000));
}
/**
 * True when `instantMs` reads as exactly `dateStr time` on the wall clock of
 * `timezone` — i.e. the wall-clock time exists on that date. In the DST
 * spring-forward gap (02:30 on the day Europe/Berlin jumps 02:00 → 03:00)
 * no instant round-trips, because the time never occurred.
 */
function isWallClockInstant(instantMs, dateStr, time, timezone) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const p = getWallClockParts(instantMs, timezone);
    return (p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour === hours &&
        p.minute === minutes);
}
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
export function wallClockToUTC(dateStr, time, timezone) {
    const [hours, minutes] = time.split(":").map(Number);
    const [year, month, day] = dateStr.split("-").map(Number);
    // Create a naive UTC timestamp at the wall-clock time
    const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
    // First guess: the offset in force at the naive instant.
    const offset1 = getOffsetMs(naiveUtcMs, timezone);
    const guess1 = naiveUtcMs - offset1;
    const offset2 = getOffsetMs(guess1, timezone);
    if (offset2 === offset1) {
        return guess1;
    }
    // The offset changed between the naive and the guessed instant (we are
    // near a DST switch): retry with the offset actually in force there.
    const guess2 = naiveUtcMs - offset2;
    const offset3 = getOffsetMs(guess2, timezone);
    if (offset3 === offset2) {
        return guess2;
    }
    // Still inconsistent: the wall-clock time falls into a gap and exists
    // under neither offset. Fold it forward with the larger offset.
    return naiveUtcMs - Math.max(offset2, offset3);
}
/**
 * Convert a "HH:MM" time string to a slot index (0-95)
 * @param time - Time string "09:00" or "14:30"
 * @returns Slot index
 */
export function timeToSlotIndex(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 4 + Math.floor(minutes / 15);
}
/**
 * Convert a slot index (0-95) to a "HH:MM" time string
 * @param slotIndex - Slot index
 * @returns Time string "09:00"
 */
export function slotIndexToTime(slotIndex) {
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
export function localSlotToUTCSlot(dateStr, localSlotIndex, timezone) {
    const localTime = slotIndexToTime(localSlotIndex);
    const utcTimestamp = wallClockToUTC(dateStr, localTime, timezone);
    const { date, slot } = timestampToSlot(utcTimestamp);
    return { utcDate: date, utcSlot: slot };
}
export function timestampToSlot(timestamp) {
    const dateObj = new Date(timestamp);
    const date = dateObj.toISOString().split("T")[0];
    // Calculate minutes since midnight UTC
    const hours = dateObj.getUTCHours();
    const minutes = dateObj.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;
    const slot = Math.floor(totalMinutes / 15);
    return { date, slot };
}
export function getRequiredSlots(start, end) {
    const slots = new Map();
    // A non-finite bound requires nothing — the write paths reject it up
    // front (assertValidRange); here it only keeps `end = Infinity` from
    // looping forever in a read path.
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return slots;
    }
    let current = start;
    // Normalize start to the beginning of the slot?
    // For now, let's assume inputs are already aligned or we just take the containing slot.
    // Actually, if start is 14:05, it occupies the 14:00-14:15 slot.
    while (current < end) {
        const { date, slot } = timestampToSlot(current);
        if (!slots.has(date)) {
            slots.set(date, []);
        }
        const daySlots = slots.get(date);
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
export function slotToTimestamp(date, slotIndex) {
    const hours = Math.floor(slotIndex / 4);
    const minutes = (slotIndex % 4) * 15;
    return `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
}
function makeCandidate(startMs, slotsNeeded) {
    const slotsByDate = getRequiredSlots(startMs, startMs + slotsNeeded * SLOT_DURATION_MS);
    return {
        start: new Date(startMs).toISOString(),
        slots: [...slotsByDate.values()].flat(),
        slotsByDate,
    };
}
/**
 * Candidate step in slots for an interval in minutes, never below one slot:
 * a zero, negative or NaN interval would otherwise stall every candidate loop
 * (`index += 0`) — and slotInterval arrives unchecked from the query args.
 */
function intervalToStep(intervalMinutes) {
    const step = Math.ceil(intervalMinutes / 15);
    return step >= 1 ? step : 1;
}
/**
 * Generates all possible time slots for a given day within business hours
 * LEGACY: Uses hardcoded UTC business hours. Prefer generateDaySlotsWithTimezone.
 * @param date - ISO date string (e.g., "2025-06-17")
 * @param eventLengthMinutes - Event duration in minutes
 * @param intervalMinutes - Step between slots in minutes (default: 15)
 * @returns Candidates (see SlotCandidate); all slots lie on `date`
 */
export function generateDaySlots(date, eventLengthMinutes, intervalMinutes = 15) {
    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = intervalToStep(intervalMinutes);
    const possibleSlots = [];
    // Generate slots from business hours start to end, ensuring we don't go past business hours
    // We increment by `step` instead of 1
    for (let slotIndex = BUSINESS_HOURS_START; slotIndex + slotsNeeded <= BUSINESS_HOURS_END; slotIndex += step) {
        const startMs = Date.parse(slotToTimestamp(date, slotIndex));
        possibleSlots.push(makeCandidate(startMs, slotsNeeded));
    }
    return possibleSlots;
}
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
export function generateDaySlotsWithTimezone(date, eventLengthMinutes, intervalMinutes, availableSlots, timezone) {
    if (availableSlots.length === 0) {
        return [];
    }
    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = intervalToStep(intervalMinutes);
    const possibleSlots = [];
    // Sort + dedupe, then decompose into contiguous runs [start, end]
    // (inclusive). A schedule with split shifts (e.g. 08:00–12:00 +
    // 14:00–17:30) produces multiple runs; iterating one global grid from the
    // earliest slot would miss later window starts whenever the gap is not a
    // multiple of the interval (e.g. 14:00 lost for 120 min / 150 min grid).
    const sortedSlots = [...new Set(availableSlots)].sort((a, b) => a - b);
    const runs = [];
    for (const slot of sortedSlots) {
        const lastRun = runs[runs.length - 1];
        if (lastRun && slot === lastRun.end + 1) {
            lastRun.end = slot;
        }
        else {
            runs.push({ start: slot, end: slot });
        }
    }
    // Iterate potential start times per run, anchored at the run's start.
    // Slots within a run are contiguous by construction, so every candidate
    // that fits the run is fully available — no per-slot membership check.
    for (const run of runs) {
        for (let localSlotIndex = run.start; localSlotIndex + slotsNeeded <= run.end + 1; localSlotIndex += step) {
            // Convert the local start time to UTC
            const localTime = slotIndexToTime(localSlotIndex);
            const utcTimestamp = wallClockToUTC(date, localTime, timezone);
            // A wall-clock time that does not exist on this date (the DST
            // spring-forward gap) has no instant of its own: wallClockToUTC
            // folds it onto the instant an hour later, which is another
            // candidate's instant. Offering it would list one instant twice.
            if (!isWallClockInstant(utcTimestamp, date, localTime, timezone)) {
                continue;
            }
            // Slot indices keyed by UTC date, so a booking that crosses UTC
            // midnight is checked against BOTH days' rows (and never yields
            // out-of-range indices ≥ 96 that no row could match).
            possibleSlots.push(makeCandidate(utcTimestamp, slotsNeeded));
        }
    }
    return possibleSlots;
}
/**
 * Checks if a set of slots are available (not in busySlots array)
 */
export function areSlotsAvailable(requiredSlots, busySlots) {
    return !requiredSlots.some(slot => busySlots.includes(slot));
}
/**
 * Checks a candidate against the busy slots of EVERY UTC date it touches.
 * `busyByDate` maps a UTC date to that day's busy slot indices; a date with
 * no entry counts as free.
 */
export function isCandidateAvailable(candidate, busyByDate) {
    for (const [date, slots] of candidate.slotsByDate.entries()) {
        if (!areSlotsAvailable(slots, busyByDate.get(date) ?? [])) {
            return false;
        }
    }
    return true;
}
/**
 * Shared range guard for every write path that reserves slots: NaN/Infinity
 * and `end <= start` are rejected, because getRequiredSlots maps such a range
 * to ZERO slots and the booking would be created without holding anything.
 * Past-/notice-window checks stay the caller's responsibility by design.
 */
export function assertValidRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new Error("Invalid time range: end must be after start");
    }
}
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
export function isDayAvailable(eventLengthMinutes, busySlots, intervalMinutes = 15, availableSlots) {
    const slotsNeeded = Math.ceil(eventLengthMinutes / 15);
    const step = intervalToStep(intervalMinutes);
    if (availableSlots && availableSlots.length > 0) {
        const availableSet = new Set(availableSlots);
        const minSlot = Math.min(...availableSlots);
        const maxSlot = Math.max(...availableSlots);
        for (let s = minSlot; s + slotsNeeded <= maxSlot + 1; s += step) {
            let free = true;
            for (let i = 0; i < slotsNeeded; i++) {
                if (!availableSet.has(s + i) || busySlots.includes(s + i)) {
                    free = false;
                    break;
                }
            }
            if (free)
                return true;
        }
        return false;
    }
    // Legacy: hardcoded 9–17
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
//# sourceMappingURL=utils.js.map