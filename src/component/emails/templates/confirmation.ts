// ============================================
// BOOKING CONFIRMATION EMAIL TEMPLATE
// ============================================

import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES, BUTTON_STYLES, SECONDARY_BUTTON_STYLES } from "../styles.js";

export interface BookingConfirmationDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    resourceId?: string;
    bookingUid?: string;
    managementToken?: string;
    baseUrl?: string;
}

export function generateBookingConfirmationHTML(details: BookingConfirmationDetails): string {
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

    // Generate management URLs if available
    const managementUrl = details.bookingUid && details.managementToken && details.baseUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const rescheduleUrl = managementUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}/reschedule?token=${encodeURIComponent(details.managementToken!)}`
        : null;
    const cancelUrl = managementUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}/cancel?token=${encodeURIComponent(details.managementToken!)}`
        : null;

    const iconStyles = ICON_STYLES.success;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Confirmed</title>
    <style>
        ${EMAIL_BASE_STYLES}
        .icon-circle {
            background-color: ${iconStyles.dark.circleBackground};
        }
        .icon {
            color: ${iconStyles.dark.iconColor};
        }
        ${EMAIL_LIGHT_MODE_STYLES}
        @media (prefers-color-scheme: light) {
            .icon-circle {
                background-color: ${iconStyles.light.circleBackground};
            }
            .icon {
                color: ${iconStyles.light.iconColor};
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

            ${managementUrl ? `
            <div style="text-align: center; margin: 24px 0;">
                <a href="${managementUrl}" style="${BUTTON_STYLES.viewBooking}">
                    View Booking
                </a>
            </div>
            <div style="text-align: center; margin: 16px 0;">
                <a href="${rescheduleUrl}" style="${SECONDARY_BUTTON_STYLES.primary}">Reschedule</a>
                <span style="display: inline-block; width: 12px;"></span>
                <a href="${cancelUrl}" style="${SECONDARY_BUTTON_STYLES.outlined}">Cancel Booking</a>
            </div>
            ` : `<p class="help-text">If you need to make changes to your booking, please contact us.</p>`}
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}
