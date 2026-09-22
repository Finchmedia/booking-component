"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { useBookingAPI } from "../context";
import { getSessionId } from "../utils/session";

/**
 * Maintains advisory presence on one or more slots by sending periodic heartbeats.
 * Creates presence records at 15-minute quantum intervals for complete coverage.
 *
 * @param resourceId - The resource ID (e.g. "studio-a")
 * @param slotId - The ID of the selected slot (e.g. "2024-05-20T10:00:00.000Z")
 * @param durationMinutes - Duration of the booking in minutes
 * @param eventTypeId - Optional event type ID for admin presence awareness
 *
 * Presence follows resource, slot and duration changes. It is a UI signal, not
 * an inventory lock; the booking mutation is responsible for conflict checks.
 */
export function useSlotHold(
  resourceId: string,
  slotId: string | null,
  durationMinutes: number = 60,
  eventTypeId?: string
) {
  const api = useBookingAPI();
  const heartbeat = useMutation(api.heartbeat);
  const leave = useMutation(api.leave);
  // We use state to ensure ID is stable for the component lifecycle
  const [userId] = useState(() => getSessionId());

  useEffect(() => {
    if (!slotId || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    // Use 15-minute quantum intervals for complete presence coverage
    // This ensures conflict detection works regardless of display slot interval
    // Example: 60-min booking → 4 presence records (13:00, 13:15, 13:30, 13:45)
    const QUANTUM_MINUTES = 15;
    const quantumsNeeded = Math.ceil(durationMinutes / QUANTUM_MINUTES);

    // Generate array of affected slot times at quantum intervals
    const startTime = new Date(slotId).getTime();
    if (!Number.isFinite(startTime)) return;
    const affectedSlots: string[] = [];

    for (let i = 0; i < quantumsNeeded; i++) {
      const slotTime = new Date(startTime + i * QUANTUM_MINUTES * 60 * 1000);
      affectedSlots.push(slotTime.toISOString());
    }

    // 1. Immediate heartbeat when slot is selected (batched API - single call!)
    // Presence is best effort: connectivity failures must not leave unhandled
    // promise rejections. The next heartbeat retries, and stale records expire.
    const sendHeartbeat = () => {
      void heartbeat({ resourceId, slots: affectedSlots, user: userId, eventTypeId })
        .catch(() => undefined);
    };
    sendHeartbeat();

    // 2. Periodic heartbeat every 5 seconds
    const interval = setInterval(sendHeartbeat, 5000);

    // 3. Cleanup: Explicitly leave when unmounting or changing slots
    return () => {
      clearInterval(interval);
      void leave({ resourceId, slots: affectedSlots, user: userId })
        .catch(() => undefined);
    };
  }, [resourceId, slotId, durationMinutes, userId, eventTypeId, heartbeat, leave]);

  return userId;
}
