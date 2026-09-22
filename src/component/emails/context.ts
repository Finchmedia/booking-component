import type { Doc } from "../_generated/dataModel.js";
import type {
  BookingEmailContext,
  BookingEmailKind,
  BookingEmailOptions,
} from "../../emails.js";

/** URLs are data for renderers, so leave HTML escaping to the renderer. */
export function bookingEmailLinks(
  uid?: string,
  token?: string,
  baseUrl?: string,
): BookingEmailContext["links"] {
  if (!uid || !token || !baseUrl) return undefined;
  try {
    const base = new URL(baseUrl);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) {
      return undefined;
    }
    base.search = "";
    base.hash = "";
    const prefix = `${base.href.replace(/\/$/, "")}/book/booking/${encodeURIComponent(uid)}`;
    const query = `?token=${encodeURIComponent(token)}`;
    return {
      view: `${prefix}${query}`,
      reschedule: `${prefix}/reschedule${query}`,
      cancel: `${prefix}/cancel${query}`,
    };
  } catch {
    return undefined;
  }
}

/** Capture once in the lifecycle mutation; retries reuse this stored snapshot. */
export function createBookingEmailContext(
  kind: BookingEmailKind,
  booking: Doc<"bookings">,
  options?: BookingEmailOptions,
  details: Pick<BookingEmailContext, "previousStart" | "previousEnd" | "reason"> = {},
): BookingEmailContext {
  const occurredAt = Date.now();
  return {
    version: 1,
    kind,
    notificationId: `booking-email:${occurredAt}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`,
    occurredAt,
    bookingId: booking._id,
    bookingUid: booking.uid,
    organizationId: booking.organizationId,
    resourceId: booking.resourceId,
    eventTypeId: booking.eventTypeId,
    bookerName: booking.bookerName,
    bookerEmail: booking.bookerEmail,
    eventTitle: booking.eventTitle,
    start: booking.start,
    end: booking.end,
    timezone: booking.timezone,
    location: booking.location,
    links: bookingEmailLinks(booking.uid, booking.managementToken, options?.baseUrl),
    ...details,
  };
}
