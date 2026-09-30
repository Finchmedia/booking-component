// ============================================
// INPUT VALIDATION
// ============================================
//
// Structural checks at the component boundary. The availability queries used
// to accept inputs without a meaning — a zero, negative or NaN event length,
// slot indices outside the day, dates like "2027-02-30" — and answered them
// with silent nonsense (candidates on fully booked days, another day's hours).
// They now fail fast with an "Invalid …" error (code INVALID_INPUT); calendar
// days are parsed with parseCivilDate (src/shared/time.ts). 0.5.0 adds range
// caps, event-type settings and new bookings' zone and booker address. Host
// policy (allowed durations, notice, horizon) stays in the host.
import { throwBookingError } from "../shared/booking-errors.js";
import { isSendableAddress } from "./emails/recipient.js";
/** An event length must be a finite number of minutes greater than zero. */
export function assertEventLength(eventLength) {
    if (!Number.isFinite(eventLength) || eventLength <= 0) {
        throwBookingError("INVALID_INPUT", `Invalid eventLength ${eventLength}: expected a positive number of minutes`);
    }
}
/** Slot indices address the 96 quarter hours of a day: integers 0–95. */
export function assertSlotIndices(slots) {
    for (const slot of slots) {
        if (!Number.isInteger(slot) || slot < 0 || slot > 95) {
            throwBookingError("INVALID_INPUT", `Invalid availableSlots index ${slot}: expected integers from 0 to 95`);
        }
    }
}
/** A date range must not end before it starts. */
export function assertDateOrder(dateFrom, dateTo) {
    // Canonical dates compare chronologically as strings.
    if (dateFrom > dateTo) {
        throwBookingError("INVALID_INPUT", `Invalid date range: dateFrom ${dateFrom} is after dateTo ${dateTo}`);
    }
}
// Only accepted zones are remembered, so rejected strings cannot grow the set.
const acceptedTimeZones = new Set();
/** True when Intl accepts `timeZone` (IANA names such as "Europe/Berlin" or "UTC"). */
export function isValidTimeZone(timeZone) {
    if (acceptedTimeZones.has(timeZone))
        return true;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
    }
    catch {
        return false;
    }
    acceptedTimeZones.add(timeZone);
    return true;
}
/**
 * Rejects a time zone that Intl does not accept. Every schedule-aware
 * availability read that uses such a zone would throw.
 */
export function assertTimeZone(timeZone) {
    if (!isValidTimeZone(timeZone)) {
        throwBookingError("INVALID_INPUT", `Invalid time zone "${timeZone}": expected an IANA time zone such as "Europe/Berlin"`);
    }
}
// ============================================
// RANGE CAPS (0.5.0)
// ============================================
const DAY_MS = 24 * 60 * 60 * 1000;
/** Most calendar days one getMonthAvailability call answers, dateFrom and dateTo included. */
export const MAX_MONTH_RANGE_DAYS = 93;
/** Longest getAvailability range: 366 days. Booking writes have no such cap. */
export const MAX_AVAILABILITY_RANGE_MS = 366 * DAY_MS;
/** Rejects a range of calendar days longer than `maxDays` (both ends included). */
export function assertDateRangeLength(dateFrom, dateTo, maxDays) {
    const days = (Date.parse(`${dateTo}T00:00:00.000Z`) - Date.parse(`${dateFrom}T00:00:00.000Z`)) / DAY_MS + 1;
    if (days > maxDays) {
        throwBookingError("INVALID_INPUT", `Invalid date range: dateFrom ${dateFrom} to dateTo ${dateTo} covers ${days} days; at most ${maxDays} are allowed`);
    }
}
/** Rejects a getAvailability range longer than MAX_AVAILABILITY_RANGE_MS. */
export function assertAvailabilityRangeLength(start, end) {
    if (end - start > MAX_AVAILABILITY_RANGE_MS) {
        throwBookingError("INVALID_RANGE", "Invalid time range: at most 366 days are allowed");
    }
}
// ============================================
// EVENT-TYPE SETTINGS (0.5.0)
// ============================================
//
// Event-type writes used to store any number: a length of 0 or NaN, negative
// buffers, a length that is not among its own options. One predicate per rule,
// shared with the maintenance audit, which lists stored rows that break them.
// Reads stay tolerant of such rows.
/** Lengths, length options and the slot interval: whole minutes greater than 0. */
export function isWholePositiveMinutes(value) {
    return Number.isInteger(value) && value > 0;
}
/** Buffers and notice: a finite number of minutes, 0 or more. */
export function isNonNegativeMinutes(value) {
    return Number.isFinite(value) && value >= 0;
}
/** The booking horizon (maxFutureMinutes): a finite number of minutes greater than 0. */
export function isPositiveMinutes(value) {
    return Number.isFinite(value) && value > 0;
}
/** A length that non-empty options do not include. */
export function isLengthOutsideOptions(lengthInMinutes, options) {
    return options !== undefined && options.length > 0 && !options.includes(lengthInMinutes);
}
const WHOLE_MINUTES = "expected a whole number of minutes greater than 0";
/** Checks each numeric setting a write gives (INVALID_INPUT). */
export function assertEventTypeNumbers(fields) {
    if (fields.lengthInMinutes !== undefined && !isWholePositiveMinutes(fields.lengthInMinutes)) {
        throwBookingError("INVALID_INPUT", `Invalid lengthInMinutes ${fields.lengthInMinutes}: ${WHOLE_MINUTES}`);
    }
    for (const option of fields.lengthInMinutesOptions ?? []) {
        if (!isWholePositiveMinutes(option)) {
            throwBookingError("INVALID_INPUT", `Invalid lengthInMinutesOptions entry ${option}: ${WHOLE_MINUTES}`);
        }
    }
    if (fields.slotInterval !== undefined && !isWholePositiveMinutes(fields.slotInterval)) {
        throwBookingError("INVALID_INPUT", `Invalid slotInterval ${fields.slotInterval}: ${WHOLE_MINUTES}`);
    }
    for (const key of ["bufferBefore", "bufferAfter", "minNoticeMinutes"]) {
        const value = fields[key];
        if (value !== undefined && value !== null && !isNonNegativeMinutes(value)) {
            throwBookingError("INVALID_INPUT", `Invalid ${key} ${value}: expected a number of minutes of 0 or more`);
        }
    }
    const horizon = fields.maxFutureMinutes;
    if (horizon !== undefined && horizon !== null && !isPositiveMinutes(horizon)) {
        throwBookingError("INVALID_INPUT", `Invalid maxFutureMinutes ${horizon}: expected a number of minutes greater than 0`);
    }
}
/**
 * The length must be one of the length options when there are any. Checked
 * on the configuration a write leaves behind (the given fields merged over
 * the stored ones), and only by writes that give either field, so a row
 * stored before 0.5.0 that breaks it can still change its other settings.
 */
export function assertLengthInOptions(lengthInMinutes, options) {
    if (isLengthOutsideOptions(lengthInMinutes, options)) {
        throwBookingError("INVALID_INPUT", `Invalid lengthInMinutes ${lengthInMinutes}: expected one of lengthInMinutesOptions (${(options ?? []).join(", ")})`);
    }
}
// ============================================
// BOOKING DETAILS (0.5.0)
// ============================================
/**
 * A new booking's zone and booker address (N4, N5): a time zone Intl
 * accepts, and an address that passes the syntax screen of the built-in
 * mail (isSendableAddress). Whether the address belongs to the booker stays
 * host policy. The address is not repeated in the error.
 */
export function assertBookingDetails(details) {
    assertTimeZone(details.timezone);
    if (!isSendableAddress(details.booker.email)) {
        throwBookingError("INVALID_INPUT", "Invalid booker email: expected an address such as name@example.com");
    }
}
//# sourceMappingURL=input_validation.js.map