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
export declare function resolveBookingErrorMessage(error: unknown, fallback?: string): string;
//# sourceMappingURL=booking-error.d.ts.map