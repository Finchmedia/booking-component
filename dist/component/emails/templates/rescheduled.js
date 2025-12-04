// ============================================
// BOOKING RESCHEDULED EMAIL TEMPLATE
// ============================================
import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES, BUTTON_STYLES, SECONDARY_BUTTON_STYLES } from "../styles.js";
import { formatDate, formatTime, formatDuration } from "../helpers.js";
export function generateBookingRescheduledHTML(details) {
    const oldDate = formatDate(details.oldStart, details.timezone);
    const oldTime = formatTime(details.oldStart, details.timezone);
    const oldEndTime = formatTime(details.oldEnd, details.timezone);
    const newDate = formatDate(details.newStart, details.timezone);
    const newTime = formatTime(details.newStart, details.timezone);
    const newEndTime = formatTime(details.newEnd, details.timezone);
    const duration = formatDuration(details.newEnd - details.newStart);
    // Generate management URLs if available
    const managementUrl = details.bookingUid && details.managementToken && details.baseUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const rescheduleUrl = managementUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}/reschedule?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const cancelUrl = managementUrl
        ? `${details.baseUrl}/book/booking/${details.bookingUid}/cancel?token=${encodeURIComponent(details.managementToken)}`
        : null;
    const iconStyles = ICON_STYLES.info;
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Rescheduled</title>
    <style>
        ${EMAIL_BASE_STYLES}
        .icon-circle {
            background-color: ${iconStyles.dark.circleBackground};
        }
        .icon {
            color: ${iconStyles.dark.iconColor};
        }
        .details-card {
            margin-bottom: 12px;
        }
        .event-title {
            margin: 0 0 16px 0;
        }
        .arrow {
            display: inline-block;
            margin: 0 8px;
            color: #3b82f6;
            font-size: 18px;
        }
        ${EMAIL_LIGHT_MODE_STYLES}
        @media (prefers-color-scheme: light) {
            .icon-circle {
                background-color: ${iconStyles.light.circleBackground};
            }
            .icon {
                color: ${iconStyles.light.iconColor};
            }
            .arrow {
                color: #2563eb;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon-circle">
                <span class="icon">&#8634;</span>
            </div>
            <h1 class="title">Booking Rescheduled</h1>
        </div>

        <div class="content">
            <p class="greeting">Hi ${details.bookerName},</p>

            <p class="subtitle">Your booking has been rescheduled to a new time:</p>

            <div class="details-card">
                <h2 class="event-title">${details.eventTitle}</h2>

                <div class="time-section">
                    <p class="time-label">Changed from:</p>
                    <p class="time-value old">${oldDate}</p>
                    <p class="time-value old">${oldTime} - ${oldEndTime}</p>
                </div>

                <div class="time-section">
                    <p class="time-label">New time:</p>
                    <p class="time-value">${newDate}</p>
                    <p class="time-value">${newTime} - ${newEndTime}</p>
                </div>
            </div>

            ${managementUrl ? `
            <div style="text-align: center; margin: 24px 0;">
                <a href="${managementUrl}" style="${BUTTON_STYLES.viewBooking}">
                    View Booking
                </a>
            </div>
            <div style="text-align: center; margin: 16px 0;">
                <a href="${rescheduleUrl}" style="${SECONDARY_BUTTON_STYLES.primary}">Reschedule Again</a>
                <span style="display: inline-block; width: 12px;"></span>
                <a href="${cancelUrl}" style="${SECONDARY_BUTTON_STYLES.outlined}">Cancel Booking</a>
            </div>
            <p class="help-text">Duration: ${duration}</p>
            ` : `<p class="help-text">Duration: ${duration}. If you need to make further changes, please contact us.</p>`}
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}
//# sourceMappingURL=rescheduled.js.map