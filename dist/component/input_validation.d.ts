import type { CivilDate } from "../shared/time.js";
/** An event length must be a finite number of minutes greater than zero. */
export declare function assertEventLength(eventLength: number): void;
/** Slot indices address the 96 quarter hours of a day: integers 0–95. */
export declare function assertSlotIndices(slots: number[]): void;
/** A date range must not end before it starts. */
export declare function assertDateOrder(dateFrom: CivilDate, dateTo: CivilDate): void;
/** True when Intl accepts `timeZone` (IANA names such as "Europe/Berlin" or "UTC"). */
export declare function isValidTimeZone(timeZone: string): boolean;
/**
 * Rejects a time zone that Intl does not accept. Every schedule-aware
 * availability read that uses such a zone would throw.
 */
export declare function assertTimeZone(timeZone: string): void;
/** Most calendar days one getMonthAvailability call answers, dateFrom and dateTo included. */
export declare const MAX_MONTH_RANGE_DAYS = 93;
/** Longest getAvailability range: 366 days. Booking writes have no such cap. */
export declare const MAX_AVAILABILITY_RANGE_MS: number;
/** Rejects a range of calendar days longer than `maxDays` (both ends included). */
export declare function assertDateRangeLength(dateFrom: CivilDate, dateTo: CivilDate, maxDays: number): void;
/** Rejects a getAvailability range longer than MAX_AVAILABILITY_RANGE_MS. */
export declare function assertAvailabilityRangeLength(start: number, end: number): void;
/** Lengths, length options and the slot interval: whole minutes greater than 0. */
export declare function isWholePositiveMinutes(value: number): boolean;
/** Buffers and notice: a finite number of minutes, 0 or more. */
export declare function isNonNegativeMinutes(value: number): boolean;
/** The booking horizon (maxFutureMinutes): a finite number of minutes greater than 0. */
export declare function isPositiveMinutes(value: number): boolean;
/** A length that non-empty options do not include. */
export declare function isLengthOutsideOptions(lengthInMinutes: number, options: number[] | undefined): boolean;
/** The numeric event-type settings of a write; `undefined` and `null` (a clear) are not checked. */
export type EventTypeNumbers = {
    lengthInMinutes?: number;
    lengthInMinutesOptions?: number[];
    slotInterval?: number;
    bufferBefore?: number | null;
    bufferAfter?: number | null;
    minNoticeMinutes?: number | null;
    maxFutureMinutes?: number | null;
};
/** Checks each numeric setting a write gives (INVALID_INPUT). */
export declare function assertEventTypeNumbers(fields: EventTypeNumbers): void;
/**
 * The length must be one of the length options when there are any. Checked
 * on the configuration a write leaves behind (the given fields merged over
 * the stored ones), and only by writes that give either field, so a row
 * stored before 0.5.0 that breaks it can still change its other settings.
 */
export declare function assertLengthInOptions(lengthInMinutes: number, options: number[] | undefined): void;
/**
 * A new booking's zone and booker address (N4, N5): a time zone Intl
 * accepts, and an address that passes the syntax screen of the built-in
 * mail (isSendableAddress). Whether the address belongs to the booker stays
 * host policy. The address is not repeated in the error.
 */
export declare function assertBookingDetails(details: {
    timezone: string;
    booker: {
        email: string;
    };
}): void;
//# sourceMappingURL=input_validation.d.ts.map