// ============================================
// EMAIL SENDING MUTATIONS
// ============================================
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Resend } from "@convex-dev/resend";
import { components } from "../_generated/api";
import { bookingEmailContextValidator } from "../../emails.js";
import { bookingEmailLinks } from "./context.js";
import { resolveBookingEmail } from "./renderer.js";
import { generateBookingConfirmationHTML } from "./templates/confirmation.js";
import { generateBookingPendingHTML } from "./templates/pending.js";
import { generateBookingApprovedHTML } from "./templates/approved.js";
import { generateBookingDeclinedHTML } from "./templates/declined.js";
import { generateBookingCancellationHTML } from "./templates/cancelled.js";
import { generateBookingRescheduledHTML } from "./templates/rescheduled.js";
// ============================================
// BOOKING CONFIRMATION
// ============================================
export const sendBookingConfirmation = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        resourceId: v.optional(v.string()),
        from: v.optional(v.string()),
        bookingUid: v.optional(v.string()),
        managementToken: v.optional(v.string()),
        baseUrl: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping confirmation email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "confirmed",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            links: bookingEmailLinks(args.bookingUid, args.managementToken, args.baseUrl),
            resourceId: args.resourceId,
        }, () => ({
            subject: `Booking Confirmed: ${args.eventTitle}`,
            html: generateBookingConfirmationHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                start: args.start,
                end: args.end,
                timezone: args.timezone,
                resourceId: args.resourceId,
                bookingUid: args.bookingUid,
                managementToken: args.managementToken,
                baseUrl: args.baseUrl,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] confirmed email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue confirmation email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
// ============================================
// BOOKING PENDING
// ============================================
export const sendBookingPending = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        from: v.optional(v.string()),
        bookingUid: v.optional(v.string()),
        managementToken: v.optional(v.string()),
        baseUrl: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping pending email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "pending",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            links: bookingEmailLinks(args.bookingUid, args.managementToken, args.baseUrl),
        }, () => ({
            subject: `Booking Request Received: ${args.eventTitle}`,
            html: generateBookingPendingHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                start: args.start,
                end: args.end,
                timezone: args.timezone,
                bookingUid: args.bookingUid,
                managementToken: args.managementToken,
                baseUrl: args.baseUrl,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] pending email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue pending email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
// ============================================
// BOOKING APPROVED
// ============================================
export const sendBookingApproved = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        from: v.optional(v.string()),
        bookingUid: v.optional(v.string()),
        managementToken: v.optional(v.string()),
        baseUrl: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping approved email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "approved",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            links: bookingEmailLinks(args.bookingUid, args.managementToken, args.baseUrl),
        }, () => ({
            subject: `Booking Approved: ${args.eventTitle}`,
            html: generateBookingApprovedHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                start: args.start,
                end: args.end,
                timezone: args.timezone,
                bookingUid: args.bookingUid,
                managementToken: args.managementToken,
                baseUrl: args.baseUrl,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] approved email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue approved email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
// ============================================
// BOOKING DECLINED
// ============================================
export const sendBookingDeclined = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        reason: v.optional(v.string()),
        from: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping declined email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "declined",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            reason: args.reason,
        }, () => ({
            subject: `Booking Request Declined: ${args.eventTitle}`,
            html: generateBookingDeclinedHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                start: args.start,
                end: args.end,
                timezone: args.timezone,
                reason: args.reason,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] declined email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue declined email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
// ============================================
// BOOKING CANCELLATION
// ============================================
export const sendBookingCancellation = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        start: v.number(),
        end: v.number(),
        timezone: v.string(),
        reason: v.optional(v.string()),
        from: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping cancellation email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "cancelled",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            reason: args.reason,
        }, () => ({
            subject: `Booking Cancelled: ${args.eventTitle}`,
            html: generateBookingCancellationHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                start: args.start,
                end: args.end,
                timezone: args.timezone,
                reason: args.reason,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] cancelled email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue cancellation email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
// ============================================
// BOOKING RESCHEDULED
// ============================================
export const sendBookingRescheduled = internalMutation({
    args: {
        renderer: v.optional(v.string()),
        emailContext: v.optional(bookingEmailContextValidator),
        to: v.string(),
        bookerName: v.string(),
        eventTitle: v.string(),
        oldStart: v.number(),
        oldEnd: v.number(),
        newStart: v.number(),
        newEnd: v.number(),
        timezone: v.string(),
        from: v.optional(v.string()),
        bookingUid: v.optional(v.string()),
        managementToken: v.optional(v.string()),
        baseUrl: v.optional(v.string()),
        // Resend config passed from main app (components can't access process.env)
        resendApiKey: v.optional(v.string()),
        resendFromEmail: v.optional(v.string()),
    },
    returns: v.object({
        success: v.boolean(),
        emailId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        // Skip if no API key provided
        if (!args.resendApiKey) {
            console.warn("[emails] No resendApiKey provided, skipping rescheduled email");
            return { success: false, error: "No API key provided" };
        }
        // Create Resend client with API key from args
        const resend = new Resend(components.resend, {
            apiKey: args.resendApiKey,
            testMode: false,
        });
        const fromAddress = args.from ?? args.resendFromEmail ?? "bookings@example.com";
        const content = await resolveBookingEmail(ctx, args.renderer, args.emailContext ?? {
            version: 1,
            kind: "rescheduled",
            bookerName: args.bookerName,
            bookerEmail: args.to,
            eventTitle: args.eventTitle,
            start: args.newStart,
            end: args.newEnd,
            previousStart: args.oldStart,
            previousEnd: args.oldEnd,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            links: bookingEmailLinks(args.bookingUid, args.managementToken, args.baseUrl),
        }, () => ({
            subject: `Booking Rescheduled: ${args.eventTitle}`,
            html: generateBookingRescheduledHTML({
                bookerName: args.bookerName,
                eventTitle: args.eventTitle,
                oldStart: args.oldStart,
                oldEnd: args.oldEnd,
                newStart: args.newStart,
                newEnd: args.newEnd,
                timezone: args.timezone,
                bookingUid: args.bookingUid,
                managementToken: args.managementToken,
                baseUrl: args.baseUrl,
            }),
        }));
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                ...content,
                ...(args.emailContext?.notificationId
                    ? { idempotencyKey: args.emailContext.notificationId }
                    : {}),
            });
            console.log("[emails] rescheduled email enqueued");
            return { success: true, emailId };
        }
        catch {
            console.error("[emails] Failed to enqueue rescheduled email");
            return { success: false, error: "Email enqueue failed" };
        }
    },
});
//# sourceMappingURL=mutations.js.map