/// <reference types="vite/client" />
/**
 * One Resend account per booking instance (O2) — canary for @convex-dev/resend.
 *
 * Booking's nested Resend component keeps ONE set of options, the last one
 * any call passed, and each batch goes out with the key stored when it was
 * made. So mail waiting for a batch is sent with the newest key: harmless for
 * a key rotation within one account, but mail of another account's key shares
 * the batch and its authorization. README and docs/custom-emails.md state this
 * contract; a Resend upgrade that changes it fails here.
 *
 * Runs Booking's real lifecycle mutations and Resend's real delivery worker
 * (workpool and rate limiter included) against an in-memory fetch stub that
 * records the Authorization header. No network; the provider's real answer to
 * a foreign key is not exercised, the 403 is emulated.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { componentsGeneric, defineSchema, defineTable, queryGeneric } from "convex/server";
import { v } from "convex/values";
import resendComponent from "@convex-dev/resend/test";
import workpoolComponent from "@convex-dev/workpool/test";
import rateLimiterComponent from "@convex-dev/rate-limiter/test";
import bookingComponent from "../test.js";

const hostSchema = defineSchema({ unused: defineTable({ x: v.string() }) });
const components = componentsGeneric() as any;
const booking = components.booking;
const START = Date.UTC(2027, 2, 9, 9);
const HOUR = 3_600_000;
const OLD_KEY = { apiKey: "re_old_key_not_real", fromEmail: "Host <booking@host.example>" };
const NEW_KEY = { apiKey: "re_new_key_not_real", fromEmail: "Host <booking@host.example>" };
const OTHER_ACCOUNT = { apiKey: "re_other_account_not_real", fromEmail: "Other <booking@other.example>" };

const inspectResend = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.db.query("emails").collect(),
});
const inspectEmails = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.runQuery(components.resend.testInspect.inspectResend, {}),
});

function setup() {
  const t = convexTest(hostSchema, { "./_generated/api.ts": async () => ({}) });
  t.registerComponent("booking", bookingComponent.schema, {
    ...bookingComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectEmails }),
  });
  t.registerComponent("booking/resend", resendComponent.schema, {
    ...resendComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectResend }),
  });
  rateLimiterComponent.register(t as any, "booking/resend/rateLimiter");
  workpoolComponent.register(t as any, "booking/resend/emailWorkpool");
  workpoolComponent.register(t as any, "booking/resend/callbackWorkpool");
  return t;
}
let t: ReturnType<typeof setup>;

type BatchCall = { auth: string; from: string[]; to: string[] };
let calls: BatchCall[];
let status: number;

async function drainBookingJobs() {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
}
async function runWorker(untilCalls: number) {
  for (let i = 0; i < 60 && calls.length < untilCalls; i++) {
    await vi.advanceTimersByTimeAsync(500);
    await t.finishInProgressScheduledFunctions();
  }
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(500);
    await t.finishInProgressScheduledFunctions();
  }
}
const statuses = async (): Promise<Record<string, string>> =>
  Object.fromEntries((await t.query(booking.testInspect.inspectEmails, {}) as Array<{ to: string[]; status: string }>)
    .map((email) => [email.to[0], email.status]));

async function seed() {
  await t.mutation(booking.resources.createResource, {
    id: "resource", organizationId: "org", name: "Room", type: "room", timezone: "UTC",
  });
  await t.mutation(booking.public.createEventType, {
    id: "event", slug: "event", title: "Consultation", organizationId: "org",
    lengthInMinutes: 60, slotInterval: 60, timezone: "UTC", lockTimeZoneToggle: false,
    locations: [], requiresConfirmation: false,
  });
  await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "resource", eventTypeId: "event" });
}
function create(email: string, hour: number, resendOptions: Record<string, string>) {
  const start = START + hour * HOUR;
  return t.mutation(booking.public.createBooking, {
    resourceId: "resource", eventTypeId: "event", start, end: start + HOUR,
    timezone: "UTC", booker: { name: "Guest", email }, location: { type: "address", value: "Room 1" }, resendOptions,
  });
}
function cancel(created: { uid: string; managementToken: string }, resendOptions: Record<string, string>) {
  return t.mutation(booking.public.cancelBookingByToken, { uid: created.uid, token: created.managementToken, resendOptions });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 8));
  calls = [];
  status = 200;
  // Only the batch endpoint answers, from memory; anything else is a test failure.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://api.resend.com/emails/batch") throw new Error(`Unexpected request ${String(input)}`);
    const body = JSON.parse(String(init?.body)) as Array<{ from: string; to: string[] }>;
    const headers = init?.headers as Record<string, string>;
    calls.push({ auth: headers.Authorization, from: body.map((email) => email.from), to: body.flatMap((email) => email.to) });
    const json = status === 200
      ? { data: body.map((_, i) => ({ id: `stub-${calls.length}-${i}` })) }
      : { name: "validation_error", message: "API key belongs to another account (emulated)" };
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  for (const method of ["log", "warn", "error", "debug", "info"] as const) vi.spyOn(console, method).mockImplementation(() => {});
  t = setup();
  await seed();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("one Resend account per booking instance", () => {
  test("rotation: mail still waiting under the old key goes out with the new key", async () => {
    await create("ada@example.com", 0, OLD_KEY);
    await create("bob@example.com", 1, NEW_KEY);
    await drainBookingJobs();
    await runWorker(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe(`Bearer ${NEW_KEY.apiKey}`);
    expect(calls[0].to.sort()).toEqual(["ada@example.com", "bob@example.com"]);
    expect(await statuses()).toEqual({ "ada@example.com": "sent", "bob@example.com": "sent" });
  });

  test("a second account's key authorizes the whole batch, so a provider rejection fails both mails", async () => {
    status = 403;
    await create("ada@example.com", 0, OLD_KEY);
    await create("bob@example.com", 1, OTHER_ACCOUNT);
    await drainBookingJobs();
    await runWorker(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe(`Bearer ${OTHER_ACCOUNT.apiKey}`);
    expect(calls[0].from.sort()).toEqual([OLD_KEY.fromEmail, OTHER_ACCOUNT.fromEmail].sort());
    expect(await statuses()).toEqual({ "ada@example.com": "failed", "bob@example.com": "failed" });
  });

  test("CONTROL: mail in separate batches goes out with the key it was queued with", async () => {
    await create("ada@example.com", 0, OLD_KEY);
    await drainBookingJobs();
    await runWorker(1);
    await create("bob@example.com", 1, OTHER_ACCOUNT);
    await drainBookingJobs();
    await runWorker(2);
    expect(calls.map((call) => call.auth)).toEqual([`Bearer ${OLD_KEY.apiKey}`, `Bearer ${OTHER_ACCOUNT.apiKey}`]);
    expect(await statuses()).toEqual({ "ada@example.com": "sent", "bob@example.com": "sent" });
  });

  test("CONTROL: one key with two senders, a confirmation and a cancellation in one batch, all sent", async () => {
    const secondSender = { ...OLD_KEY, fromEmail: "Front desk <desk@host.example>" };
    const created = await create("ada@example.com", 0, OLD_KEY);
    await drainBookingJobs();
    await cancel(created, secondSender);
    await create("bob@example.com", 1, OLD_KEY);
    await drainBookingJobs();
    await runWorker(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe(`Bearer ${OLD_KEY.apiKey}`);
    expect(calls[0].to.sort()).toEqual(["ada@example.com", "ada@example.com", "bob@example.com"]);
    expect(new Set(calls[0].from)).toEqual(new Set([OLD_KEY.fromEmail, secondSender.fromEmail]));
    const emails = await t.query(booking.testInspect.inspectEmails, {}) as Array<{ status: string }>;
    expect(emails.map((email) => email.status)).toEqual(["sent", "sent", "sent"]);
  });
});
