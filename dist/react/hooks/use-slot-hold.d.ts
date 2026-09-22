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
export declare function useSlotHold(resourceId: string, slotId: string | null, durationMinutes?: number, eventTypeId?: string): string;
//# sourceMappingURL=use-slot-hold.d.ts.map