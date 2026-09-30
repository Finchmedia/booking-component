// ============================================
// EMAIL HELPER FUNCTIONS
// ============================================

import { MAX_BOOKING_EMAIL_SUBJECT_LENGTH } from "../../emails.js";

export function formatDate(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
    });
}

export function formatTime(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
        timeZoneName: "short",
    });
}

export function formatDuration(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
        return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? "s" : ""}`;
    } else {
        return `${hours} hour${hours !== 1 ? "s" : ""} ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
    }
}

export function formatDateTimeFull(timestamp: number, timezone: string): string {
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

export function formatTimeShort(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
        timeZoneName: "short",
    });
}

/** Built-in subjects follow the renderer rules: one line, at most 200 UTF-16 code units. */
export function defaultSubject(subject: string): string {
    const line = subject.replace(/[\r\n\0]+/g, " ").trim();
    if (line.length <= MAX_BOOKING_EMAIL_SUBJECT_LENGTH) return line;
    const cut = line.slice(0, MAX_BOOKING_EMAIL_SUBJECT_LENGTH);
    // Do not end on half of a surrogate pair.
    return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}
