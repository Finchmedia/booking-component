import type { FunctionReference } from "convex/server";
import type { Infer } from "convex/values";
/** Presentation events, distinct from the component's lifecycle hook names. */
export declare const bookingEmailKindValidator: import("convex/values").VUnion<"confirmed" | "pending" | "approved" | "declined" | "cancelled" | "rescheduled", [import("convex/values").VLiteral<"confirmed", "required">, import("convex/values").VLiteral<"pending", "required">, import("convex/values").VLiteral<"approved", "required">, import("convex/values").VLiteral<"declined", "required">, import("convex/values").VLiteral<"cancelled", "required">, import("convex/values").VLiteral<"rescheduled", "required">], "required", never>;
export type BookingEmailKind = Infer<typeof bookingEmailKindValidator>;
/** A snapshot captured for one notification. It contains no delivery credentials. */
export declare const bookingEmailContextValidator: import("convex/values").VObject<{
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
}, {
    version: import("convex/values").VLiteral<1, "required">;
    kind: import("convex/values").VUnion<"confirmed" | "pending" | "approved" | "declined" | "cancelled" | "rescheduled", [import("convex/values").VLiteral<"confirmed", "required">, import("convex/values").VLiteral<"pending", "required">, import("convex/values").VLiteral<"approved", "required">, import("convex/values").VLiteral<"declined", "required">, import("convex/values").VLiteral<"cancelled", "required">, import("convex/values").VLiteral<"rescheduled", "required">], "required", never>;
    notificationId: import("convex/values").VString<string | undefined, "optional">;
    occurredAt: import("convex/values").VFloat64<number | undefined, "optional">;
    bookingId: import("convex/values").VString<string | undefined, "optional">;
    bookingUid: import("convex/values").VString<string | undefined, "optional">;
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    resourceId: import("convex/values").VString<string | undefined, "optional">;
    eventTypeId: import("convex/values").VString<string | undefined, "optional">;
    bookerName: import("convex/values").VString<string, "required">;
    bookerEmail: import("convex/values").VString<string, "required">;
    eventTitle: import("convex/values").VString<string, "required">;
    start: import("convex/values").VFloat64<number, "required">;
    end: import("convex/values").VFloat64<number, "required">;
    timezone: import("convex/values").VString<string, "required">;
    previousStart: import("convex/values").VFloat64<number | undefined, "optional">;
    previousEnd: import("convex/values").VFloat64<number | undefined, "optional">;
    reason: import("convex/values").VString<string | undefined, "optional">;
    location: import("convex/values").VObject<{
        value?: string | undefined;
        type: string;
    } | undefined, {
        type: import("convex/values").VString<string, "required">;
        value: import("convex/values").VString<string | undefined, "optional">;
    }, "optional", "type" | "value">;
    links: import("convex/values").VObject<{
        view: string;
        reschedule: string;
        cancel: string;
    } | undefined, {
        view: import("convex/values").VString<string, "required">;
        reschedule: import("convex/values").VString<string, "required">;
        cancel: import("convex/values").VString<string, "required">;
    }, "optional", "view" | "reschedule" | "cancel">;
}, "required", "version" | "kind" | "notificationId" | "occurredAt" | "bookingId" | "bookingUid" | "organizationId" | "resourceId" | "eventTypeId" | "bookerName" | "bookerEmail" | "eventTitle" | "start" | "end" | "timezone" | "previousStart" | "previousEnd" | "reason" | "location" | "links" | "location.type" | "location.value" | "links.view" | "links.reschedule" | "links.cancel">;
export type BookingEmailContext = Infer<typeof bookingEmailContextValidator>;
/** Return null to use Booking's built-in template for this notification. */
export declare const bookingEmailResultValidator: import("convex/values").VUnion<{
    text?: string | undefined;
    subject: string;
    html: string;
} | null, [import("convex/values").VNull<null, "required">, import("convex/values").VObject<{
    text?: string | undefined;
    subject: string;
    html: string;
}, {
    subject: import("convex/values").VString<string, "required">;
    html: import("convex/values").VString<string, "required">;
    text: import("convex/values").VString<string | undefined, "optional">;
}, "required", "subject" | "html" | "text">], "required", "subject" | "html" | "text">;
export type RenderedBookingEmail = Infer<typeof bookingEmailResultValidator>;
/** Wire format. Only trusted host functions should construct these options. */
export declare const bookingEmailOptionsValidator: import("convex/values").VObject<{
    fromEmail?: string | undefined;
    baseUrl?: string | undefined;
    renderer?: string | undefined;
    apiKey: string;
}, {
    apiKey: import("convex/values").VString<string, "required">;
    fromEmail: import("convex/values").VString<string | undefined, "optional">;
    baseUrl: import("convex/values").VString<string | undefined, "optional">;
    renderer: import("convex/values").VString<string | undefined, "optional">;
}, "required", "apiKey" | "fromEmail" | "baseUrl" | "renderer">;
export type BookingEmailOptions = Infer<typeof bookingEmailOptionsValidator>;
export type BookingEmailRenderer = FunctionReference<"query", "internal", BookingEmailContext, RenderedBookingEmail>;
/**
 * Call inside a host Convex function, not at module initialization.
 * The renderer stays in the app; only its function handle crosses the boundary.
 */
export declare function createBookingEmailOptions(options: Omit<BookingEmailOptions, "renderer"> & {
    renderer?: BookingEmailRenderer;
}): Promise<BookingEmailOptions>;
/** Combined UTF-8 content budget, comfortably below a Convex document limit. */
export declare const MAX_BOOKING_EMAIL_BYTES: number;
export declare const MAX_BOOKING_EMAIL_SUBJECT_LENGTH = 200;
/** Defense at the component boundary, even when the host omits return validators. */
export declare function assertValidRenderedBookingEmail(value: unknown): asserts value is Exclude<RenderedBookingEmail, null>;
//# sourceMappingURL=emails.d.ts.map