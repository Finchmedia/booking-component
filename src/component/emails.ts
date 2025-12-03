import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";

// Initialize Resend with nested component
const resend = new Resend(components.resend, {
    testMode: false, // Set to false for production
});

// ============================================
// EMAIL TEMPLATES (HTML)
// ============================================

function generateBookingConfirmationHTML(details: {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    resourceId?: string;
}): string {
    const startDate = new Date(details.start);
    const endDate = new Date(details.end);

    const formatOptions: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: details.timezone,
        timeZoneName: "short",
    };

    const formattedStart = startDate.toLocaleString("en-US", formatOptions);
    const formattedEnd = endDate.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: details.timezone,
        timeZoneName: "short",
    });

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✓ Booking Confirmed</h1>
    </div>

    <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hi ${details.bookerName},</p>

        <p style="font-size: 16px;">Your booking has been confirmed! Here are the details:</p>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">${details.eventTitle}</h2>
            <p style="margin: 5px 0; color: #666;">
                <strong>When:</strong> ${formattedStart} - ${formattedEnd}
            </p>
        </div>

        <p style="font-size: 14px; color: #666;">
            If you need to make changes to your booking, please contact us.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; text-align: center;">
            This email was sent by the Booking System
        </p>
    </div>
</body>
</html>
    `.trim();
}

function generateBookingCancellationHTML(details: {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    reason?: string;
}): string {
    const startDate = new Date(details.start);

    const formatOptions: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: details.timezone,
        timeZoneName: "short",
    };

    const formattedStart = startDate.toLocaleString("en-US", formatOptions);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Cancelled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #dc3545; padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✕ Booking Cancelled</h1>
    </div>

    <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hi ${details.bookerName},</p>

        <p style="font-size: 16px;">Your booking has been cancelled.</p>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">${details.eventTitle}</h2>
            <p style="margin: 5px 0; color: #666;">
                <strong>Was scheduled for:</strong> ${formattedStart}
            </p>
            ${details.reason ? `<p style="margin: 5px 0; color: #666;"><strong>Reason:</strong> ${details.reason}</p>` : ""}
        </div>

        <p style="font-size: 14px; color: #666;">
            If you'd like to book again, please visit our booking page.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; text-align: center;">
            This email was sent by the Booking System
        </p>
    </div>
</body>
</html>
    `.trim();
}

// ============================================
// EMAIL SENDING MUTATIONS
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
    },
    handler: async (ctx, args) => {
        const fromAddress = args.from ?? "bookings@example.com";

        const html = generateBookingConfirmationHTML({
            bookerName: args.bookerName,
            eventTitle: args.eventTitle,
            start: args.start,
            end: args.end,
            timezone: args.timezone,
            resourceId: args.resourceId,
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
        } catch (error) {
            console.error(`[emails] Failed to send confirmation to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});

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
    },
    handler: async (ctx, args) => {
        const fromAddress = args.from ?? "bookings@example.com";

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
        } catch (error) {
            console.error(`[emails] Failed to send cancellation to ${args.to}:`, error);
            return { success: false, error: String(error) };
        }
    },
});
