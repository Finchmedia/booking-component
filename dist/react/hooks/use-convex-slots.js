"use client";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../context.js";
import { getSessionId } from "../utils/session.js";
import { formatDateInTimezone } from "../utils/date-utils.js";
import { isCivilDate, monthGrid } from "../utils/civil-date.js";
import { effectiveSlotInterval } from "../../shared/durations.js";
const QUANTUM_MS = 15 * 60 * 1000; // Presence holds are 15-minute quanta
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PRESENCE_DATES = 3; // Fixed number of presence queries per render
/**
 * Helper: The UTC dates ("YYYY-MM-DD") whose presence quanta can overlap a
 * booking of durationMinutes at any of the given starts. A quantum starting
 * less than 15 minutes before a start overlaps it. Stops after one date more
 * than can be queried, which tells the caller presence is incomplete.
 */
function presenceDatesFor(starts, durationMinutes) {
    if (starts.length === 0 || !(durationMinutes > 0))
        return [];
    const from = Math.min(...starts) - QUANTUM_MS + 1;
    const to = Math.max(...starts) + durationMinutes * 60 * 1000 - 1;
    const dates = [];
    for (let day = Math.floor(from / DAY_MS) * DAY_MS; day <= to && dates.length <= MAX_PRESENCE_DATES; day += DAY_MS) {
        dates.push(new Date(day).toISOString().slice(0, 10));
    }
    return dates;
}
/**
 * Helper: Check if a booking would conflict with any active presence holds.
 * @param slotTime - ISO timestamp of the slot start time
 * @param durationMinutes - Duration of the booking in minutes
 * @param presence - Active presence records (any UTC dates)
 * @param currentUserId - Current user's session ID
 * @returns true if another user holds a quantum overlapping [start, end)
 *
 * Compares instants, so a hold on a neighbouring day never matches by time of day.
 */
function hasPresenceConflict(slotTime, durationMinutes, presence, currentUserId) {
    const start = Date.parse(slotTime);
    const end = start + durationMinutes * 60 * 1000;
    return presence.some((p) => {
        if (p.user === currentUserId)
            return false; // Ignore own holds
        const heldFrom = Date.parse(p.slot);
        return heldFrom < end && heldFrom + QUANTUM_MS > start;
    });
}
export const useConvexSlots = (resourceId, eventLength, slotInterval, allDurationOptions, enabled = true, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) => {
    const api = useBookingAPI();
    // Refresh time outside render so an open calendar drops elapsed slots even
    // when neither inventory nor presence changes.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled)
            return;
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, [enabled]);
    const [dateRange, setDateRange] = useState(null);
    const [selectedDateStr, setSelectedDateStr] = useState(null);
    // Smart default: use the minimum duration so the slot grid offers maximum booking flexibility.
    // allDurationOptions is [lengthInMinutes, ...lengthInMinutesOptions]; without it, eventLength.
    const [lengthInMinutes = eventLength, ...lengthInMinutesOptions] = allDurationOptions ?? [];
    const effectiveInterval = effectiveSlotInterval({
        slotInterval,
        lengthInMinutes,
        lengthInMinutesOptions,
    });
    const monthAvailability = useQuery(api.getMonthAvailability, enabled && dateRange
        ? {
            resourceId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            eventLength,
            slotInterval: effectiveInterval,
        }
        : "skip");
    const daySlots = useQuery(api.getDaySlots, enabled && selectedDateStr
        ? {
            resourceId,
            date: selectedDateStr,
            eventLength,
            slotInterval: effectiveInterval,
        }
        : "skip");
    // Get current user's session ID (stable across renders)
    const currentUserId = useMemo(() => getSessionId(), []);
    const monthSlots = monthAvailability ?? {};
    // Future slots in time order
    // Note: convex-helpers caching handles stale-while-revalidate, so we don't need
    // our own caching layer here. This simplifies the code and avoids cross-date bugs.
    const upcomingSlots = useMemo(() => {
        if (!daySlots)
            return [];
        // Map and filter out past slots (slots that have already passed)
        const formatted = daySlots
            .map((slot) => ({
            time: slot.time,
            attendees: 0,
        }))
            .filter((slot) => new Date(slot.time).getTime() > now);
        formatted.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        return formatted;
    }, [daySlots, now]);
    // Presence is stored per UTC date. The day's slots and their durations can
    // span several, so read each of them (separate queries for O(1) invalidation).
    const spannedDates = useMemo(() => presenceDatesFor(upcomingSlots.map((slot) => Date.parse(slot.time)), eventLength), [upcomingSlots, eventLength]);
    const presenceIncomplete = spannedDates.length > MAX_PRESENCE_DATES;
    const presenceArgs = (index) => enabled && spannedDates[index]
        ? { resourceId, date: spannedDates[index] }
        : "skip";
    // A fixed number of calls keeps the hook order stable
    const presence0 = useQuery(api.getDatePresence, presenceArgs(0));
    const presence1 = useQuery(api.getDatePresence, presenceArgs(1));
    const presence2 = useQuery(api.getDatePresence, presenceArgs(2));
    const warnedIncomplete = useRef(false);
    useEffect(() => {
        if (!presenceIncomplete || warnedIncomplete.current)
            return;
        warnedIncomplete.current = true;
        console.warn(`useConvexSlots: slots of ${eventLength} minutes span more than ${MAX_PRESENCE_DATES} UTC dates; ` +
            "presence after the third date is not shown.");
    }, [presenceIncomplete, eventLength]);
    // PRESENCE-AWARE SPLIT: Separate available vs reserved slots
    const processedSlots = useMemo(() => {
        const holds = [...(presence0 ?? []), ...(presence1 ?? []), ...(presence2 ?? [])];
        if (holds.length === 0) {
            // No presence conflicts - all slots available
            return { available: upcomingSlots, reserved: [] };
        }
        const available = upcomingSlots.filter((slot) => !hasPresenceConflict(slot.time, eventLength, holds, currentUserId));
        const reserved = upcomingSlots.filter((slot) => hasPresenceConflict(slot.time, eventLength, holds, currentUserId));
        return { available, reserved };
    }, [upcomingSlots, presence0, presence1, presence2, eventLength, currentUserId]);
    const availableSlots = processedSlots.available;
    const reservedSlots = processedSlots.reserved;
    // Loading: waiting for initial data
    const isLoading = enabled && selectedDateStr !== null && !daySlots;
    // Fetch month slots (for calendar dots)
    const fetchMonthSlotsFor = useCallback((year, month) => {
        // The month's weeks: the Monday on or before the 1st to the Sunday on or
        // after the last day. Civil dates, so the range is the same in every zone.
        const days = monthGrid(year, month); // Throws RangeError for an invalid month
        if (!enabled)
            return;
        let last = days.length - 1;
        while (Number(days[last].slice(5, 7)) !== month)
            last--;
        setDateRange({ from: days[0], to: days[last + 6 - (last % 7)] });
    }, [enabled]);
    const fetchMonthSlots = useCallback((currentDate) => fetchMonthSlotsFor(currentDate.getFullYear(), currentDate.getMonth() + 1), [fetchMonthSlotsFor]);
    // Fetch slots for a specific date (for time slot panel)
    const fetchSlotsForDate = useCallback((date) => {
        if (!isCivilDate(date)) {
            throw new RangeError(`useConvexSlots: expected a "YYYY-MM-DD" date, got "${date}"`);
        }
        if (!enabled)
            return;
        setSelectedDateStr(date);
    }, [enabled]);
    const fetchSlots = useCallback((date) => {
        if (!enabled)
            return;
        // Use timezone-aware date formatting to prevent off-by-one errors
        const dateStr = formatDateInTimezone(date, timezone);
        setSelectedDateStr(dateStr);
    }, [enabled, timezone]);
    return {
        monthSlots,
        availableSlots,
        reservedSlots,
        isLoading,
        presenceIncomplete,
        fetchMonthSlots,
        fetchMonthSlotsFor,
        fetchSlots,
        fetchSlotsForDate,
    };
};
//# sourceMappingURL=use-convex-slots.js.map