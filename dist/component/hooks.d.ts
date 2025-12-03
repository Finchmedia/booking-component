export declare const HOOK_EVENTS: readonly ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed", "presence.timeout"];
export type HookEventType = (typeof HOOK_EVENTS)[number];
export declare const listHooks: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    eventType?: string | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"hooks">;
    _creationTime: number;
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
    createdAt: number;
    enabled: boolean;
}[]>>;
export declare const getHook: import("convex/server").RegisteredQuery<"public", {
    hookId: import("convex/values").GenericId<"hooks">;
}, Promise<{
    _id: import("convex/values").GenericId<"hooks">;
    _creationTime: number;
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
    createdAt: number;
    enabled: boolean;
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
    resendOptions?: {
        fromEmail?: string | undefined;
        apiKey: string;
    } | undefined;
    eventType: string;
    payload: any;
}, Promise<{
    triggeredCount: number;
    emailsSent: boolean;
}>>;
export declare const transitionBookingState: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        apiKey: string;
    } | undefined;
    reason?: string | undefined;
    changedBy?: string | undefined;
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
    reason?: string | undefined;
    changedBy?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
    toStatus: string;
    fromStatus: string;
    timestamp: number;
}[]>>;
//# sourceMappingURL=hooks.d.ts.map