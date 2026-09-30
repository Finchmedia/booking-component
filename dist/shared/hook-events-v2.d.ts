import { type Infer } from "convex/values";
/** The events a version 2 hook can receive. */
export declare const BOOKING_HOOK_EVENTS_V2: readonly ["booking.created", "booking.pending", "booking.confirmed", "booking.declined", "booking.cancelled", "booking.completed", "booking.rescheduled"];
/**
 * The arguments a `payloadVersion: 2` hook receives, the same object type
 * for every event. Declare it as a handler's `args` (Convex takes only an
 * object validator there) to validate every delivery.
 */
export declare const bookingHookEventV2: import("convex/values").VObject<{
    organizationId?: string | undefined;
    previousStart?: number | undefined;
    previousEnd?: number | undefined;
    reason?: string | undefined;
    changedBy?: string | undefined;
    previousStatus?: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed" | undefined;
    originalBookingId?: string | undefined;
    newBookingId?: string | undefined;
    version: 2;
    bookingId: string;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    resourceIds: string[];
    event: "booking.created" | "booking.pending" | "booking.confirmed" | "booking.declined" | "booking.cancelled" | "booking.completed" | "booking.rescheduled";
    isMultiResource: boolean;
}, {
    version: import("convex/values").VLiteral<2, "required">;
    event: import("convex/values").VUnion<"booking.created" | "booking.pending" | "booking.confirmed" | "booking.declined" | "booking.cancelled" | "booking.completed" | "booking.rescheduled", import("convex/values").VLiteral<"booking.created" | "booking.pending" | "booking.confirmed" | "booking.declined" | "booking.cancelled" | "booking.completed" | "booking.rescheduled", "required">[], "required", never>;
    /** The booking's document ID (for `booking.rescheduled`: the new booking's). */
    bookingId: import("convex/values").VString<string, "required">;
    uid: import("convex/values").VString<string, "required">;
    /** Absent for bookings without organization (legacy rows, organization-less event types). */
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    /** The primary resource: a bundle's first item. */
    resourceId: import("convex/values").VString<string, "required">;
    /** Every resource the booking holds: a bundle's items in order, else `[resourceId]`. */
    resourceIds: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
    /** `"legacy"` for `createReservation` bookings. */
    eventTypeId: import("convex/values").VString<string, "required">;
    /** The status after the event. */
    status: import("convex/values").VUnion<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed", import("convex/values").VLiteral<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed", "required">[], "required", never>;
    /** The status before the event; set by transitions and cancellations. */
    previousStatus: import("convex/values").VUnion<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed" | undefined, import("convex/values").VLiteral<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed", "required">[], "optional", never>;
    start: import("convex/values").VFloat64<number, "required">;
    end: import("convex/values").VFloat64<number, "required">;
    timezone: import("convex/values").VString<string, "required">;
    bookerName: import("convex/values").VString<string, "required">;
    bookerEmail: import("convex/values").VString<string, "required">;
    eventTitle: import("convex/values").VString<string, "required">;
    /** The reason recorded for the change, when there is one. */
    reason: import("convex/values").VString<string | undefined, "optional">;
    /** The actor recorded in the booking history, when there is one. */
    changedBy: import("convex/values").VString<string | undefined, "optional">;
    /** True for bookings with bundle items. */
    isMultiResource: import("convex/values").VBoolean<boolean, "required">;
    /** The moved original's document ID. */
    originalBookingId: import("convex/values").VString<string | undefined, "optional">;
    /** Equals `bookingId`. */
    newBookingId: import("convex/values").VString<string | undefined, "optional">;
    /** The moved original's start. */
    previousStart: import("convex/values").VFloat64<number | undefined, "optional">;
    /** The moved original's end. */
    previousEnd: import("convex/values").VFloat64<number | undefined, "optional">;
}, "required", "version" | "bookingId" | "organizationId" | "resourceId" | "eventTypeId" | "bookerName" | "bookerEmail" | "eventTitle" | "start" | "end" | "timezone" | "previousStart" | "previousEnd" | "reason" | "changedBy" | "status" | "uid" | "resourceIds" | "event" | "previousStatus" | "isMultiResource" | "originalBookingId" | "newBookingId">;
export type BookingHookEventV2 = Infer<typeof bookingHookEventV2>;
//# sourceMappingURL=hook-events-v2.d.ts.map