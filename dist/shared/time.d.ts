/** A real calendar day in canonical form: 4-digit year, 2-digit month and day. */
export type CivilDate = string & {
    readonly __civilDate: true;
};
/**
 * Parses a calendar day and returns it in canonical form. One- or two-digit
 * months and days are accepted and padded ("2027-3-9" → "2027-03-09"). A day
 * that does not exist ("2027-02-30", "2027-13-01") or any other format throws,
 * instead of rolling over to another day the way `Date` parsing does.
 */
export declare function parseCivilDate(value: string): CivilDate;
/** Day of the week of a calendar day (0 = Sunday … 6 = Saturday), independent of any zone. */
export declare function weekdayOf(date: CivilDate): number;
//# sourceMappingURL=time.d.ts.map