export declare const sendBookingConfirmation: import("convex/server").RegisteredMutation<"internal", {
    bookingUid?: string | undefined;
    resourceId?: string | undefined;
    baseUrl?: string | undefined;
    renderer?: string | undefined;
    managementToken?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    to: string;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
export declare const sendBookingPending: import("convex/server").RegisteredMutation<"internal", {
    bookingUid?: string | undefined;
    baseUrl?: string | undefined;
    renderer?: string | undefined;
    managementToken?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    to: string;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
export declare const sendBookingApproved: import("convex/server").RegisteredMutation<"internal", {
    bookingUid?: string | undefined;
    baseUrl?: string | undefined;
    renderer?: string | undefined;
    managementToken?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    to: string;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
export declare const sendBookingDeclined: import("convex/server").RegisteredMutation<"internal", {
    reason?: string | undefined;
    renderer?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    to: string;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
export declare const sendBookingCancellation: import("convex/server").RegisteredMutation<"internal", {
    reason?: string | undefined;
    renderer?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    to: string;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
export declare const sendBookingRescheduled: import("convex/server").RegisteredMutation<"internal", {
    bookingUid?: string | undefined;
    baseUrl?: string | undefined;
    renderer?: string | undefined;
    managementToken?: string | undefined;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    bookerName: string;
    eventTitle: string;
    timezone: string;
    newEnd: number;
    newStart: number;
    to: string;
    oldStart: number;
    oldEnd: number;
}, Promise<{
    success: boolean;
    error: string;
    emailId?: undefined;
} | {
    success: boolean;
    emailId: import("@convex-dev/resend").EmailId;
    error?: undefined;
}>>;
//# sourceMappingURL=mutations.d.ts.map