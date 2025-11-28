/**
 * Checks if a specific slot is currently held by another user.
 * @param resourceId - The resource ID (e.g. "studio-a")
 * @param slotId - The ID of the slot to check
 */
export declare function useSlotPresence(resourceId: string, slotId: string): {
    isLocked: boolean;
    isHeldByMe: boolean;
    isLoading: boolean;
    holderCount?: undefined;
} | {
    isLocked: boolean;
    isHeldByMe: boolean;
    holderCount: any;
    isLoading: boolean;
};
//# sourceMappingURL=use-slot-presence.d.ts.map