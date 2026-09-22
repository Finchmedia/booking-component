import { createFunctionHandle } from "convex/server";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";

/** Presentation events, distinct from the component's lifecycle hook names. */
export const bookingEmailKindValidator = v.union(
  v.literal("confirmed"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("rescheduled"),
);
export type BookingEmailKind = Infer<typeof bookingEmailKindValidator>;

/** A snapshot captured for one notification. It contains no delivery credentials. */
export const bookingEmailContextValidator = v.object({
  version: v.literal(1),
  kind: bookingEmailKindValidator,
  // Optional so jobs queued before renderer support can still be processed.
  notificationId: v.optional(v.string()),
  occurredAt: v.optional(v.number()),
  bookingId: v.optional(v.string()),
  bookingUid: v.optional(v.string()),
  organizationId: v.optional(v.string()),
  resourceId: v.optional(v.string()),
  eventTypeId: v.optional(v.string()),
  bookerName: v.string(),
  bookerEmail: v.string(),
  eventTitle: v.string(),
  start: v.number(),
  end: v.number(),
  timezone: v.string(),
  previousStart: v.optional(v.number()),
  previousEnd: v.optional(v.number()),
  reason: v.optional(v.string()),
  location: v.optional(v.object({
    type: v.string(),
    value: v.optional(v.string()),
  })),
  links: v.optional(v.object({
    view: v.string(),
    reschedule: v.string(),
    cancel: v.string(),
  })),
});
export type BookingEmailContext = Infer<typeof bookingEmailContextValidator>;

/** Return null to use Booking's built-in template for this notification. */
export const bookingEmailResultValidator = v.union(
  v.null(),
  v.object({
    subject: v.string(),
    html: v.string(),
    text: v.optional(v.string()),
  }),
);
export type RenderedBookingEmail = Infer<typeof bookingEmailResultValidator>;

/** Wire format. Only trusted host functions should construct these options. */
export const bookingEmailOptionsValidator = v.object({
  apiKey: v.string(),
  fromEmail: v.optional(v.string()),
  baseUrl: v.optional(v.string()),
  renderer: v.optional(v.string()),
});
export type BookingEmailOptions = Infer<typeof bookingEmailOptionsValidator>;

export type BookingEmailRenderer = FunctionReference<
  "query",
  "internal",
  BookingEmailContext,
  RenderedBookingEmail
>;

/**
 * Call inside a host Convex function, not at module initialization.
 * The renderer stays in the app; only its function handle crosses the boundary.
 */
export async function createBookingEmailOptions(
  options: Omit<BookingEmailOptions, "renderer"> & {
    renderer?: BookingEmailRenderer;
  },
): Promise<BookingEmailOptions> {
  const { renderer, ...delivery } = options;
  return renderer
    ? { ...delivery, renderer: await createFunctionHandle(renderer) }
    : delivery;
}

/** Combined UTF-8 content budget, comfortably below a Convex document limit. */
export const MAX_BOOKING_EMAIL_BYTES = 128 * 1024;
export const MAX_BOOKING_EMAIL_SUBJECT_LENGTH = 200;

/** Defense at the component boundary, even when the host omits return validators. */
export function assertValidRenderedBookingEmail(
  value: unknown,
): asserts value is Exclude<RenderedBookingEmail, null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
  }
  const content = value as Record<string, unknown>;
  if (
    Object.keys(content).some((key) => !["subject", "html", "text"].includes(key)) ||
    typeof content.subject !== "string" ||
    !content.subject.trim() ||
    content.subject.length > MAX_BOOKING_EMAIL_SUBJECT_LENGTH ||
    /[\r\n]/.test(content.subject) ||
    content.subject.includes("\0") ||
    typeof content.html !== "string" ||
    !content.html.trim() ||
    (content.text !== undefined && typeof content.text !== "string")
  ) {
    throw new Error("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content.subject).byteLength +
    encoder.encode(content.html).byteLength +
    encoder.encode((content.text as string | undefined) ?? "").byteLength;
  if (bytes > MAX_BOOKING_EMAIL_BYTES) {
    throw new Error("BOOKING_EMAIL_RENDERER_CONTENT_TOO_LARGE");
  }
}
