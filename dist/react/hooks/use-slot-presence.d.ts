/**
 * Checks if a specific slot is currently held by another user: isLocked is
 * true while any other session holds it, even if this session holds it too.
 * @param resourceId - The resource ID (e.g. "studio-a")
 * @param slotId - The ID of the slot to check
 */
export declare function useSlotPresence(resourceId: string, slotId: string): {
    isLocked: boolean;
    isHeldByMe: boolean;
    isLoading: boolean;
    holderCount?: undefined;
} | {
    isLocked: any;
    isHeldByMe: any;
    holderCount: any;
    isLoading: boolean;
};
//# sourceMappingURL=use-slot-presence.d.ts.map