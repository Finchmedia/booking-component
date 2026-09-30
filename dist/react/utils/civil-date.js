/**
 * Civil dates: calendar days as "YYYY-MM-DD" strings, with no time and no
 * zone. A calendar cell, its label, the day it queries and its heading are one
 * civil date, whatever zone the browser runs in.
 *
 * Components still pass days around as Dates. Such a Date is a carrier: its
 * local calendar fields (getFullYear, getMonth, getDate) name the day, and
 * toLocalMidnight creates one.
 */
const DAY_MS = 86_400_000;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Days since 1970-01-01 of a civil date, or NaN if it is not a real date. */
function toDayNumber(date) {
    const match = CIVIL_DATE.exec(date);
    if (!match)
        return NaN;
    const [year, month, day] = match.slice(1).map(Number);
    const ms = Date.UTC(year, month - 1, day);
    // Date.UTC rolls over (2027-02-30 is 2027-03-02); a real date survives the round trip
    return new Date(ms).toISOString().slice(0, 10) === date ? ms / DAY_MS : NaN;
}
function fromDayNumber(dayNumber) {
    return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}
const pad = (value) => String(value).padStart(2, "0");
/** True for an existing calendar date written as "YYYY-MM-DD". */
export function isCivilDate(value) {
    return !Number.isNaN(toDayNumber(value));
}
/** The civil date `days` days after `date` (negative moves back). */
export function addDays(date, days) {
    const dayNumber = toDayNumber(date);
    if (Number.isNaN(dayNumber) || !Number.isInteger(days)) {
        throw new RangeError(`Invalid civil date arithmetic: ${date} + ${days}`);
    }
    return fromDayNumber(dayNumber + days);
}
/** The civil date of an instant in an IANA time zone. */
export function civilDateIn(instant, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(instant);
    const field = (type) => parts.find((part) => part.type === type)?.value;
    return `${field("year")}-${field("month")}-${field("day")}`;
}
/** Today's civil date in an IANA time zone. */
export function todayIn(timeZone) {
    return civilDateIn(Date.now(), timeZone);
}
/** The civil date a carrier Date names: its local calendar fields. */
export function fromLocalFields(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** A carrier Date for a civil date: local midnight, or the first local time of that day. */
export function toLocalMidnight(date) {
    if (!isCivilDate(date))
        throw new RangeError(`Invalid civil date: ${date}`);
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day);
}
/**
 * The 42 civil dates of a Monday-first month view, starting with the Monday on
 * or before the 1st.
 *
 * @param year - Full year, e.g. 2027
 * @param month - Month 1-12
 */
export function monthGrid(year, month) {
    const first = toDayNumber(`${String(year).padStart(4, "0")}-${pad(month)}-01`);
    if (Number.isNaN(first))
        throw new RangeError(`Invalid month: ${year}-${month}`);
    // 1970-01-01 was a Thursday: day number 0 has Monday-first index 3
    const start = first - ((first + 3) % 7 + 7) % 7;
    return Array.from({ length: 42 }, (_, i) => fromDayNumber(start + i));
}
//# sourceMappingURL=civil-date.js.map