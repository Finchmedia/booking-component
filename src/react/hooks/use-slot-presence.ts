"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../context";
import { getSessionId } from "../utils/session";

/**
 * Checks if a specific slot is currently held by another user: isLocked is
 * true while any other session holds it, even if this session holds it too.
 * @param resourceId - The resource ID (e.g. "studio-a")
 * @param slotId - The ID of the slot to check
 */
export function useSlotPresence(resourceId: string, slotId: string) {
  const api = useBookingAPI();

  // Fetch active users in this slot
  const presence = useQuery(api.getPresence, { resourceId, slot: slotId });

  // Get current user's ID
  const myUserId = getSessionId();

  // If no data yet, assume free (or loading)
  if (!presence) {
    return {
      isLocked: false,
      isHeldByMe: false,
      isLoading: true,
    };
  }

  // Logic:
  // 1. If presence list is empty -> Free
  // 2. If any other user holds the slot -> Locked, whoever sent the latest heartbeat
  // 3. If only ME -> Free (for me)

  const isHeldByMe = presence.some((holder: { user: string }) => holder.user === myUserId);
  const isHeldByOther = presence.some((holder: { user: string }) => holder.user !== myUserId);

  return {
    isLocked: isHeldByOther, // The main flag for UI
    isHeldByMe,
    holderCount: presence.length,
    isLoading: false,
  };
}
