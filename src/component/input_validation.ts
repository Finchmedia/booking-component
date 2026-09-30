// ============================================
// INPUT VALIDATION
// ============================================
//
// Structural checks at the component boundary. The availability queries used
// to accept inputs without a meaning — a zero, negative or NaN event length,
// slot indices outside the day, dates like "2027-02-30" — and answered them
// with silent nonsense (candidates on fully booked days, another day's hours).
// They now fail fast with an "Invalid …" error (code INVALID_INPUT); calendar
// days are parsed with parseCivilDate (src/shared/time.ts). 0.5.0 adds
// event-type settings. Host policy (allowed durations, notice, horizon)
// stays in the host.

import type { CivilDate } from "../shared/time.js";
import { throwBookingError } from "../shared/booking-errors.js";

/** An event length must be a finite number of minutes greater than zero. */
export function assertEventLength(eventLength: number): void {
  if (!Number.isFinite(eventLength) || eventLength <= 0) {
    throwBookingError("INVALID_INPUT", `Invalid eventLength ${eventLength}: expected a positive number of minutes`);
  }
}

/** Slot indices address the 96 quarter hours of a day: integers 0–95. */
export function assertSlotIndices(slots: number[]): void {
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 95) {
      throwBookingError("INVALID_INPUT", `Invalid availableSlots index ${slot}: expected integers from 0 to 95`);
    }
  }
}

/** A date range must not end before it starts. */
export function assertDateOrder(dateFrom: CivilDate, dateTo: CivilDate): void {
  // Canonical dates compare chronologically as strings.
  if (dateFrom > dateTo) {
    throwBookingError("INVALID_INPUT", `Invalid date range: dateFrom ${dateFrom} is after dateTo ${dateTo}`);
  }
}

// Only accepted zones are remembered, so rejected strings cannot grow the set.
const acceptedTimeZones = new Set<string>();

/** True when Intl accepts `timeZone` (IANA names such as "Europe/Berlin" or "UTC"). */
export function isValidTimeZone(timeZone: string): boolean {
  if (acceptedTimeZones.has(timeZone)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return false;
  }
  acceptedTimeZones.add(timeZone);
  return true;
}

/**
 * Rejects a time zone that Intl does not accept. Every schedule-aware
 * availability read that uses such a zone would throw.
 */
export function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throwBookingError("INVALID_INPUT", `Invalid time zone "${timeZone}": expected an IANA time zone such as "Europe/Berlin"`);
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
export function isWholePositiveMinutes(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Buffers and notice: a finite number of minutes, 0 or more. */
export function isNonNegativeMinutes(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** The booking horizon (maxFutureMinutes): a finite number of minutes greater than 0. */
export function isPositiveMinutes(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** A length that non-empty options do not include. */
export function isLengthOutsideOptions(lengthInMinutes: number, options: number[] | undefined): boolean {
  return options !== undefined && options.length > 0 && !options.includes(lengthInMinutes);
}

/** The numeric event-type settings of a write; `undefined` (not given) is not checked. */
export type EventTypeNumbers = {
  lengthInMinutes?: number;
  lengthInMinutesOptions?: number[];
  slotInterval?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  minNoticeMinutes?: number;
  maxFutureMinutes?: number;
};

const WHOLE_MINUTES = "expected a whole number of minutes greater than 0";

/** Checks each numeric setting a write gives (INVALID_INPUT). */
export function assertEventTypeNumbers(fields: EventTypeNumbers): void {
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
  for (const key of ["bufferBefore", "bufferAfter", "minNoticeMinutes"] as const) {
    const value = fields[key];
    if (value !== undefined && !isNonNegativeMinutes(value)) {
      throwBookingError("INVALID_INPUT", `Invalid ${key} ${value}: expected a number of minutes of 0 or more`);
    }
  }
  const horizon = fields.maxFutureMinutes;
  if (horizon !== undefined && !isPositiveMinutes(horizon)) {
    throwBookingError("INVALID_INPUT", `Invalid maxFutureMinutes ${horizon}: expected a number of minutes greater than 0`);
  }
}

/**
 * The length must be one of the length options when there are any. Checked
 * on the configuration a write leaves behind (the given fields merged over
 * the stored ones), and only by writes that give either field, so a row
 * stored before 0.5.0 that breaks it can still change its other settings.
 */
export function assertLengthInOptions(lengthInMinutes: number, options: number[] | undefined): void {
  if (isLengthOutsideOptions(lengthInMinutes, options)) {
    throwBookingError(
      "INVALID_INPUT",
      `Invalid lengthInMinutes ${lengthInMinutes}: expected one of lengthInMinutesOptions (${(options ?? []).join(", ")})`
    );
  }
}
