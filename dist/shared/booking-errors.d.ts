import { ConvexError } from "convex/values";
/** Every `data.code` a component `ConvexError` can carry. */
export declare const BOOKING_ERROR_CODES: readonly ["SLOT_UNAVAILABLE", "QUANTITY_UNAVAILABLE", "EVENT_TYPE_NOT_FOUND", "EVENT_TYPE_INACTIVE", "EVENT_TYPE_IN_USE", "RESOURCE_NOT_FOUND", "RESOURCE_INACTIVE", "RESOURCE_NOT_LINKED", "RESOURCE_NOT_STANDALONE", "RESOURCE_ALREADY_EXISTS", "RESOURCE_IN_USE", "POOL_REQUIRES_BUNDLE", "ORGANIZATION_MISMATCH", "SCHEDULE_NOT_FOUND", "SCHEDULE_ALREADY_EXISTS", "SCHEDULE_IN_USE", "DATE_OVERRIDE_NOT_FOUND", "BOOKING_NOT_FOUND", "INVALID_TOKEN", "INVALID_STATE", "HOOK_NOT_FOUND", "INVALID_RANGE", "INVALID_INPUT"];
export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];
/** The `data` of a component `ConvexError`. */
export type BookingErrorData = {
    code: BookingErrorCode;
    message: string;
};
/**
 * Throws `ConvexError({ code, message })` for an expected failure. The
 * error's own `message` is `message` too, not the JSON of its data, so logs
 * and existing `error.message` checks read the same text as in 0.4.x.
 */
export declare function throwBookingError(code: BookingErrorCode, message: string): never;
/** True for a code this version of the package knows. */
export declare function isBookingErrorCode(value: unknown): value is BookingErrorCode;
/**
 * True for a component `ConvexError` with a known code, as a host function
 * sees it after `ctx.runMutation(components.booking.…)` rejects.
 */
export declare function isBookingError(error: unknown): error is ConvexError<BookingErrorData>;
//# sourceMappingURL=booking-errors.d.ts.map