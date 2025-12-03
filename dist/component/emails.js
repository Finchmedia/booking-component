import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";
// Resend client is created inside handlers with API key from args
// (Components cannot access process.env - must be passed from main app)
// ============================================
// EMAIL TEMPLATES (HTML)
// ============================================
function generateBookingConfirmationHTML(details) {
    const startDate = new Date(details.start);
    const endDate = new Date(details.end);
    const formatOptions = {
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
    <meta name="color-scheme" content="dark light">
    <title>Booking Confirmed</title>
    <style>
        :root {
            color-scheme: dark light;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #fafafa;
        }
        .card {
            background-color: #262626;
            border-radius: 8px;
            border: 1px solid #404040;
            overflow: hidden;
        }
        .header {
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #404040;
        }
        .icon-circle {
            display: inline-block;
            width: 48px;
            height: 48px;
            background-color: rgba(34, 197, 94, 0.1);
            border-radius: 50%;
            line-height: 48px;
            margin-bottom: 16px;
        }
        .icon {
            color: #22c55e;
            font-size: 24px;
        }
        .title {
            color: #fafafa;
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 24px;
        }
        .greeting {
            font-size: 16px;
            color: #fafafa;
            margin: 0 0 16px 0;
        }
        .subtitle {
            font-size: 14px;
            color: #a1a1aa;
            margin: 0 0 20px 0;
        }
        .details-card {
            background-color: #3a3a3a;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #404040;
            margin-bottom: 20px;
        }
        .event-title {
            margin: 0 0 12px 0;
            color: #fafafa;
            font-size: 16px;
            font-weight: 600;
        }
        .event-time {
            margin: 0;
            color: #a1a1aa;
            font-size: 14px;
        }
        .help-text {
            font-size: 13px;
            color: #a1a1aa;
            margin: 0;
        }
        .footer {
            padding: 16px 24px;
            border-top: 1px solid #404040;
            text-align: center;
        }
        .footer-text {
            font-size: 12px;
            color: #737373;
            margin: 0;
        }
        @media (prefers-color-scheme: light) {
            body {
                background-color: #ffffff;
                color: #1a1a1a;
            }
            .card {
                background-color: #f5f5f5;
                border-color: #e5e5e5;
            }
            .header {
                border-bottom-color: #e5e5e5;
            }
            .icon-circle {
                background-color: rgba(22, 163, 74, 0.15);
            }
            .icon {
                color: #16a34a;
            }
            .title {
                color: #1a1a1a;
            }
            .greeting {
                color: #1a1a1a;
            }
            .subtitle {
                color: #737373;
            }
            .details-card {
                background-color: #e5e5e5;
                border-color: #e5e5e5;
            }
            .event-title {
                color: #1a1a1a;
            }
            .event-time {
                color: #737373;
            }
            .help-text {
                color: #737373;
            }
            .footer {
                border-top-color: #e5e5e5;
            }
            .footer-text {
                color: #a1a1aa;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon-circle">
                <span class="icon">&#10003;</span>
            </div>
            <h1 class="title">Booking Confirmed</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Your booking has been confirmed. Here are the details:</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>
                <p class="event-time">${formattedStart} - ${formattedEnd}</p>
            </div>

            <p class="help-text">If you need to make changes to your booking, please contact us.</p>
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}
function generateBookingCancellationHTML(details) {
    const startDate = new Date(details.start);
    const formatOptions = {
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
    <meta name="color-scheme" content="dark light">
    <title>Booking Cancelled</title>
    <style>
        :root {
            color-scheme: dark light;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #fafafa;
        }
        .card {
            background-color: #262626;
            border-radius: 8px;
            border: 1px solid #404040;
            overflow: hidden;
        }
        .header {
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #404040;
        }
        .icon-circle {
            display: inline-block;
            width: 48px;
            height: 48px;
            background-color: rgba(239, 68, 68, 0.1);
            border-radius: 50%;
            line-height: 48px;
            margin-bottom: 16px;
        }
        .icon {
            color: #ef4444;
            font-size: 24px;
        }
        .title {
            color: #fafafa;
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 24px;
        }
        .greeting {
            font-size: 16px;
            color: #fafafa;
            margin: 0 0 16px 0;
        }
        .subtitle {
            font-size: 14px;
            color: #a1a1aa;
            margin: 0 0 20px 0;
        }
        .details-card {
            background-color: #3a3a3a;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #404040;
            margin-bottom: 20px;
        }
        .event-title {
            margin: 0 0 12px 0;
            color: #fafafa;
            font-size: 16px;
            font-weight: 600;
        }
        .event-time {
            margin: 0;
            color: #a1a1aa;
            font-size: 14px;
        }
        .reason {
            margin: 8px 0 0 0;
            color: #a1a1aa;
            font-size: 14px;
        }
        .help-text {
            font-size: 13px;
            color: #a1a1aa;
            margin: 0;
        }
        .footer {
            padding: 16px 24px;
            border-top: 1px solid #404040;
            text-align: center;
        }
        .footer-text {
            font-size: 12px;
            color: #737373;
            margin: 0;
        }
        @media (prefers-color-scheme: light) {
            body {
                background-color: #ffffff;
                color: #1a1a1a;
            }
            .card {
                background-color: #f5f5f5;
                border-color: #e5e5e5;
            }
            .header {
                border-bottom-color: #e5e5e5;
            }
            .icon-circle {
                background-color: rgba(220, 38, 38, 0.15);
            }
            .icon {
                color: #dc2626;
            }
            .title {
                color: #1a1a1a;
            }
            .greeting {
                color: #1a1a1a;
            }
            .subtitle {
                color: #737373;
            }
            .details-card {
                background-color: #e5e5e5;
                border-color: #e5e5e5;
            }
            .event-title {
                color: #1a1a1a;
            }
            .event-time {
                color: #737373;
            }
            .reason {
                color: #737373;
            }
            .help-text {
                color: #737373;
            }
            .footer {
                border-top-color: #e5e5e5;
            }
            .footer-text {
                color: #a1a1aa;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon-circle">
                <span class="icon">&#10005;</span>
            </div>
            <h1 class="title">Booking Cancelled</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Your booking has been cancelled.</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>
                <p class="event-time">Was scheduled for: ${formattedStart}</p>
                ${details.reason ? `<p class="reason">Reason: ${details.reason}</p>` : ""}
            </div>

            <p class="help-text">If you'd like to book again, please visit our booking page.</p>
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
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
//# sourceMappingURL=emails.js.map