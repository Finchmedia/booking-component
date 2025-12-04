// ============================================
// BOOKING DECLINED EMAIL TEMPLATE
// ============================================
import { EMAIL_BASE_STYLES, EMAIL_LIGHT_MODE_STYLES, ICON_STYLES } from "../styles.js";
export function generateBookingDeclinedHTML(details) {
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
    const iconStyles = ICON_STYLES.error;
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>Booking Request Declined</title>
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
                ${details.reason ? `<p class="reason">Reason: ${details.reason}</p>` : ""}
            </div>

            <p class="help-text">If you'd like to try booking a different time, please visit our booking page.</p>
        </div>

        <div class="footer">
            <p class="footer-text">This email was sent by the Booking System</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}
//# sourceMappingURL=declined.js.map