/**
 * Automatically maintains a "hold" on one or more slots by sending periodic heartbeats.
 * Creates presence records at 15-minute quantum intervals for complete coverage.
 *
 * @param resourceId - The resource ID (e.g. "studio-a")
 * @param slotId - The ID of the selected slot (e.g. "2024-05-20T10:00:00.000Z")
 * @param durationMinutes - Duration of the booking in minutes (LOCKED at slot selection)
 * @param eventTypeId - Optional event type ID for admin presence awareness
 *
 * NOTE: durationMinutes is intentionally NOT in the useEffect dependency array.
 * Per UX design, once a user selects a slot, the duration is LOCKED and cannot change.
 * If the user wants a different duration, they must click "Back" and reselect.
 */
export declare function useSlotHold(resourceId: string, slotId: string | null, durationMinutes?: number, eventTypeId?: string): string;
//# sourceMappingURL=use-slot-hold.d.ts.map