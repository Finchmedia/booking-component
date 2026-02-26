export declare const sendBookingConfirmation: import("convex/server").RegisteredMutation<"internal", {
    resourceId?: string | undefined;
    managementToken?: string | undefined;
    baseUrl?: string | undefined;
    from?: string | undefined;
    bookingUid?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    end: number;
    start: number;
    timezone: string;
    bookerName: string;
    eventTitle: string;
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
    managementToken?: string | undefined;
    baseUrl?: string | undefined;
    from?: string | undefined;
    bookingUid?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    end: number;
    start: number;
    timezone: string;
    bookerName: string;
    eventTitle: string;
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
    managementToken?: string | undefined;
    baseUrl?: string | undefined;
    from?: string | undefined;
    bookingUid?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    end: number;
    start: number;
    timezone: string;
    bookerName: string;
    eventTitle: string;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    end: number;
    start: number;
    timezone: string;
    bookerName: string;
    eventTitle: string;
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
    from?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    end: number;
    start: number;
    timezone: string;
    bookerName: string;
    eventTitle: string;
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
    managementToken?: string | undefined;
    baseUrl?: string | undefined;
    from?: string | undefined;
    bookingUid?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    timezone: string;
    newEnd: number;
    newStart: number;
    bookerName: string;
    eventTitle: string;
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