// ============================================
// BOOKING PENDING EMAIL TEMPLATE
// ============================================
import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES, SECONDARY_BUTTON_STYLES } from "../styles.js";
export function generateBookingPendingHTML(details) {
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
    // Generate management URL if available
    const managementUrl = details.bookingUid && details.managementToken && details.baseUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const cancelUrl = managementUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}/cancel?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const iconStyles = ICON_STYLES.warning;
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Request Received</title>
    <style>
        ${EMAIL_BASE_STYLES}
        .icon-circle {
            background-color: ${iconStyles.dark.circleBackground};
        }
        .icon {
            color: ${iconStyles.dark.iconColor};
        }
        .status-badge {
            background-color: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }
        ${EMAIL_LIGHT_MODE_STYLES}
        @media (prefers-color-scheme: light) {
            .icon-circle {
                background-color: ${iconStyles.light.circleBackground};
            }
            .icon {
                color: ${iconStyles.light.iconColor};
            }
            .status-badge {
                background-color: rgba(217, 119, 6, 0.15);
                color: #d97706;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon-circle">
                <span class="icon">&#9201;</span>
            </div>
            <h1 class="title">Booking Request Received</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Your booking request has been submitted and is awaiting confirmation from the host.</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>
                <p class="event-time">${formattedStart} - ${formattedEnd}</p>
                <span class="status-badge">Awaiting Confirmation</span>
            </div>

            ${managementUrl ? `
            <div style="text-align: center; margin: 24px 0;">
                <a href="${managementUrl}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
                    View Booking Status
                </a>
            </div>
            <div style="text-align: center; margin: 16px 0;">
                <a href="${cancelUrl}" style="${SECONDARY_BUTTON_STYLES.outlined}">Cancel Request</a>
            </div>
            <p class="help-text">You'll receive another email once your booking is confirmed or if there are any updates.</p>
            ` : `<p class="help-text">You'll receive another email once your booking is confirmed or if there are any updates.</p>`}
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}
//# sourceMappingURL=pending.js.map