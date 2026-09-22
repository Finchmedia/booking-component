import type { Doc } from "../_generated/dataModel.js";
import type { BookingEmailContext, BookingEmailKind, BookingEmailOptions } from "../../emails.js";
/** URLs are data for renderers, so leave HTML escaping to the renderer. */
export declare function bookingEmailLinks(uid?: string, token?: string, baseUrl?: string): BookingEmailContext["links"];
/** Capture once in the lifecycle mutation; retries reuse this stored snapshot. */
export declare function createBookingEmailContext(kind: BookingEmailKind, booking: Doc<"bookings">, options?: BookingEmailOptions, details?: Pick<BookingEmailContext, "previousStart" | "previousEnd" | "reason">): BookingEmailContext;
//# sourceMappingURL=context.d.ts.map