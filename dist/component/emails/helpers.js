// ============================================
// EMAIL HELPER FUNCTIONS
// ============================================
import { MAX_BOOKING_EMAIL_SUBJECT_LENGTH } from "../../emails.js";
/**
 * Stored zones are not validated on every write path. An invalid, empty or
 * missing zone must not fail the notification, so it renders in UTC instead;
 * formats with a zone name then label the times "UTC".
 */
function formatInZone(timestamp, timezone, options) {
    const date = new Date(timestamp);
    if (timezone) {
        try {
            return date.toLocaleString("en-US", { ...options, timeZone: timezone });
        }
        catch (error) {
            if (!(error instanceof RangeError))
                throw error;
        }
    }
    return date.toLocaleString("en-US", { ...options, timeZone: "UTC" });
}
export function formatDate(timestamp, timezone) {
    return formatInZone(timestamp, timezone, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}
export function formatTime(timestamp, timezone) {
    return formatInZone(timestamp, timezone, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    });
}
export function formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours === 0) {
        return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    else if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    else {
        return `${hours} hour${hours !== 1 ? "s" : ""} ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
    }
}
export function formatDateTimeFull(timestamp, timezone) {
    return formatInZone(timestamp, timezone, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    });
}
export function formatTimeShort(timestamp, timezone) {
    return formatInZone(timestamp, timezone, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    });
}
/** Built-in subjects follow the renderer rules: one line, at most 200 UTF-16 code units. */
export function defaultSubject(subject) {
    const line = subject.replace(/[\r\n\0]+/g, " ").trim();
    if (line.length <= MAX_BOOKING_EMAIL_SUBJECT_LENGTH)
        return line;
    const cut = line.slice(0, MAX_BOOKING_EMAIL_SUBJECT_LENGTH);
    // Do not end on half of a surrogate pair.
    return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}
//# sourceMappingURL=helpers.js.map