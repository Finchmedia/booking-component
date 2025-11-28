export declare const HOOK_EVENTS: readonly ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed", "presence.timeout"];
export type HookEventType = (typeof HOOK_EVENTS)[number];
export declare const listHooks: import("convex/server").RegisteredQuery<"public", {
    eventType?: string | undefined;
    organizationId?: string | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"hooks">;
    _creationTime: number;
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
    enabled: boolean;
    createdAt: number;
}[]>>;
export declare const getHook: import("convex/server").RegisteredQuery<"public", {
    hookId: import("convex/values").GenericId<"hooks">;
}, Promise<{
    _id: import("convex/values").GenericId<"hooks">;
    _creationTime: number;
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
    enabled: boolean;
    createdAt: number;
} | null>>;
export declare const registerHook: import("convex/server").RegisteredMutation<"public", {
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
}, Promise<import("convex/values").GenericId<"hooks">>>;
export declare const updateHook: import("convex/server").RegisteredMutation<"public", {
    functionHandle?: string | undefined;
    enabled?: boolean | undefined;
    hookId: import("convex/values").GenericId<"hooks">;
}, Promise<import("convex/values").GenericId<"hooks">>>;
export declare const unregisterHook: import("convex/server").RegisteredMutation<"public", {
    hookId: import("convex/values").GenericId<"hooks">;
}, Promise<{
    success: boolean;
}>>;
export declare const triggerHooks: import("convex/server").RegisteredMutation<"internal", {
    organizationId?: string | undefined;
    eventType: string;
    payload: any;
}, Promise<{
    triggeredCount: number;
}>>;
export declare const transitionBookingState: import("convex/server").RegisteredMutation<"public", {
    changedBy?: string | undefined;
    reason?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
    toStatus: string;
}, Promise<{
    success: boolean;
}>>;
export declare const getBookingHistory: import("convex/server").RegisteredQuery<"public", {
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    _id: import("convex/values").GenericId<"booking_history">;
    _creationTime: number;
    changedBy?: string | undefined;
    reason?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
    toStatus: string;
    fromStatus: string;
    timestamp: number;
}[]>>;
//# sourceMappingURL=hooks.d.ts.map