import { type Infer } from "convex/values";
/** Every status a booking can have, in lifecycle order. */
export declare const BOOKING_STATUSES: readonly ["provisional", "pending", "confirmed", "cancelled", "declined", "completed"];
/** The validator of a booking status: one literal per entry of BOOKING_STATUSES. */
export declare const bookingStatusValidator: import("convex/values").VUnion<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed", import("convex/values").VLiteral<"confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed", "required">[], "required", never>;
export type BookingStatus = Infer<typeof bookingStatusValidator>;
/** True for a value this version of the package stores as a booking status. */
export declare function isBookingStatus(value: unknown): value is BookingStatus;
//# sourceMappingURL=booking-status.d.ts.map