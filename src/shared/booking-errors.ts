// ============================================
// BOOKING ERROR CODES
// ============================================
//
// Expected failures of the component (a taken slot, an unknown event type, a
// wrong management token, an invalid argument) throw
// `ConvexError({ code, message })`. `code` is one of BOOKING_ERROR_CODES and
// is public contract; `message` is the human text the same failure had in
// 0.4.x. Broken invariants and other programming errors stay plain `Error`.
// docs/errors.md lists every code with the functions that throw it.
//
// Only `convex/values` is imported: the root entry exports the codes for
// host functions, and @mrfinch/booking/react may read them in the browser.

import { ConvexError } from "convex/values";

/** Every `data.code` a component `ConvexError` can carry. */
export const BOOKING_ERROR_CODES = [
  // Inventory
  "SLOT_UNAVAILABLE",
  "QUANTITY_UNAVAILABLE",
  // Event types
  "EVENT_TYPE_NOT_FOUND",
  "EVENT_TYPE_INACTIVE",
  "EVENT_TYPE_IN_USE",
  // Resources
  "RESOURCE_NOT_FOUND",
  "RESOURCE_INACTIVE",
  "RESOURCE_NOT_LINKED",
  "RESOURCE_NOT_STANDALONE",
  "RESOURCE_ALREADY_EXISTS",
  "RESOURCE_IN_USE",
  "POOL_REQUIRES_BUNDLE",
  // Schedules
  "SCHEDULE_NOT_FOUND",
  "SCHEDULE_ALREADY_EXISTS",
  "DATE_OVERRIDE_NOT_FOUND",
  // Bookings
  "BOOKING_NOT_FOUND",
  "INVALID_TOKEN",
  "INVALID_STATE",
  // Hooks
  "HOOK_NOT_FOUND",
  // Arguments
  "INVALID_RANGE",
  "INVALID_INPUT",
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

/** The `data` of a component `ConvexError`. */
export type BookingErrorData = { code: BookingErrorCode; message: string };

/**
 * Throws `ConvexError({ code, message })` for an expected failure. The
 * error's own `message` is `message` too, not the JSON of its data, so logs
 * and existing `error.message` checks read the same text as in 0.4.x.
 */
export function throwBookingError(code: BookingErrorCode, message: string): never {
  const error = new ConvexError<BookingErrorData>({ code, message });
  error.message = message;
  throw error;
}

/** True for a code this version of the package knows. */
export function isBookingErrorCode(value: unknown): value is BookingErrorCode {
  return typeof value === "string" && (BOOKING_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * True for a component `ConvexError` with a known code, as a host function
 * sees it after `ctx.runMutation(components.booking.…)` rejects.
 */
export function isBookingError(error: unknown): error is ConvexError<BookingErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    isBookingErrorCode(data.code) &&
    "message" in data &&
    typeof data.message === "string"
  );
}
