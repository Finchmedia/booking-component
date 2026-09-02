/// <reference types="vite/client" />
/**
 * emails/mutations.ts — returns validators and the no-API-key skip path.
 *
 * Every e-mail mutation declares
 *   returns: v.object({ success: v.boolean(), emailId: v.optional(v.string()), error: v.optional(v.string()) })
 * and starts with a `if (!args.resendApiKey)` guard. This file pins:
 *   - the exact skip result `{ success: false, error: "No API key provided" }`
 *     for all six mutations, with ONLY the declared keys (no `emailId`),
 *   - the per-mutation console.warn text (i.e. that the right branch ran),
 *   - that nothing touches the network (global `fetch` is a throwing spy),
 *   - the catch branch, which must return the same declared shape,
 *   - that the booking mutations still work with `resendOptions` omitted or
 *     explicitly `undefined` (their scheduled e-mails just skip).
 */
import { beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  TZ,
  berlin,
  book,
  drain,
  seedResourceWithSchedule,
  setup,
  utc,
  type T,
} from "./setup.test.js";

// ============================================
// LOCAL HELPERS
// ============================================

/** Declared return shape of every e-mail mutation. */
type EmailResult = { success: boolean; emailId?: string; error?: string };

const SKIP_ERROR = "No API key provided";

/** Shared time/booker fields every e-mail mutation takes. */
const RECIPIENT = {
  to: BOOKER.email,
  bookerName: BOOKER.name,
  eventTitle: "Consultation",
  timezone: TZ,
};
const START = utc(TUESDAY, "09:00");
const END = utc(TUESDAY, "10:00");

/**
 * Asserts the object is EXACTLY the documented skip result: success false,
 * the fixed error string, no `emailId`, and no key outside the returns
 * validator's `success` / `emailId` / `error`.
 */
function expectSkipped(result: EmailResult): void {
  expect(result).toEqual({ success: false, error: SKIP_ERROR });
  expect(Object.keys(result).sort()).toEqual(["error", "success"]);
  expect("emailId" in result).toBe(false);
  expect(result.emailId).toBeUndefined();
}

/** Asserts only the declared keys are present (the failure path keeps an error). */
function expectDeclaredKeysOnly(result: EmailResult): void {
  for (const key of Object.keys(result)) {
    expect(["success", "emailId", "error"]).toContain(key);
  }
}

/**
 * Replaces global `fetch` with a spy that throws, so any outbound request
 * fails loudly; `calls()` proves none was even attempted. Restored when the
 * test finishes.
 */
function noNetwork(): { calls: () => number } {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    throw new Error(`unexpected network access: ${String(input)}`);
  });
  onTestFinished(() => spy.mockRestore());
  return { calls: () => spy.mock.calls.length };
}

/** Captures console.warn / console.error output (restored when the test finishes). */
function captureConsole(method: "warn" | "error"): string[] {
  const messages: string[] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    messages.push(args.map((a) => String(a)).join(" "));
  });
  onTestFinished(() => spy.mockRestore());
  return messages;
}

/** Calls all six e-mail mutations with `extra` merged in; returns them in a stable order. */
async function callAllEmails(
  t: T,
  extra: { resendApiKey?: string; resendFromEmail?: string; from?: string } = {}
): Promise<Array<[string, EmailResult]>> {
  const timed = { ...RECIPIENT, start: START, end: END, ...extra };
  return [
    ["sendBookingConfirmation", await t.mutation(internal.emails.sendBookingConfirmation, timed)],
    ["sendBookingPending", await t.mutation(internal.emails.sendBookingPending, timed)],
    ["sendBookingApproved", await t.mutation(internal.emails.sendBookingApproved, timed)],
    ["sendBookingDeclined", await t.mutation(internal.emails.sendBookingDeclined, timed)],
    ["sendBookingCancellation", await t.mutation(internal.emails.sendBookingCancellation, timed)],
    [
      "sendBookingRescheduled",
      await t.mutation(internal.emails.sendBookingRescheduled, {
        ...RECIPIENT,
        oldStart: START,
        oldEnd: END,
        newStart: START + 3_600_000,
        newEnd: END + 3_600_000,
        ...extra,
      }),
    ],
  ];
}

let t: T;
beforeEach(() => {
  ({ t } = setup());
});

// ============================================
// SKIP PATH — one test per mutation, every optional arg supplied
// ============================================

describe("e-mail mutations without a resendApiKey", () => {
  test("sendBookingConfirmation skips even with every other optional arg supplied", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingConfirmation, {
      ...RECIPIENT,
      start: START,
      end: END,
      resourceId: "res-1",
      from: "sender@example.com",
      bookingUid: "bk_1",
      managementToken: "tok_1",
      baseUrl: "https://example.com",
      resendFromEmail: "fallback@example.com",
      // no resendApiKey
    });

    expectSkipped(result);
    expect(warnings).toEqual([
      "[emails] No resendApiKey provided, skipping confirmation email",
    ]);
    expect(net.calls()).toBe(0);
  });

  test("sendBookingPending skips and warns about the pending e-mail", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingPending, {
      ...RECIPIENT,
      start: START,
      end: END,
      from: "sender@example.com",
      bookingUid: "bk_1",
      managementToken: "tok_1",
      baseUrl: "https://example.com",
      resendFromEmail: "fallback@example.com",
    });

    expectSkipped(result);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping pending email"]);
    expect(net.calls()).toBe(0);
  });

  test("sendBookingApproved skips and warns about the approved e-mail", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingApproved, {
      ...RECIPIENT,
      start: START,
      end: END,
      from: "sender@example.com",
      bookingUid: "bk_1",
      managementToken: "tok_1",
      baseUrl: "https://example.com",
      resendFromEmail: "fallback@example.com",
    });

    expectSkipped(result);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping approved email"]);
    expect(net.calls()).toBe(0);
  });

  test("sendBookingDeclined skips with a decline reason", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingDeclined, {
      ...RECIPIENT,
      start: START,
      end: END,
      reason: "Room double-booked",
      from: "sender@example.com",
      resendFromEmail: "fallback@example.com",
    });

    expectSkipped(result);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping declined email"]);
    expect(net.calls()).toBe(0);
  });

  test("sendBookingCancellation skips with a cancellation reason", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingCancellation, {
      ...RECIPIENT,
      start: START,
      end: END,
      reason: "Booker cancelled",
      from: "sender@example.com",
      resendFromEmail: "fallback@example.com",
    });

    expectSkipped(result);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping cancellation email"]);
    expect(net.calls()).toBe(0);
  });

  test("sendBookingRescheduled skips with both the old and the new time range", async () => {
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const result = await t.mutation(internal.emails.sendBookingRescheduled, {
      ...RECIPIENT,
      oldStart: START,
      oldEnd: END,
      newStart: START + 86_400_000,
      newEnd: END + 86_400_000,
      from: "sender@example.com",
      bookingUid: "bk_1",
      managementToken: "tok_1",
      baseUrl: "https://example.com",
      resendFromEmail: "fallback@example.com",
    });

    expectSkipped(result);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping rescheduled email"]);
    expect(net.calls()).toBe(0);
  });
});

// ============================================
// GUARD EDGE CASES
// ============================================

describe("the resendApiKey guard", () => {
  test("treats an empty-string key as missing for all six mutations", async () => {
    const net = noNetwork();
    captureConsole("warn");

    // `!args.resendApiKey` — an empty string is falsy, so the guard must fire
    // instead of constructing a Resend client with a blank key.
    const results = await callAllEmails(t, { resendApiKey: "" });

    expect(results).toHaveLength(6);
    for (const [name, result] of results) {
      expect(name, `${name} must skip on an empty key`).toBeTruthy();
      expectSkipped(result);
    }
    expect(net.calls()).toBe(0);
  });

  test("skips regardless of resendFromEmail / from fallbacks and never opens a socket", async () => {
    const net = noNetwork();
    const warnings = captureConsole("warn");

    const results = await callAllEmails(t, {
      resendFromEmail: "fallback@example.com",
      from: "explicit@example.com",
    });

    for (const [, result] of results) expectSkipped(result);
    // One warning per mutation, all six distinct branches.
    expect(warnings).toEqual([
      "[emails] No resendApiKey provided, skipping confirmation email",
      "[emails] No resendApiKey provided, skipping pending email",
      "[emails] No resendApiKey provided, skipping approved email",
      "[emails] No resendApiKey provided, skipping declined email",
      "[emails] No resendApiKey provided, skipping cancellation email",
      "[emails] No resendApiKey provided, skipping rescheduled email",
    ]);
    expect(net.calls()).toBe(0);
  });

  test("the emails.ts re-export and the emails/mutations module resolve to the same function", async () => {
    captureConsole("warn");
    const args = { ...RECIPIENT, start: START, end: END };

    // emails.ts only re-exports emails/mutations.ts, so both API paths exist
    // and must behave identically.
    const viaReExport: EmailResult = await t.mutation(
      internal.emails.sendBookingConfirmation,
      args
    );
    const viaModule: EmailResult = await t.mutation(
      internal.emails.mutations.sendBookingConfirmation,
      args
    );

    expectSkipped(viaReExport);
    expectSkipped(viaModule);
    expect(viaModule).toEqual(viaReExport);
  });
});

// ============================================
// FAILURE PATH — the catch branch honours the same validator
// ============================================

describe("the send failure path", () => {
  test("returns { success: false, error } with no emailId and without any network call", async () => {
    const net = noNetwork();
    const errors = captureConsole("error");

    // A syntactically valid but fake key gets past the guard; the Resend
    // component is not mounted in the test backend, so `resend.sendEmail`
    // throws inside the try — no request is ever made.
    const result: EmailResult = await t.mutation(internal.emails.sendBookingConfirmation, {
      ...RECIPIENT,
      start: START,
      end: END,
      resendApiKey: "re_not_a_real_key",
    });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toBe(SKIP_ERROR);
    expect(result.emailId).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(["error", "success"]);
    expectDeclaredKeysOnly(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`[emails] Failed to send confirmation to ${BOOKER.email}:`);
    expect(net.calls()).toBe(0);
  });

  test("every mutation catches its send failure instead of throwing", async () => {
    const net = noNetwork();
    const errors = captureConsole("error");

    const results = await callAllEmails(t, { resendApiKey: "re_not_a_real_key" });

    for (const [name, result] of results) {
      expect(result.success, `${name} must resolve, not throw`).toBe(false);
      expect(typeof result.error).toBe("string");
      expect(result.emailId).toBeUndefined();
      expectDeclaredKeysOnly(result);
    }
    expect(errors).toHaveLength(6);
    expect(net.calls()).toBe(0);
  });
});

// ============================================
// BOOKING MUTATIONS WITHOUT resendOptions
// ============================================

describe("booking mutations with resendOptions undefined", () => {
  test("createBooking succeeds with resendOptions omitted and its confirmation e-mail just skips", async () => {
    const seed = await seedResourceWithSchedule(t);
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const booking = await book(t, seed, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));
    expect(booking).toMatchObject({ status: "confirmed", bookerEmail: BOOKER.email });

    await drain(t); // booking.created -> internal.emails.sendBookingConfirmation

    expect(warnings).toContain(
      "[emails] No resendApiKey provided, skipping confirmation email"
    );
    expect(net.calls()).toBe(0);
    // The booking survives the e-mail being skipped.
    const stored: Doc<"bookings"> | null = await t.query(api.public.getBookingByUid, {
      uid: (booking as Doc<"bookings">).uid,
    });
    expect(stored?.status).toBe("confirmed");
  });

  test("createBooking accepts an explicitly undefined resendOptions", async () => {
    const seed = await seedResourceWithSchedule(t);
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const booking = await book(t, seed, berlin(TUESDAY, "12:00"), berlin(TUESDAY, "13:00"), {
      resendOptions: undefined,
    });
    expect(booking).toMatchObject({ status: "confirmed" });

    await drain(t);
    expect(warnings).toContain(
      "[emails] No resendApiKey provided, skipping confirmation email"
    );
    expect(net.calls()).toBe(0);
  });

  test("a requiresConfirmation booking takes the pending e-mail branch and skips", async () => {
    const seed = await seedResourceWithSchedule(t, { requiresConfirmation: true });
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const booking = await book(t, seed, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));
    expect(booking).toMatchObject({ status: "pending" });

    await drain(t);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping pending email"]);
    expect(net.calls()).toBe(0);
  });

  test("pending -> confirmed sends the approved e-mail, provisional -> confirmed the confirmation e-mail", async () => {
    const seed = await seedResourceWithSchedule(t, { requiresConfirmation: true });
    const pending = (await book(
      t,
      seed,
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    )) as Doc<"bookings">;
    const provisional = (await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: seed.eventTypeId,
      resourceId: seed.resourceId,
      start: berlin(TUESDAY, "13:00"),
      end: berlin(TUESDAY, "14:00"),
      timezone: seed.timezone,
      booker: BOOKER,
      location: LOCATION,
    })) as Doc<"bookings">;
    await drain(t); // flush the booking.created e-mail of the pending booking

    const warnings = captureConsole("warn");
    const net = noNetwork();

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: pending._id,
      toStatus: "confirmed",
    });
    await drain(t);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping approved email"]);

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: provisional._id,
      toStatus: "confirmed",
    });
    await drain(t);
    expect(warnings).toEqual([
      "[emails] No resendApiKey provided, skipping approved email",
      "[emails] No resendApiKey provided, skipping confirmation email",
    ]);
    expect(net.calls()).toBe(0);
  });

  test("pending -> declined and confirmed -> cancelled skip their e-mails", async () => {
    const seed = await seedResourceWithSchedule(t, { requiresConfirmation: true });
    const pending = (await book(
      t,
      seed,
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    )) as Doc<"bookings">;
    const other = await seedResourceWithSchedule(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
      scheduleId: "sch-2",
    });
    const confirmed = (await book(
      t,
      other,
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    )) as Doc<"bookings">;
    await drain(t);

    const warnings = captureConsole("warn");
    const net = noNetwork();

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: pending._id,
      toStatus: "declined",
      reason: "No capacity",
    });
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: confirmed._id,
      toStatus: "cancelled",
      reason: "Booker cancelled",
    });
    await drain(t);

    expect(warnings.sort()).toEqual([
      "[emails] No resendApiKey provided, skipping cancellation email",
      "[emails] No resendApiKey provided, skipping declined email",
    ]);
    expect(net.calls()).toBe(0);
  });

  test("rescheduleBooking without resendOptions skips the rescheduled e-mail", async () => {
    const seed = await seedResourceWithSchedule(t);
    const booking = (await book(
      t,
      seed,
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    )) as Doc<"bookings">;
    await drain(t);

    const warnings = captureConsole("warn");
    const net = noNetwork();

    const moved = await t.mutation(api.public.rescheduleBooking, {
      bookingId: booking._id,
      newStart: berlin(TUESDAY, "14:00"),
      newEnd: berlin(TUESDAY, "15:00"),
    });
    expect(moved).toMatchObject({ status: "confirmed", start: berlin(TUESDAY, "14:00") });

    await drain(t);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping rescheduled email"]);
    expect(net.calls()).toBe(0);
  });

  test("cancelBookingByToken without resendOptions skips the cancellation e-mail", async () => {
    const seed = await seedResourceWithSchedule(t);
    const booking = (await book(
      t,
      seed,
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    )) as Doc<"bookings">;
    await drain(t);

    const warnings = captureConsole("warn");
    const net = noNetwork();

    expect(
      await t.mutation(api.public.cancelBookingByToken, {
        uid: booking.uid,
        token: booking.managementToken as string,
      })
    ).toEqual({ success: true });

    await drain(t);
    expect(warnings).toEqual(["[emails] No resendApiKey provided, skipping cancellation email"]);
    expect(net.calls()).toBe(0);
  });

  test("the legacy createReservation path also survives without resendOptions", async () => {
    const seed = await seedResourceWithSchedule(t);
    const warnings = captureConsole("warn");
    const net = noNetwork();

    const bookingId = await t.mutation(api.public.createReservation, {
      resourceId: seed.resourceId,
      actorId: BOOKER.email,
      start: berlin(TUESDAY, "10:00"),
      end: berlin(TUESDAY, "11:00"),
    });
    expect(bookingId).toBeTruthy();

    await drain(t);
    expect(warnings).toEqual([
      "[emails] No resendApiKey provided, skipping confirmation email",
    ]);
    expect(net.calls()).toBe(0);
  });
});
