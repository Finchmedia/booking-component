export declare const HOOK_EVENTS: readonly ["booking.created", "booking.pending", "booking.confirmed", "booking.cancelled", "booking.completed", "booking.declined", "booking.rescheduled", "presence.timeout"];
export type HookEventType = (typeof HOOK_EVENTS)[number];
/**
 * Lists registered hooks, optionally narrowed to one event type and/or to
 * "this organization's or global (no organizationId)" hooks. The result is
 * always in creation order, whichever branch produced it.
 */
export declare const listHooks: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    eventType?: string | undefined;
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
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    emailContext?: {
        notificationId?: string | undefined;
        occurredAt?: number | undefined;
        bookingId?: string | undefined;
        bookingUid?: string | undefined;
        organizationId?: string | undefined;
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
        previousStart?: number | undefined;
        previousEnd?: number | undefined;
        reason?: string | undefined;
        location?: {
            value?: string | undefined;
            type: string;
        } | undefined;
        links?: {
            view: string;
            reschedule: string;
            cancel: string;
        } | undefined;
        version: 1;
        kind: "confirmed" | "pending" | "approved" | "declined" | "cancelled" | "rescheduled";
        bookerName: string;
        bookerEmail: string;
        eventTitle: string;
        start: number;
        end: number;
        timezone: string;
    } | undefined;
    eventType: string;
    payload: any;
}, Promise<{
    triggeredCount: number;
    emailsSent: boolean;
}>>;
export declare const transitionBookingState: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    changedBy?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
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