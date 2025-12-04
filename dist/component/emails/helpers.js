// ============================================
// EMAIL HELPER FUNCTIONS
// ============================================
export function formatDate(timestamp, timezone) {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
    });
}
export function formatTime(timestamp, timezone) {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
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
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
        timeZoneName: "short",
    });
}
export function formatTimeShort(timestamp, timezone) {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
        timeZoneName: "short",
    });
}
//# sourceMappingURL=helpers.js.map