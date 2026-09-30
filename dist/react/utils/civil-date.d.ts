/**
 * Civil dates: calendar days as "YYYY-MM-DD" strings, with no time and no
 * zone. A calendar cell, its label, the day it queries and its heading are one
 * civil date, whatever zone the browser runs in.
 *
 * Components still pass days around as Dates. Such a Date is a carrier: its
 * local calendar fields (getFullYear, getMonth, getDate) name the day, and
 * toLocalMidnight creates one.
 */
/** True for an existing calendar date written as "YYYY-MM-DD". */
export declare function isCivilDate(value: string): boolean;
/** The civil date `days` days after `date` (negative moves back). */
export declare function addDays(date: string, days: number): string;
/** The civil date of an instant in an IANA time zone. */
export declare function civilDateIn(instant: Date | number, timeZone: string): string;
/** Today's civil date in an IANA time zone. */
export declare function todayIn(timeZone: string): string;
/** The civil date a carrier Date names: its local calendar fields. */
export declare function fromLocalFields(date: Date): string;
/** A carrier Date for a civil date: local midnight, or the first local time of that day. */
export declare function toLocalMidnight(date: string): Date;
/**
 * The 42 civil dates of a Monday-first month view, starting with the Monday on
 * or before the 1st.
 *
 * @param year - Full year, e.g. 2027
 * @param month - Month 1-12
 */
export declare function monthGrid(year: number, month: number): string[];
//# sourceMappingURL=civil-date.d.ts.map