// ============================================
// BOOKING DECLINED EMAIL TEMPLATE
// ============================================

import { formatDateTimeFull } from "../helpers.js";
import { html, raw } from "../html.js";
import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES } from "../styles.js";

export interface BookingDeclinedDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    reason?: string;
}

export function generateBookingDeclinedHTML(details: BookingDeclinedDetails): string {
    const formattedStart = formatDateTimeFull(details.start, details.timezone);

    const iconStyles = ICON_STYLES.error;

    return html`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Request Declined</title>
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
                <span class="icon">&#10005;</span>
            </div>
            <h1 class="title">Booking Request Declined</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Unfortunately, your booking request could not be approved at this time.</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>
                <p class="event-time">Requested for: ${formattedStart}</p>
                ${details.reason ? html`<p class="reason">Reason: ${details.reason}</p>` : ""}
            </div>

            <p class="help-text">If you'd like to try booking a different time, please visit our booking page.</p>
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.toString().trim();
}
