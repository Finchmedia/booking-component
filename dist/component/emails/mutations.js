// ============================================
// EMAIL SENDING MUTATIONS
// ============================================
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Resend } from "@convex-dev/resend";
import { components } from "../_generated/api";
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
        const html = generateBookingConfirmationHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            resourceId: args.resourceId,
            bookingUid: args.bookingUid,
            managementToken: args.managementToken,
            baseUrl: args.baseUrl,
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Confirmed: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Confirmation sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send confirmation to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
// ============================================
// BOOKING PENDING
// ============================================
export const sendBookingPending = internalMutation({
    args: {
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
        const html = generateBookingPendingHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            managementToken: args.managementToken,
            baseUrl: args.baseUrl,
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Request Received: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Pending notification sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send pending notification to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
// ============================================
// BOOKING APPROVED
// ============================================
export const sendBookingApproved = internalMutation({
    args: {
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
        const html = generateBookingApprovedHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            bookingUid: args.bookingUid,
            managementToken: args.managementToken,
            baseUrl: args.baseUrl,
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Approved: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Approved notification sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send approved notification to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
// ============================================
// BOOKING DECLINED
// ============================================
export const sendBookingDeclined = internalMutation({
    args: {
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
        const html = generateBookingDeclinedHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            reason: args.reason,
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Request Declined: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Declined notification sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send declined notification to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
// ============================================
// BOOKING CANCELLATION
// ============================================
export const sendBookingCancellation = internalMutation({
    args: {
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
        const html = generateBookingCancellationHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            reason: args.reason,
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Cancelled: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Cancellation sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send cancellation to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
// ============================================
// BOOKING RESCHEDULED
// ============================================
export const sendBookingRescheduled = internalMutation({
    args: {
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
        const html = generateBookingRescheduledHTML({
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
        });
        try {
            const emailId = await resend.sendEmail(ctx, {
                from: fromAddress,
                to: args.to,
                subject: `Booking Rescheduled: ${args.eventTitle}`,
                html,
            });
            console.log(`[emails] Rescheduled notification sent to ${args.to}, emailId: ${emailId}`);
            return { success: true, emailId };
        }
        catch (error) {
            console.error(`[emails] Failed to send rescheduled notification to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
//# sourceMappingURL=mutations.js.map