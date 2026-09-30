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
    payloadVersion?: 2 | undefined;
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
    payloadVersion?: 2 | undefined;
    eventType: string;
    functionHandle: string;
    enabled: boolean;
    createdAt: number;
} | null>>;
/**
 * Registers a host function, given as a handle from `createFunctionHandle`,
 * for one lifecycle event (organization-scoped or global). The handle runs
 * with every matching payload, booker details included, so keep
 * registration server-side and administrator-only.
 *
 * `payloadVersion` selects the payload the handle receives as its args:
 * - omitted: version 1, whose shape depends on the emitting function and
 *   which mostly carries the management token (docs/hook-payloads-v1.md);
 * - 2: one envelope per event name, `bookingHookEventV2`, without the token
 *   (docs/hook-payloads-v2.md).
 */
export declare const registerHook: import("convex/server").RegisteredMutation<"public", {
    organizationId?: string | undefined;
    payloadVersion?: 2 | undefined;
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
    payloadV2?: any;
    eventType: string;
    payload: any;
}, Promise<null>>;
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
    toStatus: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
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
    toStatus: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    fromStatus: "" | "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    timestamp: number;
}[]>>;
//# sourceMappingURL=hooks.d.ts.map