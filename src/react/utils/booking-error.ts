import { ConvexError } from "convex/values";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Resolves the text shown for a failed booking or reschedule.
 *
 * Only host-provided ConvexError data is shown: `data.message` when data is an
 * object, otherwise data itself when it is a string. `error.message` is never
 * used, because the Convex client prefixes it with transport diagnostics
 * ("[CONVEX M(...)]") and production redacts plain errors to "Server Error".
 *
 * @param error - The rejection from the booking mutation
 * @param fallback - Text used when the error carries no host message
 */
export function resolveBookingErrorMessage(
  error: unknown,
  fallback: string = GENERIC_MESSAGE
): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message;
    }
    if (typeof data === "string" && data.trim()) {
      return data;
    }
  }
  return fallback;
}
