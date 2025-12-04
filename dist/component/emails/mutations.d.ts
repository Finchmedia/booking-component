export declare const sendBookingConfirmation: import("convex/server").RegisteredMutation<"internal", {
    resourceId?: string | undefined;
    managementToken?: string | undefined;
    baseUrl?: string | undefined;
    from?: string | undefined;
    bookingUid?: string | undefined;
    resendApiKey?: string | undefined;
    resendFromEmail?: string | undefined;
    timezone: string;
    start: number;
    end: number;
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
    timezone: string;
    start: number;
    end: number;
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
    timezone: string;
    start: number;
    end: number;
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
    timezone: string;
    start: number;
    end: number;
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
    timezone: string;
    start: number;
    end: number;
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
    newStart: number;
    newEnd: number;
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