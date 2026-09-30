import { ConvexError } from "convex/values";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

const TIME_TAKEN = "This time is no longer available. Please choose another time.";
const NOT_BOOKABLE = "This booking option is no longer available.";
const BOOKING_UNAVAILABLE = "This booking could not be found, or its link is no longer valid.";

/**
 * Generic messages for the component's error codes a booking or reschedule
 * can fail with (`data.code` of its `ConvexError({ code, message })`; the
 * root entry lists all codes as `BOOKING_ERROR_CODES`). Used only when an
 * error carries a code but no message, for example from a host that forwards
 * the code alone. Codes are read as plain strings: a code this version does
 * not know, or a host's own code, gets the fallback.
 */
const CODE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["SLOT_UNAVAILABLE", TIME_TAKEN],
  ["QUANTITY_UNAVAILABLE", TIME_TAKEN],
  ["EVENT_TYPE_NOT_FOUND", NOT_BOOKABLE],
  ["EVENT_TYPE_INACTIVE", NOT_BOOKABLE],
  ["RESOURCE_NOT_FOUND", NOT_BOOKABLE],
  ["RESOURCE_INACTIVE", NOT_BOOKABLE],
  ["RESOURCE_NOT_LINKED", NOT_BOOKABLE],
  ["RESOURCE_NOT_STANDALONE", NOT_BOOKABLE],
  ["POOL_REQUIRES_BUNDLE", NOT_BOOKABLE],
  ["ORGANIZATION_MISMATCH", NOT_BOOKABLE],
  // One text for both, so the message does not tell whether a booking exists
  ["BOOKING_NOT_FOUND", BOOKING_UNAVAILABLE],
  ["INVALID_TOKEN", BOOKING_UNAVAILABLE],
  ["INVALID_STATE", "This booking can no longer be changed."],
  ["INVALID_RANGE", "This time cannot be booked. Please choose another time."],
  ["INVALID_INPUT", "Please check your details and try again."],
]);

/**
 * Resolves the text shown for a failed booking or reschedule.
 *
 * Only host-provided ConvexError data is shown, in this order: `data.message`
 * when data is an object, data itself when it is a string, then a generic
 * message for a known `data.code`. `error.message` is never used, because the
 * Convex client prefixes it with transport diagnostics ("[CONVEX M(...)]")
 * and production redacts plain errors to "Server Error".
 *
 * @param error - The rejection from the booking mutation
 * @param fallback - Text used when the error carries neither a host message
 * nor a known code
 */
export function resolveBookingErrorMessage(
  error: unknown,
  fallback: string = GENERIC_MESSAGE
): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string" && data.trim()) {
      return data;
    }
    if (typeof data === "object" && data !== null) {
      if ("message" in data && typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
      const coded = "code" in data && typeof data.code === "string"
        ? CODE_MESSAGES.get(data.code)
        : undefined;
      if (coded) return coded;
    }
  }
  return fallback;
}
