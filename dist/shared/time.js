// ============================================
// CIVIL DATES
// ============================================
//
// Pure helpers for calendar days ("YYYY-MM-DD" without a zone). No Convex
// server imports, so the component and the React package can both use them.
import { throwBookingError } from "./booking-errors.js";
const CIVIL_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
/**
 * Parses a calendar day and returns it in canonical form. One- or two-digit
 * months and days are accepted and padded ("2027-3-9" → "2027-03-09"). A day
 * that does not exist ("2027-02-30", "2027-13-01") or any other format throws
 * INVALID_INPUT, instead of rolling over to another day the way `Date`
 * parsing does.
 */
export function parseCivilDate(value) {
    const match = CIVIL_DATE_RE.exec(value);
    if (match) {
        const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
        // setUTCFullYear, unlike Date.UTC, keeps years 0–99 as written.
        const roundTrip = new Date(new Date(0).setUTCFullYear(year, month - 1, day));
        if (roundTrip.getUTCFullYear() === year &&
            roundTrip.getUTCMonth() === month - 1 &&
            roundTrip.getUTCDate() === day) {
            return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
    }
    throwBookingError("INVALID_INPUT", `Invalid date "${value}": expected a calendar date as YYYY-MM-DD`);
}
/** Day of the week of a calendar day (0 = Sunday … 6 = Saturday), independent of any zone. */
export function weekdayOf(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(new Date(0).setUTCFullYear(year, month - 1, day)).getUTCDay();
}
//# sourceMappingURL=time.js.map