// Format date for display (e.g. "Friday, November 22, 2024")
export const formatDate = (dateStr, timezone, locale = "en-US") => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: timezone,
    });
};
// Format time for display (e.g. "9:30 AM")
export const formatTimeDisplay = (timeStr, format, timezone, locale = "en-US") => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString(locale, {
        hour: format === "24h" ? "2-digit" : "numeric",
        minute: "2-digit",
        hour12: format === "12h",
        timeZone: timezone,
    });
};
// Format duration (e.g. "30m" or "1h 30m")
export const formatDuration = (milliseconds) => {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours === 0)
        return `${remainingMinutes}min`;
    if (remainingMinutes === 0)
        return `${hours}h`;
    return `${hours}h ${remainingMinutes}min`;
};
// Format full date time; without a time format the locale's convention applies
export const formatDateTime = (timestamp, timezone, timeFormat, locale = "en-US") => {
    const date = new Date(timestamp);
    return date.toLocaleString(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: timeFormat === "24h" ? "2-digit" : "numeric",
        minute: "2-digit",
        hour12: timeFormat ? timeFormat === "12h" : undefined,
        timeZone: timezone,
    });
};
//# sourceMappingURL=formatting.js.map