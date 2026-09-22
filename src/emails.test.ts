import { describe, expect, expectTypeOf, test } from "vitest";
import type { FunctionReference } from "convex/server";
import {
  assertValidRenderedBookingEmail,
  createBookingEmailOptions,
  MAX_BOOKING_EMAIL_BYTES,
  MAX_BOOKING_EMAIL_SUBJECT_LENGTH,
  type BookingEmailContext,
  type BookingEmailRenderer,
  type RenderedBookingEmail,
} from "./emails.js";

describe("custom email content boundary", () => {
  test("accepts HTML with an optional text alternative", () => {
    expect(() => assertValidRenderedBookingEmail({ subject: "Confirmed", html: "<p>Hello</p>" })).not.toThrow();
    expect(() => assertValidRenderedBookingEmail({ subject: "Bestätigt ✓", html: "<p>Hallo</p>", text: "Hallo" })).not.toThrow();
  });

  test.each([
    null, undefined, [], "html", 5,
    { subject: "Subject" },
    { subject: "", html: "<p>Hello</p>" },
    { subject: " \t", html: "<p>Hello</p>" },
    { subject: "Subject", html: " \n" },
    { subject: "Subject", html: 12 },
    { subject: "Subject", html: "<p>Hello</p>", text: 12 },
    { subject: "Subject", html: "<p>Hello</p>", to: "other@example.com" },
    { subject: "Subject", html: "<p>Hello</p>", from: "other@example.com" },
    { subject: "Subject", html: "<p>Hello</p>", apiKey: "private" },
  ])("rejects malformed content and delivery-option injection: %j", (value) => {
    expect(() => assertValidRenderedBookingEmail(value)).toThrow("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
  });

  test.each(["Hi\rBcc: x", "Hi\nBcc: x", "Hi\u0000there"])("rejects control characters in the subject: %j", (subject) => {
    expect(() => assertValidRenderedBookingEmail({ subject, html: "<p>Hello</p>" })).toThrow("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
  });

  test("enforces the subject length at the boundary", () => {
    expect(() => assertValidRenderedBookingEmail({ subject: "s".repeat(MAX_BOOKING_EMAIL_SUBJECT_LENGTH), html: "h" })).not.toThrow();
    expect(() => assertValidRenderedBookingEmail({ subject: "s".repeat(MAX_BOOKING_EMAIL_SUBJECT_LENGTH + 1), html: "h" })).toThrow("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
  });

  test("limits combined UTF-8 bytes, including both alternatives and multibyte characters", () => {
    const html = "é".repeat((MAX_BOOKING_EMAIL_BYTES - 2) / 2);
    const exact = { subject: "s", html, text: "t" };
    expect(new TextEncoder().encode(exact.subject + exact.html + exact.text).byteLength).toBe(MAX_BOOKING_EMAIL_BYTES);
    expect(() => assertValidRenderedBookingEmail(exact)).not.toThrow();
    expect(() => assertValidRenderedBookingEmail({ ...exact, text: "tt" })).toThrow("BOOKING_EMAIL_RENDERER_CONTENT_TOO_LARGE");
    expect(() => assertValidRenderedBookingEmail({ subject: "s", html: "🙂".repeat(MAX_BOOKING_EMAIL_BYTES / 4) })).toThrow("BOOKING_EMAIL_RENDERER_CONTENT_TOO_LARGE");
  });

  test("does not include rejected content or credentials in errors", () => {
    const secret = "PRIVATE-CONTENT-TOKEN";
    try {
      assertValidRenderedBookingEmail({ subject: `Hi\n${secret}`, html: secret });
      throw new Error("Expected rejection");
    } catch (error) {
      expect(String(error)).toContain("BOOKING_EMAIL_RENDERER_INVALID_RESULT");
      expect(String(error)).not.toContain(secret);
    }
  });

  test("preserves old delivery-only options without needing a Convex function context", async () => {
    const options = { apiKey: "re_fixture", fromEmail: "Booking <booking@example.com>", baseUrl: "https://example.com" };
    await expect(createBookingEmailOptions(options)).resolves.toEqual(options);
  });

  test("the helper accepts internal queries and excludes public queries, mutations and actions", () => {
    type RendererOption = NonNullable<Parameters<typeof createBookingEmailOptions>[0]["renderer"]>;
    expectTypeOf<RendererOption>().toEqualTypeOf<BookingEmailRenderer>();
    expectTypeOf<FunctionReference<"query", "internal", BookingEmailContext, RenderedBookingEmail>>().toExtend<RendererOption>();
    expectTypeOf<FunctionReference<"query", "public", BookingEmailContext, RenderedBookingEmail>>().not.toExtend<RendererOption>();
    expectTypeOf<FunctionReference<"mutation", "internal", BookingEmailContext, RenderedBookingEmail>>().not.toExtend<RendererOption>();
    expectTypeOf<FunctionReference<"action", "internal", BookingEmailContext, RenderedBookingEmail>>().not.toExtend<RendererOption>();
  });
});
