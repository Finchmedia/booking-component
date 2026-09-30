/// <reference types="vite/client" />
/**
 * One notification's bad data affects only that notification (N5, N4).
 *
 * N5: a malformed recipient is skipped before it reaches Resend's shared batch.
 * The worker-level tests run Resend's real delivery worker (with its workpool
 * and rate limiter, transitive dependencies of @convex-dev/resend) against an
 * in-memory fetch stub that EMULATES strict batch validation (422 if any
 * recipient is invalid). No network; the real provider response is not
 * exercised. The screen is input hardening, not provider-equivalent validation.
 *
 * N4: a stored zone that Intl rejects renders the mail in UTC instead of
 * failing the job.
 *
 * Since 0.5.0 createBooking rejects both at creation, so the bookings with
 * a malformed address or zone are rows stored before 0.5.0: created valid,
 * then rewritten with storeLegacyValues. Jobs queued by 0.4.x call the email
 * mutations directly.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import {
  anyApi, componentsGeneric, defineSchema, defineTable, internalQueryGeneric, mutationGeneric, queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import { Resend } from "@convex-dev/resend";
import resendComponent from "@convex-dev/resend/test";
import workpoolComponent from "@convex-dev/workpool/test";
import rateLimiterComponent from "@convex-dev/rate-limiter/test";
import bookingComponent from "../test.js";
import {
  bookingEmailContextValidator, bookingEmailResultValidator, createBookingEmailOptions,
  isSendableAddress, type BookingEmailContext, type BookingEmailRenderer,
} from "../emails.js";

const hostSchema = defineSchema({ unused: defineTable({ x: v.string() }) });
const fixtureApi = anyApi.fixture;
const components = componentsGeneric() as any;
const booking = components.booking;
const START = Date.UTC(2027, 2, 9, 9); // 10:00 in Berlin (UTC+1)
const END = START + 3_600_000;
const DELIVERY = { apiKey: "re_fixture_not_real", fromEmail: "Host <booking@host.example>", baseUrl: "https://host.example" };

const renderContext = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async (_ctx, args) => ({ subject: `Custom: ${args.kind}`, html: JSON.stringify(args) }),
});
const renderThrows = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async () => { throw new Error("renderer must not run for a skipped recipient"); },
});

const inspectResend = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => Promise.all((await ctx.db.query("emails").collect()).map(async (email) => ({
    ...email,
    html: email.html ? new TextDecoder().decode((await ctx.db.get(email.html))?.content) : undefined,
  }))),
});
const inspectEmails = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.runQuery(components.resend.testInspect.inspectResend, {}),
});
const inspectJobs = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.db.system.query("_scheduled_functions").collect(),
});
// Rewrites a stored booking the way a row created before 0.5.0 can hold it.
const storeLegacyValues = mutationGeneric({
  args: { uid: v.string(), bookerEmail: v.optional(v.string()), timezone: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { uid, ...fields }) => {
    const row = await ctx.db.query("bookings").withIndex("by_uid", (q) => q.eq("uid", uid)).unique();
    if (!row) throw new Error(`No booking ${uid}`);
    await ctx.db.patch(row._id, fields);
    return null;
  },
});
// Enqueues directly into the nested Resend component, past Booking's recipient screen.
const enqueueUnscreened = mutationGeneric({
  args: { to: v.string() }, returns: v.null(),
  handler: async (ctx, { to }) => {
    const resend = new Resend(components.resend, { apiKey: DELIVERY.apiKey, testMode: false });
    await resend.sendEmail(ctx, { from: DELIVERY.fromEmail, to, subject: "Unscreened", html: "<p>Unscreened</p>" });
    return null;
  },
});

function setup() {
  const t = convexTest(hostSchema, {
    "./_generated/api.ts": async () => ({}),
    "./fixture.ts": async () => ({ renderContext, renderThrows }),
  });
  t.registerComponent("booking", bookingComponent.schema, {
    ...bookingComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectEmails, inspectJobs, enqueueUnscreened, storeLegacyValues }),
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

type BatchCall = { to: string[] };
let calls: BatchCall[];
const PROVIDER_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function strictProvider(body: Array<{ to: string[] }>) {
  return body.every((email) => email.to.every((to) => PROVIDER_ADDRESS.test(to)))
    ? { status: 200, json: { data: body.map((_, i) => ({ id: `stub-${calls.length}-${i}` })) } }
    : { status: 422, json: { name: "validation_error", message: "Invalid `to` field (emulated strict batch validation)" } };
}

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
const queued = (): Promise<Array<Record<string, any>>> => t.query(booking.testInspect.inspectEmails, {});
const jobs = (): Promise<Array<Record<string, any>>> => t.query(booking.testInspect.inspectJobs, {});

async function seed() {
  await t.mutation(booking.resources.createResource, {
    id: "resource", organizationId: "org", name: "Room", type: "room", timezone: "Europe/Berlin",
  });
  await t.mutation(booking.public.createEventType, {
    id: "event", slug: "event", title: "Consultation", organizationId: "org",
    lengthInMinutes: 60, slotInterval: 60, timezone: "Europe/Berlin", lockTimeZoneToggle: false,
    locations: [], requiresConfirmation: false,
  });
  await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "resource", eventTypeId: "event" });
}
function create(
  email: string,
  { hour = 0, timezone = "Europe/Berlin", resendOptions = DELIVERY as Record<string, unknown> | null } = {}
) {
  const start = START + hour * 3_600_000;
  return t.mutation(booking.public.createBooking, {
    resourceId: "resource", eventTypeId: "event", start, end: start + 3_600_000,
    timezone, booker: { name: "Ada", email }, location: { type: "address", value: "Room 1" },
    ...(resendOptions ? { resendOptions } : {}),
  });
}
/** A booking stored before 0.5.0 with these values; creating it sends no mail. */
async function createLegacy(values: { bookerEmail?: string; timezone?: string }, hour = 0) {
  const created = await create("ada@example.com", { hour, resendOptions: null });
  await t.mutation(booking.testInspect.storeLegacyValues, { uid: created.uid, ...values });
  return created;
}
const cancelByToken = (created: { uid: string; managementToken: string }, resendOptions: Record<string, unknown> = DELIVERY) =>
  t.mutation(booking.public.cancelBookingByToken, {
    uid: created.uid, token: created.managementToken, reason: "Changed plans", resendOptions,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 8));
  calls = [];
  // Only the batch endpoint answers, from memory; anything else is a test failure.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://api.resend.com/emails/batch") throw new Error(`Unexpected request ${String(input)}`);
    const body = JSON.parse(String(init?.body)) as Array<{ to: string[] }>;
    calls.push({ to: body.flatMap((email) => email.to) });
    const response = strictProvider(body);
    return new Response(JSON.stringify(response.json), { status: response.status, headers: { "Content-Type": "application/json" } });
  });
  for (const method of ["log", "warn", "error", "debug", "info"] as const) vi.spyOn(console, method).mockImplementation(() => {});
  t = setup();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isSendableAddress (exported from @mrfinch/booking/emails)", () => {
  /** 64 + 1 + 189 = 254 characters with `last` = 57, every label at most 63. */
  const longAddress = (last: number) =>
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(last)}.com`;

  test.each([
    "ada@example.com",
    "a+b@sub.example.co.uk",
    "first.last@example.io",
    "o'brien@example.com",
    "guest@my-host.example",
    "guest@123.example",
    `guest@${"a".repeat(63)}.com`, // longest label
    "jürgen@xn--bcher-kva.example", // bücher.example in punycode
    "guest@उदाहरण.परीक्षा", // Devanagari vowel signs are combining marks
    "jürgen@bücher.example",
    "δοκιμή@παράδειγμα.δοκιμή",
    longAddress(57), // 254 characters
  ])("accepts %j", (address) => {
    expect(isSendableAddress(address)).toBe(true);
  });

  test.each([
    "x@", "@x.y", "a b@c.d", "a@b", "", "ada", "a@@example.com", "a@b@example.com",
    "a@.example.com", "a@example..com", "a@example.com.", " ada@example.com", "ada@example.com\n",
    "ada\u0000@example.com", "ada x@example.com", "Ada <ada@example.com>",
    // Domain labels hold letters, digits and inner hyphens only, 1–63 of them.
    "guest@-example.com", "guest@example-.com", "guest@example.-com", "guest@example.com-",
    "guest@example!.com", "guest@exa_mple.com", "guest@exa'mple.com", "guest@example.c%m",
    "guest@[127.0.0.1]", "guest@example.com>", `guest@${"a".repeat(64)}.com`,
    longAddress(58), // 255 characters
  ])("rejects %j", (address) => {
    expect(isSendableAddress(address)).toBe(false);
  });
});

describe("a malformed recipient is skipped before enqueue (N5)", () => {
  const SENDERS = [
    ["sendBookingConfirmation", { start: START, end: END }],
    ["sendBookingPending", { start: START, end: END }],
    ["sendBookingApproved", { start: START, end: END }],
    ["sendBookingDeclined", { start: START, end: END, reason: "Fully booked" }],
    ["sendBookingCancellation", { start: START, end: END, reason: "Changed plans" }],
    ["sendBookingRescheduled", { oldStart: START, oldEnd: END, newStart: START + 86_400_000, newEnd: END + 86_400_000 }],
  ] as const;
  const common = { bookerName: "Ada", eventTitle: "Consultation", timezone: "Europe/Berlin", resendApiKey: DELIVERY.apiKey };

  test.each(SENDERS)("%s returns INVALID_RECIPIENT, queues nothing and logs no address", async (sender, times) => {
    // A renderer that throws proves the skip happens before rendering.
    const { renderer } = await t.run(() => createBookingEmailOptions({ ...DELIVERY, renderer: fixtureApi.renderThrows as BookingEmailRenderer }));
    const result = await t.mutation(booking.emails[sender], { ...common, ...times, to: "guest@invalid", renderer });
    expect(result).toEqual({ success: false, error: "INVALID_RECIPIENT" });
    expect(await queued()).toEqual([]);
    const logs = JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(console.error).mock.calls, vi.mocked(console.log).mock.calls]);
    expect(logs).toContain("Invalid recipient");
    expect(logs).not.toContain("guest@invalid");
    // CONTROL: the same arguments with a sendable address are queued.
    const sent = await t.mutation(booking.emails[sender], { ...common, ...times, to: "guest@valid.example" });
    expect(sent.success).toBe(true);
    expect((await queued()).map((email) => email.to)).toEqual([["guest@valid.example"]]);
  });

  test("a missing API key still takes precedence over the recipient check", async () => {
    const { resendApiKey: _omitted, ...withoutKey } = common;
    await expect(t.mutation(booking.emails.sendBookingConfirmation, {
      ...withoutKey, start: START, end: END, to: "x@",
    })).resolves.toEqual({ success: false, error: "No API key provided" });
  });

  test("createBooking rejects a malformed address and writes nothing (0.5.0)", async () => {
    await seed();
    await expect(create("x@")).rejects.toThrow("Invalid booker email: expected an address such as name@example.com");
    await drainBookingJobs();
    expect(await t.query(booking.public.listBookings, {})).toEqual([]);
    expect(await queued()).toEqual([]);
  });

  test("with a strict provider, a stored malformed booking in the same batch window no longer fails a valid one", async () => {
    await seed();
    const bad = await createLegacy({ bookerEmail: "x@" });
    await cancelByToken(bad); // mails the stored address
    const good = await create("ada@example.com", { hour: 1 });
    expect(good.status).toBe("confirmed");
    await drainBookingJobs();
    const emailJobs = (await jobs()).filter((job) => String(job.name).startsWith("emails:"));
    expect(emailJobs.map((job) => [job.name, job.state.kind])).toEqual([
      ["emails:sendBookingConfirmation", "success"], // the legacy row's creation, without an API key
      ["emails:sendBookingCancellation", "success"],
      ["emails:sendBookingConfirmation", "success"],
    ]);
    await runWorker(1);
    expect(calls).toEqual([{ to: ["ada@example.com"] }]);
    expect((await queued()).map((email) => [email.to, email.status])).toEqual([[["ada@example.com"], "sent"]]);
  });

  test("CONTROL: two valid bookings in one window go out in one batch", async () => {
    await seed();
    await create("bob@example.com");
    await create("ada@example.com", { hour: 1 });
    await drainBookingJobs();
    await runWorker(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].to.sort()).toEqual(["ada@example.com", "bob@example.com"]);
    expect((await queued()).map((email) => email.status)).toEqual(["sent", "sent"]);
  });

  test("CONTROL: an address that bypasses the screen still fails the whole batch at the emulated provider", async () => {
    await t.mutation(booking.testInspect.enqueueUnscreened, { to: "x@" });
    await t.mutation(booking.emails.sendBookingConfirmation, { ...common, start: START, end: END, to: "ada@example.com" });
    await runWorker(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].to.sort()).toEqual(["ada@example.com", "x@"]);
    expect((await queued()).map((email) => email.status)).toEqual(["failed", "failed"]);
  });
});

describe("a stored zone that Intl rejects renders in UTC (N4)", () => {
  test.each(["Mars/Olympus_Mons", ""])("zone %j: createBooking rejects it and writes nothing (0.5.0)", async (timezone) => {
    await seed();
    await expect(create("ada@example.com", { timezone })).rejects.toThrow(`Invalid time zone "${timezone}"`);
    await drainBookingJobs();
    expect(await t.query(booking.public.listBookings, {})).toEqual([]);
    expect(await queued()).toEqual([]);
  });

  test.each(["Mars/Olympus_Mons", ""])("zone %j: a queued confirmation and a stored booking's cancellation render in UTC", async (timezone) => {
    await seed();
    // A confirmation job queued by 0.4.x with the zone, and a booking stored with it.
    await t.mutation(booking.emails.sendBookingConfirmation, {
      to: "bob@example.com", bookerName: "Bob", eventTitle: "Consultation", start: START, end: END, timezone,
      resendApiKey: DELIVERY.apiKey, resendFromEmail: DELIVERY.fromEmail,
    });
    const created = await createLegacy({ timezone });
    await cancelByToken(created);
    await drainBookingJobs();
    const emailJobs = (await jobs()).filter((job) => String(job.name).startsWith("emails:"));
    expect(emailJobs.map((job) => [job.name, job.state.kind])).toEqual([
      ["emails:sendBookingConfirmation", "success"], // the legacy row's creation, without an API key
      ["emails:sendBookingCancellation", "success"],
    ]);
    const mails = await queued();
    expect(mails.map((mail) => mail.subject)).toEqual(["Booking Confirmed: Consultation", "Booking Cancelled: Consultation"]);
    for (const mail of mails) {
      expect(mail.html).toContain("09:00 AM UTC");
      expect(mail.html).not.toContain("GMT");
    }
  });

  test("CONTROL: a valid zone renders in that zone", async () => {
    await seed();
    await create("ada@example.com");
    await drainBookingJobs();
    const [mail] = await queued();
    expect(mail.html).toContain("10:00 AM GMT+1");
    expect(mail.html).not.toContain("UTC");
  });

  test("a custom renderer still receives the stored zone unchanged", async () => {
    await seed();
    const custom = await t.run(() => createBookingEmailOptions({ ...DELIVERY, renderer: fixtureApi.renderContext as BookingEmailRenderer }));
    await cancelByToken(await createLegacy({ timezone: "Mars/Olympus_Mons" }), custom);
    await drainBookingJobs();
    const [mail] = await queued();
    expect((JSON.parse(mail.html) as BookingEmailContext).timezone).toBe("Mars/Olympus_Mons");
  });
});
