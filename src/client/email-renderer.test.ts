/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import {
  anyApi, componentsGeneric, defineSchema, defineTable,
  internalQueryGeneric, queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import resendComponent from "@convex-dev/resend/test";
import bookingComponent from "../test.js";
import {
  bookingEmailContextValidator, bookingEmailResultValidator,
  createBookingEmailOptions,
  type BookingEmailContext, type BookingEmailRenderer, type BookingEmailOptions,
} from "../emails.js";

// These fixtures live only in this .test.ts file. No testing function is part
// of the deployed/published component. The renderer executes as an actual host
// query across the Booking component boundary, using a real Function Handle.
const hostSchema = defineSchema({ branding: defineTable({ name: v.string() }) });
const fixtureApi = anyApi.fixture;
const components = componentsGeneric() as any;
const booking = components.booking;
const START = Date.UTC(2027, 2, 9, 9);
const END = START + 3_600_000;
const RECIPIENT = { to: "guest@example.com", bookerName: "Ada", eventTitle: "Consultation", timezone: "Europe/Berlin" };
const DELIVERY = { apiKey: "re_fixture_not_real", fromEmail: "Host <booking@example.com>", baseUrl: "https://host.example" };

const renderCustom = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async (ctx, args) => {
    const brand = await ctx.db.query("branding").first();
    return { subject: `${brand?.name}: ${args.kind}`, html: JSON.stringify(args), text: `${args.kind} for ${args.bookerName}` };
  },
});
const renderAlternative = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async (_ctx, args) => ({ subject: `Alternative: ${args.kind}`, html: JSON.stringify(args) }),
});
const renderPartial = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async (_ctx, args) => args.kind === "confirmed"
    ? { subject: "Custom confirmation", html: "<p>Welcome</p>" }
    : null,
});
const renderThrows = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async () => { throw new Error("DO-NOT-EXPOSE management-token re_private_key guest@example.com"); },
});
const renderInvalid = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: v.any(),
  handler: async () => ({ subject: "Bad\nBcc: outsider@example.com", html: "SECRET-INVALID-CONTENT", to: "outsider@example.com" }),
});

// Test-only database observers, installed inside the respective isolated
// component, let assertions inspect the real Resend queue and scheduled jobs.
const inspectQueue = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => Promise.all((await ctx.db.query("emails").collect()).map(async (email) => ({
    ...email,
    html: email.html ? new TextDecoder().decode((await ctx.db.get(email.html))?.content) : undefined,
    text: email.text ? new TextDecoder().decode((await ctx.db.get(email.text))?.content) : undefined,
  }))),
});
const inspectJobs = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.db.system.query("_scheduled_functions").collect(),
});
const inspectEmails = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.runQuery(components.resend.testInspect.inspectQueue, {}),
});

function setup() {
  const t = convexTest(hostSchema, {
    "./_generated/api.ts": async () => ({}),
    "./fixture.ts": async () => ({ renderCustom, renderAlternative, renderPartial, renderThrows, renderInvalid }),
  });
  t.registerComponent("booking", bookingComponent.schema, {
    ...bookingComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectJobs, inspectEmails }),
  });
  t.registerComponent("booking/resend", resendComponent.schema, {
    ...resendComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectQueue }),
  });
  return t;
}
type T = ReturnType<typeof setup>;
let t: T;

async function options(rendererName = "renderCustom") {
  return t.run(async () => createBookingEmailOptions({
    ...DELIVERY,
    renderer: fixtureApi[rendererName] as BookingEmailRenderer,
  }));
}

async function queued(): Promise<Array<Record<string, any>>> {
  return t.query(booking.testInspect.inspectEmails, {});
}

// Only drain immediate Booking jobs. Resend's delayed provider worker stays
// queued: these tests inspect real persistent enqueueing, never make network
// requests or substitute a mock for the nested Resend component.
async function drainBookingJobs() {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function seed(requiresConfirmation = false) {
  await t.mutation(booking.resources.createResource, {
    id: "resource", organizationId: "org", name: "Meeting room", type: "room", timezone: "Europe/Berlin",
  });
  await t.mutation(booking.public.createEventType, {
    id: "event", slug: "event", title: "Consultation", organizationId: "org",
    lengthInMinutes: 60, slotInterval: 60, timezone: "Europe/Berlin", lockTimeZoneToggle: false,
    locations: [], requiresConfirmation,
  });
  await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "resource", eventTypeId: "event" });
}

async function create(resendOptions: BookingEmailOptions = DELIVERY, start = START) {
  return t.mutation(booking.public.createBooking, {
    resourceId: "resource", eventTypeId: "event", start, end: start + 3_600_000,
    timezone: "Europe/Berlin", booker: { name: "Ada", email: RECIPIENT.to },
    location: { type: "address", value: "Room 1" }, resendOptions,
  });
}

const SENDERS = [
  ["confirmed", "sendBookingConfirmation", "Booking Confirmed: Consultation"],
  ["pending", "sendBookingPending", "Booking Request Received: Consultation"],
  ["approved", "sendBookingApproved", "Booking Approved: Consultation"],
  ["declined", "sendBookingDeclined", "Booking Request Declined: Consultation"],
  ["cancelled", "sendBookingCancellation", "Booking Cancelled: Consultation"],
  ["rescheduled", "sendBookingRescheduled", "Booking Rescheduled: Consultation"],
] as const;

function legacyArgs(kind: string) {
  return kind === "rescheduled"
    ? { ...RECIPIENT, oldStart: START, oldEnd: END, newStart: START + 86_400_000, newEnd: END + 86_400_000 }
    : { ...RECIPIENT, start: START, end: END };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 8));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Unexpected provider request"); });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  t = setup();
  await t.run(async (ctx) => { await ctx.db.insert("branding", { name: "Host Brand" }); });
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("host email renderers across real component boundaries", () => {
  test.each(SENDERS)("%s uses the host query and enqueues its presentation in nested Resend", async (kind, sender) => {
    const { renderer } = await options();
    expect(renderer).toMatch(/^function:\/\//);
    const result = await t.mutation(booking.emails[sender], { ...legacyArgs(kind), resendApiKey: DELIVERY.apiKey, renderer });
    expect(result.success).toBe(true);
    const emails = await queued();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ subject: `Host Brand: ${kind}`, text: `${kind} for Ada`, to: [RECIPIENT.to] });
    const context = JSON.parse(emails[0].html) as BookingEmailContext;
    expect(context).toMatchObject({ version: 1, kind, bookerName: "Ada", bookerEmail: RECIPIENT.to, eventTitle: "Consultation" });
    expect(Object.keys(context)).not.toEqual(expect.arrayContaining(["apiKey", "resendApiKey", "renderer"]));
    expect(JSON.stringify(context)).not.toContain(DELIVERY.apiKey);
  });

  test.each(SENDERS)("%s preserves old scheduled arguments and the standard template without a renderer", async (kind, sender, subject) => {
    const result = await t.mutation(booking.emails[sender], { ...legacyArgs(kind), resendApiKey: DELIVERY.apiKey });
    expect(result.success).toBe(true);
    const emails = await queued();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe(subject);
    expect(emails[0].html).toContain("Ada");
    expect(emails[0].html).toContain("Consultation");
    expect(emails[0].html).toContain("<!DOCTYPE html>");
  });

  test("a partial renderer opts into one event and returns null for the standard cancellation", async () => {
    const { renderer } = await options("renderPartial");
    await t.mutation(booking.emails.sendBookingConfirmation, { ...legacyArgs("confirmed"), resendApiKey: DELIVERY.apiKey, renderer });
    await t.mutation(booking.emails.sendBookingCancellation, { ...legacyArgs("cancelled"), resendApiKey: DELIVERY.apiKey, renderer });
    const emails = await queued();
    expect(emails.map((mail) => mail.subject)).toEqual(["Custom confirmation", "Booking Cancelled: Consultation"]);
    expect(emails[1].html).toContain("Ada");
  });

  test.each(SENDERS)("%s skips before calling a broken renderer when the API key is absent", async (kind, sender) => {
    const { renderer } = await options("renderThrows");
    await expect(t.mutation(booking.emails[sender], { ...legacyArgs(kind), renderer })).resolves.toEqual({ success: false, error: "No API key provided" });
    expect(await queued()).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  test.each([
    ["renderThrows", "BOOKING_EMAIL_RENDERER_FAILED"],
    ["renderInvalid", "BOOKING_EMAIL_RENDERER_INVALID_RESULT"],
  ])("%s fails visibly without enqueueing a standard fallback or exposing private error details", async (name, code) => {
    const { renderer } = await options(name);
    await expect(t.mutation(booking.emails.sendBookingConfirmation, { ...legacyArgs("confirmed"), resendApiKey: DELIVERY.apiKey, renderer })).rejects.toThrow(code);
    expect(await queued()).toEqual([]);
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain("DO-NOT-EXPOSE");
    expect(logs).not.toContain("SECRET-INVALID-CONTENT");
  });

  test("creation, rescheduling and cancellation carry event snapshots with final management links", async () => {
    await seed();
    const custom = await options();
    const original = await create(custom);
    const moved = await t.mutation(booking.public.rescheduleBookingByToken, {
      uid: original.uid, token: original.managementToken,
      newStart: START + 86_400_000, newEnd: END + 86_400_000, resendOptions: custom,
    });
    const movedBooking = await t.query(booking.public.getBookingByUid, { uid: moved.uid });
    await t.mutation(booking.public.cancelBookingByToken, {
      uid: movedBooking.uid, token: movedBooking.managementToken,
      reason: "Changed plans", resendOptions: custom,
    });
    // All jobs render after later state changes, proving that event data is a
    // snapshot rather than a query of today's cancelled booking state.
    await drainBookingJobs();
    const emails = await queued();
    expect(emails).toHaveLength(3);
    const snapshots = emails.map((mail) => JSON.parse(mail.html) as BookingEmailContext);
    const initial = snapshots.find((snapshot) => snapshot.kind === "confirmed")!;
    const rescheduled = snapshots.find((snapshot) => snapshot.kind === "rescheduled")!;
    const cancelled = snapshots.find((snapshot) => snapshot.kind === "cancelled")!;
    expect(initial).toMatchObject({ bookingUid: original.uid, start: START, end: END, organizationId: "org", eventTypeId: "event", resourceId: "resource" });
    expect(rescheduled).toMatchObject({ bookingUid: movedBooking.uid, previousStart: START, previousEnd: END, start: START + 86_400_000, end: END + 86_400_000 });
    expect(cancelled).toMatchObject({ bookingUid: movedBooking.uid, reason: "Changed plans", start: movedBooking.start });
    for (const snapshot of snapshots) {
      expect(snapshot.notificationId).toBeTruthy();
      expect(snapshot.occurredAt).toBeTypeOf("number");
      for (const [action, link] of Object.entries(snapshot.links!)) {
        const url = new URL(link);
        expect(url.origin).toBe(DELIVERY.baseUrl);
        expect(url.pathname).toBe(`/book/booking/${snapshot.bookingUid}${action === "view" ? "" : `/${action}`}`);
        expect(url.searchParams.get("token")).toBe(snapshot.kind === "confirmed" ? original.managementToken : movedBooking.managementToken);
      }
    }
    expect(new Set(snapshots.map((snapshot) => snapshot.notificationId)).size).toBe(3);
  });

  test("a scheduled renderer failure leaves the committed booking and occupied inventory intact", async () => {
    await seed();
    const original = await create(await options("renderThrows"));
    expect(original.status).toBe("confirmed");
    await drainBookingJobs();
    expect(await queued()).toEqual([]);
    const stored = await t.query(booking.public.getBookingByUid, { uid: original.uid });
    expect(stored.status).toBe("confirmed");
    await expect(create()).rejects.toThrow();
    const jobs = await t.query(booking.testInspect.inspectJobs, {});
    expect(jobs.some((job: any) => job.state.kind === "failed")).toBe(true);
    const diagnostics = vi.mocked(console.error).mock.calls.map((entry) => entry.map(String).join(" ")).join("\n");
    expect(diagnostics).toContain("BOOKING_EMAIL_RENDERER_FAILED");
    expect(diagnostics).not.toContain("DO-NOT-EXPOSE");
    expect(JSON.stringify(jobs)).not.toContain("DO-NOT-EXPOSE");
  });

  test("renderer selection is per operation and cannot leak into an operation that omits it", async () => {
    await seed();
    await create(await options());
    await create(await options("renderAlternative"), START + 3_600_000);
    await create(DELIVERY, START + 7_200_000);
    await drainBookingJobs();
    expect((await queued()).map((mail) => mail.subject)).toEqual([
      "Host Brand: confirmed", "Alternative: confirmed", "Booking Confirmed: Consultation",
    ]);
  });

  test("reprocessing one snapshot deduplicates in Resend, while distinct events remain distinct", async () => {
    const { renderer } = await options();
    const emailContext: BookingEmailContext = {
      version: 1, kind: "confirmed", notificationId: "notification-one", occurredAt: Date.now(),
      bookerName: "Ada", bookerEmail: RECIPIENT.to, eventTitle: "Consultation", start: START, end: END, timezone: "Europe/Berlin",
    };
    const args = { ...legacyArgs("confirmed"), resendApiKey: DELIVERY.apiKey, renderer, emailContext };
    const first = await t.mutation(booking.emails.sendBookingConfirmation, args);
    const repeated = await t.mutation(booking.emails.sendBookingConfirmation, args);
    const separate = await t.mutation(booking.emails.sendBookingConfirmation, { ...args, emailContext: { ...emailContext, notificationId: "notification-two" } });
    expect(repeated.emailId).toBe(first.emailId);
    expect(separate.emailId).not.toBe(first.emailId);
    expect(await queued()).toHaveLength(2);
  });

  test.each(["confirmed", "declined"])("pending -> %s propagates the renderer through the administrative state transition", async (toStatus) => {
    await seed(true);
    const custom = await options();
    const pending = await create(custom);
    expect(pending.status).toBe("pending");
    await t.mutation(booking.hooks.transitionBookingState, {
      bookingId: pending._id, toStatus, reason: "Admin decision", resendOptions: custom,
    });
    await drainBookingJobs();
    const snapshots = (await queued()).map((mail) => JSON.parse(mail.html) as BookingEmailContext);
    expect(snapshots.map((snapshot) => snapshot.kind)).toEqual(["pending", toStatus === "confirmed" ? "approved" : "declined"]);
    expect(snapshots[1]).toMatchObject({ bookingUid: pending.uid, reason: "Admin decision", start: START, end: END });
    expect(snapshots[1].links?.view).toContain(encodeURIComponent(pending.managementToken));
  });

  test("a provisional hold sends nothing until confirmation, then renders a confirmation rather than an approval", async () => {
    await seed();
    const hold = await t.mutation(booking.public.createProvisionalBooking, {
      resourceId: "resource", eventTypeId: "event", start: START, end: END,
      timezone: "Europe/Berlin", booker: { name: "Ada", email: RECIPIENT.to }, location: { type: "address", value: "Room 1" },
    });
    await drainBookingJobs();
    expect(await queued()).toEqual([]);
    await t.mutation(booking.hooks.transitionBookingState, {
      bookingId: hold._id, toStatus: "confirmed", resendOptions: await options(),
    });
    await drainBookingJobs();
    const emails = await queued();
    expect(emails).toHaveLength(1);
    expect(JSON.parse(emails[0].html)).toMatchObject({ kind: "confirmed", bookingUid: hold.uid, start: START, end: END });
  });

  test("a multi-resource bundle renders creation and cancellation once for the whole booking", async () => {
    await seed();
    await t.mutation(booking.resources.createResource, {
      id: "cameras", organizationId: "org", name: "Camera pool", type: "equipment", timezone: "Europe/Berlin", isFungible: true, quantity: 4,
    });
    await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "cameras", eventTypeId: "event" });
    const custom = await options();
    const bundle = await t.mutation(booking.multi_resource.createMultiResourceBooking, {
      eventTypeId: "event", organizationId: "org", resources: [{ resourceId: "resource" }, { resourceId: "cameras", quantity: 2 }],
      start: START, end: END, timezone: "Europe/Berlin", booker: { name: "Ada", email: RECIPIENT.to },
      location: { type: "address", value: "Room 1" }, resendOptions: custom,
    });
    await t.mutation(booking.multi_resource.cancelMultiResourceBooking, {
      bookingId: bundle._id, reason: "Bundle cancelled", resendOptions: custom,
    });
    await drainBookingJobs();
    const snapshots = (await queued()).map((mail) => JSON.parse(mail.html) as BookingEmailContext);
    expect(snapshots.map((snapshot) => snapshot.kind)).toEqual(["confirmed", "cancelled"]);
    expect(snapshots[1]).toMatchObject({ bookingUid: bundle.uid, organizationId: "org", reason: "Bundle cancelled" });
    const availability = await t.query(booking.multi_resource.checkMultiResourceAvailability, {
      resources: [{ resourceId: "resource" }, { resourceId: "cameras", quantity: 4 }], start: START, end: END,
    });
    expect(availability.available).toBe(true);
  });

  test.each(["invalid-handle", ""])("invalid renderer handle %j fails explicitly without emitting fallback mail", async (renderer) => {
    await expect(t.mutation(booking.emails.sendBookingConfirmation, {
      ...legacyArgs("confirmed"), resendApiKey: DELIVERY.apiKey, renderer,
    })).rejects.toThrow("BOOKING_EMAIL_RENDERER_FAILED");
    expect(await queued()).toEqual([]);
  });
});
