export declare const sendBookingConfirmation: import("convex/server").RegisteredMutation<"internal", {
    resourceId?: string | undefined;
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
//# sourceMappingURL=emails.d.ts.map