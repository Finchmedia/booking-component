"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../context";
import { getSessionId } from "../utils/session";
import { formatDateInTimezone } from "../utils/date-utils";
import type { TimeSlot, MonthSlots } from "../types";

export interface UseConvexSlotsResult {
  monthSlots: MonthSlots;
  availableSlots: TimeSlot[];
  reservedSlots: TimeSlot[]; // Slots held by other users' presence
  isLoading: boolean;
  fetchMonthSlots: (currentDate: Date) => void;
  fetchSlots: (date: Date) => void;
}

/**
 * Helper: Calculate which 15-minute slot indices are required for a booking.
 * @param slotTime - ISO timestamp of the slot start time (UTC)
 * @param durationMinutes - Duration of the booking in minutes
 * @returns Array of 15-minute slot indices (0-95) that would be occupied
 *
 * IMPORTANT: Uses UTC methods to match backend slot calculations.
 * The backend stores and generates slots in UTC context.
 */
function calculateRequiredSlots(
  slotTime: string,
  durationMinutes: number
): number[] {
  const slotsNeeded = Math.ceil(durationMinutes / 15); // How many 15-min chunks needed

  // Convert start time to slot index (0-95) using UTC to match backend
  const startDate = new Date(slotTime);
  const hours = startDate.getUTCHours();
  const minutes = startDate.getUTCMinutes();
  const startSlotIndex = hours * 4 + Math.floor(minutes / 15);

  // Return array of all required slot indices
  return Array.from({ length: slotsNeeded }, (_, i) => startSlotIndex + i);
}

/**
 * Helper: Check if a booking would conflict with any active presence holds.
 * @param slotTime - ISO timestamp of the slot start time
 * @param durationMinutes - Duration of the booking in minutes
 * @param presence - Array of active presence records
 * @param currentUserId - Current user's session ID
 * @returns true if there's a conflict with another user's hold
 *
 * IMPORTANT: Uses UTC methods to match backend presence slot format.
 */
function hasPresenceConflict(
  slotTime: string,
  durationMinutes: number,
  presence: Array<{ slot: string; user: string; updated: number }>,
  currentUserId: string
): boolean {
  const requiredSlots = calculateRequiredSlots(slotTime, durationMinutes);

  // Convert all held slots to their indices using UTC to match backend
  const heldSlots = presence
    .filter((p) => p.user !== currentUserId) // Ignore own holds
    .map((p) => {
      const heldDate = new Date(p.slot);
      const hours = heldDate.getUTCHours();
      const minutes = heldDate.getUTCMinutes();
      return hours * 4 + Math.floor(minutes / 15);
    });

  // Check if any required slot is held by another user
  return requiredSlots.some((slot) => heldSlots.includes(slot));
}

export const useConvexSlots = (
  resourceId: string,
  eventLength: number,
  slotInterval?: number,
  allDurationOptions?: number[],
  enabled: boolean = true,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): UseConvexSlotsResult => {
  const api = useBookingAPI();
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // Smart defaulting: Use minimum duration for maximum booking flexibility (Cal.com best practice)
  const effectiveInterval =
    slotInterval ??
    (allDurationOptions && allDurationOptions.length > 0
      ? Math.min(...allDurationOptions)
      : eventLength);

  const monthAvailability = useQuery(
    api.getMonthAvailability,
    enabled && dateRange
      ? {
          resourceId,
          dateFrom: dateRange.from,
          dateTo: dateRange.to,
          eventLength,
          slotInterval: effectiveInterval,
        }
      : "skip"
  );

  const daySlots = useQuery(
    api.getDaySlots,
    enabled && selectedDateStr
      ? {
          resourceId,
          date: selectedDateStr,
          eventLength,
          slotInterval: effectiveInterval,
        }
      : "skip"
  );

  // Fetch presence data for the selected date (separate query for O(1) invalidation)
  const datePresence = useQuery(
    api.getDatePresence,
    enabled && selectedDateStr
      ? {
          resourceId,
          date: selectedDateStr,
        }
      : "skip"
  );

  // Get current user's session ID (stable across renders)
  const currentUserId = useMemo(() => getSessionId(), []);

  const monthSlots: MonthSlots = monthAvailability ?? {};

  // Process slots: filter past slots and split by presence
  // Note: convex-helpers caching handles stale-while-revalidate, so we don't need
  // our own caching layer here. This simplifies the code and avoids cross-date bugs.
  const processedSlots = useMemo<{
    available: TimeSlot[];
    reserved: TimeSlot[];
  }>(() => {
    if (!daySlots) {
      return { available: [], reserved: [] };
    }

    const now = Date.now();

    // Map and filter out past slots (slots that have already passed)
    const formatted = (daySlots as any[])
      .map((slot) => ({
        time: slot.time,
        attendees: 0,
      }))
      .filter((slot) => new Date(slot.time).getTime() > now);

    formatted.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // PRESENCE-AWARE SPLIT: Separate available vs reserved slots
    if (datePresence && datePresence.length > 0) {
      const available = formatted.filter(
        (slot) =>
          !hasPresenceConflict(
            slot.time,
            eventLength,
            datePresence,
            currentUserId
          )
      );
      const reserved = formatted.filter((slot) =>
        hasPresenceConflict(slot.time, eventLength, datePresence, currentUserId)
      );
      return { available, reserved };
    }

    // No presence conflicts - all slots available
    return { available: formatted, reserved: [] };
  }, [daySlots, datePresence, eventLength, currentUserId]);

  const availableSlots = processedSlots.available;
  const reservedSlots = processedSlots.reserved;

  // Loading: waiting for initial data
  const isLoading = enabled && selectedDateStr !== null && !daySlots;

  // Fetch month slots (for calendar dots)
  const fetchMonthSlots = useCallback(
    (currentDate: Date) => {
      if (!enabled) return;

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // Get first and last day of the month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Extend to cover the full calendar view (including prev/next month days)
      const startDate = new Date(firstDay);
      startDate.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

      const endDate = new Date(lastDay);
      endDate.setDate(lastDay.getDate() + (6 - ((lastDay.getDay() + 6) % 7)));

      // Use timezone-aware date formatting to prevent off-by-one errors
      const dateFrom = formatDateInTimezone(startDate, timezone);
      const dateTo = formatDateInTimezone(endDate, timezone);

      setDateRange({ from: dateFrom, to: dateTo });
    },
    [enabled, timezone]
  );

  // Fetch slots for a specific date (for time slot panel)
  const fetchSlots = useCallback(
    (date: Date) => {
      if (!enabled) return;

      // Use timezone-aware date formatting to prevent off-by-one errors
      const dateStr = formatDateInTimezone(date, timezone);
      setSelectedDateStr(dateStr);
    },
    [enabled, timezone]
  );

  return {
    monthSlots,
    availableSlots,
    reservedSlots,
    isLoading,
    fetchMonthSlots,
    fetchSlots,
  };
};
