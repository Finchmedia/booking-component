// ============================================
// BOOKING APPROVED EMAIL TEMPLATE
// ============================================

import type { BookingEmailContext } from "../../../emails.js";
import { formatDateTimeFull, formatTimeShort } from "../helpers.js";
import { html, raw } from "../html.js";
import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES, BUTTON_STYLES, SECONDARY_BUTTON_STYLES } from "../styles.js";

export interface BookingApprovedDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    /** From bookingEmailLinks; without links the mail asks the guest to get in touch instead. */
    links?: BookingEmailContext["links"];
}

export function generateBookingApprovedHTML(details: BookingApprovedDetails): string {
    const formattedStart = formatDateTimeFull(details.start, details.timezone);
    const formattedEnd = formatTimeShort(details.end, details.timezone);
    const links = details.links;

    const iconStyles = ICON_STYLES.success;

    return html`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Approved</title>
    <style>
        ${raw(EMAIL_BASE_STYLES)}
        .icon-circle {
            background-color: ${raw(iconStyles.dark.circleBackground)};
        }
        .icon {
            color: ${raw(iconStyles.dark.iconColor)};
        }
        ${raw(EMAIL_LIGHT_MODE_STYLES)}
        @media (prefers-color-scheme: light) {
            .icon-circle {
                background-color: ${raw(iconStyles.light.circleBackground)};
            }
            .icon {
                color: ${raw(iconStyles.light.iconColor)};
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
            <h1 class="title">Booking Approved</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Great news! Your booking request has been approved. Here are the details:</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>
                <p class="event-time">${formattedStart} - ${formattedEnd}</p>
            </div>

            ${links ? html`
            <div style="text-align: center; margin: 24px 0;">
                <a href="${links.view}" style="${BUTTON_STYLES.viewBooking}">
                    View Booking
                </a>
            </div>
            <div style="text-align: center; margin: 16px 0;">
                <a href="${links.reschedule}" style="${SECONDARY_BUTTON_STYLES.primary}">Reschedule</a>
                <span style="display: inline-block; width: 12px;"></span>
                <a href="${links.cancel}" style="${SECONDARY_BUTTON_STYLES.outlined}">Cancel Booking</a>
            </div>
            ` : html`<p class="help-text">If you need to make changes to your booking, please contact us.</p>`}
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.toString().trim();
}
