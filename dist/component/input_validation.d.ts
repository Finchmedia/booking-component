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
//# sourceMappingURL=input_validation.d.ts.map