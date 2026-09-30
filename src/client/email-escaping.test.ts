/// <reference types="vite/client" />
/**
 * F2 through the real queue: host app + booking component + nested
 * booking/resend, the same harness as email-renderer.test.ts. Only Booking's
 * immediate jobs are drained, Resend's provider worker never runs and fetch
 * throws. Queued HTML is parsed with happy-dom's DOMParser, so the assertions
 * are about elements, not substrings.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import {
  anyApi, componentsGeneric, defineSchema, defineTable, internalQueryGeneric,
  makeFunctionReference, mutationGeneric, queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import { Window } from "happy-dom";
import resendComponent from "@convex-dev/resend/test";
import bookingComponent from "../test.js";
import {
  assertValidRenderedBookingEmail, bookingEmailContextValidator, bookingEmailResultValidator,
  createBookingEmailOptions, type BookingEmailContext, type BookingEmailRenderer,
} from "../emails.js";
import { bookingEmailLinks } from "../component/emails/context.js";

const hostSchema = defineSchema({ unused: defineTable({ x: v.string() }) });
const fixtureApi = anyApi.fixture;
const components = componentsGeneric() as any;
const booking = components.booking;
const START = Date.UTC(2027, 2, 9, 9);
const END = START + 3_600_000;
const DELIVERY = { apiKey: "re_fixture_not_real", fromEmail: "Host <booking@host.example>", baseUrl: "https://host.example" };
// Fits the reference host's 120-character name limit; the open comment would
// hide everything after it if it were parsed as markup.
const NAME = '<a id="inj" href="https://evil.example/pay">Invoice overdue - pay now</a><!--';
const REASON = '<a id="inj" href="https://evil.example/refund">Claim your refund</a>';

const renderContext = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async (_ctx, args) => ({ subject: `Custom: ${args.kind}`, html: JSON.stringify(args) }),
});
const renderNull = internalQueryGeneric({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: async () => null,
});

const inspectQueue = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => Promise.all((await ctx.db.query("emails").collect()).map(async (email) => ({
    ...email,
    html: email.html ? new TextDecoder().decode((await ctx.db.get(email.html))?.content) : undefined,
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
// Schedules an email job by name, as a job queued by an earlier release is stored.
const replay = mutationGeneric({
  args: { name: v.string(), args: v.any() }, returns: v.null(),
  handler: async (ctx, { name, args }) => {
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">(name), args);
    return null;
  },
});

function setup() {
  const t = convexTest(hostSchema, {
    "./_generated/api.ts": async () => ({}),
    "./fixture.ts": async () => ({ renderContext, renderNull }),
  });
  t.registerComponent("booking", bookingComponent.schema, {
    ...bookingComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectJobs, inspectEmails, replay }),
  });
  t.registerComponent("booking/resend", resendComponent.schema, {
    ...resendComponent.modules,
    "./component/testInspect.ts": async () => ({ inspectQueue }),
  });
  return t;
}
let t: ReturnType<typeof setup>;

const window = new Window();
afterAll(() => window.happyDOM.close());
function parse(html: string) {
  return new window.DOMParser().parseFromString(html, "text/html");
}
type Doc = ReturnType<typeof parse>;
const text = (doc: Doc, selector: string) => doc.querySelector(selector)?.textContent;
const hrefs = (doc: Doc) => [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));

async function drainBookingJobs() {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
}
const queued = (): Promise<Array<Record<string, any>>> => t.query(booking.testInspect.inspectEmails, {});
const jobs = (): Promise<Array<Record<string, any>>> => t.query(booking.testInspect.inspectJobs, {});

async function seed({ title = "Consultation", requiresConfirmation = false } = {}) {
  await t.mutation(booking.resources.createResource, {
    id: "resource", organizationId: "org", name: "Room", type: "room", timezone: "Europe/Berlin",
  });
  await t.mutation(booking.public.createEventType, {
    id: "event", slug: "event", title, organizationId: "org",
    lengthInMinutes: 60, slotInterval: 60, timezone: "Europe/Berlin", lockTimeZoneToggle: false,
    locations: [], requiresConfirmation,
  });
  await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "resource", eventTypeId: "event" });
}
function create(name: string, email: string, resendOptions: Record<string, unknown> = DELIVERY) {
  return t.mutation(booking.public.createBooking, {
    resourceId: "resource", eventTypeId: "event", start: START, end: END,
    timezone: "Europe/Berlin", booker: { name, email }, location: { type: "address", value: "Room 1" }, resendOptions,
  });
}
function managementHrefs(uid: string, token: string) {
  const links = bookingEmailLinks(uid, token, DELIVERY.baseUrl)!;
  return [links.view, links.reschedule, links.cancel];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 8));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Unexpected provider request"); });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  t = setup();
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lifecycle mail escapes booking text end to end", () => {
  test("a markup name to a third-party address, then a token cancel with a markup reason", async () => {
    await seed();
    const created = await create(NAME, "victim@third-party.example");
    await drainBookingJobs();
    const [confirmation] = await queued();
    expect(confirmation).toMatchObject({ to: ["victim@third-party.example"], subject: "Booking Confirmed: Consultation" });
    const doc = parse(confirmation.html);
    expect(doc.querySelector("#inj")).toBeNull();
    expect(text(doc, ".greeting")).toBe(`Hi ${NAME},`);
    // The open comment hides nothing: details and every management link remain.
    expect(text(doc, ".event-title")).toBe("Consultation");
    expect(hrefs(doc)).toEqual(managementHrefs(created.uid, created.managementToken));

    await t.mutation(booking.public.cancelBookingByToken, {
      uid: created.uid, token: created.managementToken, reason: REASON, resendOptions: DELIVERY,
    });
    await drainBookingJobs();
    const cancellation = (await queued()).find((mail) => mail.subject === "Booking Cancelled: Consultation")!;
    const cancelled = parse(cancellation.html);
    expect(cancelled.querySelector("#inj")).toBeNull();
    expect(text(cancelled, ".reason")).toBe(`Reason: ${REASON}`);
    expect(text(cancelled, ".greeting")).toBe(`Hi ${NAME},`);
  });

  test("CONTROL: a benign booking keeps its three management links", async () => {
    await seed();
    const created = await create("Ada", "ada@example.com");
    await drainBookingJobs();
    const doc = parse((await queued())[0].html);
    expect(text(doc, ".greeting")).toBe("Hi Ada,");
    expect(hrefs(doc)).toEqual(managementHrefs(created.uid, created.managementToken));
  });

  test("an administrative decline escapes the reason", async () => {
    await seed({ requiresConfirmation: true });
    const pending = await create("Ada", "ada@example.com");
    await t.mutation(booking.hooks.transitionBookingState, {
      bookingId: pending._id, toStatus: "declined", reason: REASON, resendOptions: DELIVERY,
    });
    await drainBookingJobs();
    const declined = (await queued()).find((mail) => mail.subject === "Booking Request Declined: Consultation")!;
    const doc = parse(declined.html);
    expect(doc.querySelector("#inj")).toBeNull();
    expect(text(doc, ".reason")).toBe(`Reason: ${REASON}`);
  });

  test("renderer-null and no renderer produce the same escaped default", async () => {
    const { renderer } = await t.run(() => createBookingEmailOptions({ ...DELIVERY, renderer: fixtureApi.renderNull as BookingEmailRenderer }));
    const args = {
      to: "ada@example.com", bookerName: NAME, eventTitle: "Consultation", start: START, end: END, timezone: "Europe/Berlin",
      bookingUid: "bk_1_abc", managementToken: "tok", baseUrl: DELIVERY.baseUrl, resendApiKey: DELIVERY.apiKey,
    };
    await t.mutation(booking.emails.sendBookingConfirmation, args);
    await t.mutation(booking.emails.sendBookingConfirmation, { ...args, renderer });
    const [plain, viaNull] = await queued();
    expect(viaNull.html).toBe(plain.html);
    expect(parse(plain.html).querySelector("#inj")).toBeNull();
    expect(text(parse(plain.html), ".greeting")).toBe(`Hi ${NAME},`);
  });

  test("a custom renderer still receives raw booking text and unescaped links", async () => {
    await seed();
    const custom = await t.run(() => createBookingEmailOptions({ ...DELIVERY, renderer: fixtureApi.renderContext as BookingEmailRenderer }));
    const created = await create(NAME, "ada@example.com", custom);
    await t.mutation(booking.public.cancelBookingByToken, {
      uid: created.uid, token: created.managementToken, reason: REASON, resendOptions: custom,
    });
    await drainBookingJobs();
    const contexts = (await queued()).map((mail) => JSON.parse(mail.html) as BookingEmailContext);
    expect(contexts.map((context) => context.kind)).toEqual(["confirmed", "cancelled"]);
    expect(contexts[0]).toMatchObject({ bookerName: NAME, links: bookingEmailLinks(created.uid, created.managementToken, DELIVERY.baseUrl) });
    expect(contexts[1]).toMatchObject({ bookerName: NAME, reason: REASON });
  });
});

describe("management links in the default mail come from bookingEmailLinks", () => {
  const args = {
    to: "ada@example.com", bookerName: "Ada", eventTitle: "Consultation", start: START, end: END,
    timezone: "Europe/Berlin", resendApiKey: DELIVERY.apiKey,
  };
  const SPECIAL = "a/b?c#d&e\"f'g h+ü";

  test.each([
    ["canonical", "https://host.example", "bk_1_abc", "tok"],
    ["trailing slash", "https://host.example/", "bk_1_abc", "tok"],
    ["special uid", "https://host.example", SPECIAL, "tok"],
    ["special token", "https://host.example", "bk_1_abc", SPECIAL],
    ["quote in baseUrl", 'https://host.example/x" data-inj="1', "bk_1_abc", "tok"],
  ])("%s: hrefs equal bookingEmailLinks and parse as URLs", async (_, baseUrl, bookingUid, managementToken) => {
    await t.mutation(booking.emails.sendBookingConfirmation, { ...args, baseUrl, bookingUid, managementToken });
    const doc = parse((await queued())[0].html);
    const links = bookingEmailLinks(bookingUid, managementToken, baseUrl)!;
    expect(hrefs(doc)).toEqual([links.view, links.reschedule, links.cancel]);
    expect(doc.querySelector("[data-inj]")).toBeNull();
    for (const href of hrefs(doc)) {
      const url = new URL(href!);
      expect(url.searchParams.get("token")).toBe(managementToken);
      expect(url.pathname).not.toContain("//");
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  test.each([
    ["javascript:", "javascript:alert(1)//"],
    ["credentials", "https://user:pass@host.example"],
    ["scheme-less", "host.example"],
  ])("%s baseUrl: no buttons, the contact text instead, and a warning without the URL", async (_, baseUrl) => {
    const result = await t.mutation(booking.emails.sendBookingConfirmation, { ...args, baseUrl, bookingUid: "bk_1_abc", managementToken: "tok" });
    expect(result.success).toBe(true);
    const doc = parse((await queued())[0].html);
    expect(doc.querySelectorAll("a")).toHaveLength(0);
    expect(text(doc, ".help-text")).toBe("If you need to make changes to your booking, please contact us.");
    const warnings = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(warnings).toContain("management links omitted");
    expect(warnings).not.toContain(baseUrl);
    expect(warnings).not.toContain("tok");
  });
});

describe("default subjects", () => {
  test("a CR/LF event title gives a one-line subject within the renderer limits", async () => {
    await seed({ title: "Consultation\r\nBcc: outsider@example.com\0" });
    await create("Ada", "ada@example.com");
    await drainBookingJobs();
    const [mail] = await queued();
    expect(mail.subject).toBe("Booking Confirmed: Consultation Bcc: outsider@example.com");
    expect(() => assertValidRenderedBookingEmail({ subject: mail.subject, html: mail.html })).not.toThrow();
  });

  test("a long event title is capped at 200 characters without splitting an emoji", async () => {
    const prefix = "Booking Confirmed: ";
    const title = "x".repeat(200 - prefix.length - 1) + "🙂".repeat(10);
    await t.mutation(booking.emails.sendBookingConfirmation, {
      to: "ada@example.com", bookerName: "Ada", eventTitle: title, start: START, end: END,
      timezone: "Europe/Berlin", resendApiKey: DELIVERY.apiKey,
    });
    const [mail] = await queued();
    expect(mail.subject).toBe(`${prefix}${"x".repeat(200 - prefix.length - 1)}`);
    // CONTROL: the title really crosses the limit inside a surrogate pair.
    expect(`${prefix}${title}`.slice(0, 200)).toMatch(/[\uD800-\uDBFF]$/);
  });

  test("legacy createReservation mail keeps its greeting and subject", async () => {
    await seed();
    await t.mutation(booking.public.createReservation, {
      resourceId: "resource", actorId: "legacy@example.com", start: START, end: END, resendOptions: DELIVERY,
    });
    await drainBookingJobs();
    const [mail] = await queued();
    expect(mail).toMatchObject({ to: ["legacy@example.com"], subject: "Booking Confirmed: Your Booking" });
    expect(text(parse(mail.html), ".greeting")).toBe("Hi Guest,");
  });
});

describe("jobs queued by 0.4.2 still run", () => {
  // Arguments as 0.4.2 schedules them (captured from its hooks), with a markup
  // name. Tokens are shortened; key sets and value types are unchanged.
  const TOKEN = "o2ylu79es0ae9jjq3ir21opsqbi9sdjdti5b6xpc0vhjgn0p0c8w0";
  const uid = "bk_1803888000000_m0ne5entr";
  const links = {
    cancel: `https://host.example/book/booking/${uid}/cancel?token=${TOKEN}`,
    reschedule: `https://host.example/book/booking/${uid}/reschedule?token=${TOKEN}`,
    view: `https://host.example/book/booking/${uid}?token=${TOKEN}`,
  };
  const context = {
    bookerEmail: "ada@example.com", bookerName: NAME, bookingId: "000000000000000000010006bookings", bookingUid: uid,
    end: 1804586400000, eventTitle: "Consultation", eventTypeId: "e1", links, location: { type: "address", value: "Room 1" },
    notificationId: "booking-email:1803888000000:rc82boq3jcs:70us0fprg5", occurredAt: 1803888000000,
    organizationId: "org", resourceId: "r-e1", start: 1804582800000, timezone: "Europe/Berlin", version: 1,
  };
  const delivery = { resendApiKey: "re_fixture_not_real", resendFromEmail: "Host <booking@host.example>" };
  const flat = { bookerName: NAME, eventTitle: "Consultation", timezone: "Europe/Berlin", to: "ada@example.com", ...delivery };
  const withLinks = { baseUrl: "https://host.example", bookingUid: uid, managementToken: TOKEN };
  const QUEUED_0_4_2 = [
    ["emails:sendBookingConfirmation", { ...flat, ...withLinks, start: 1804582800000, end: 1804586400000, resourceId: "r-e1", emailContext: { ...context, kind: "confirmed" } }, 3],
    ["emails:sendBookingPending", { ...flat, ...withLinks, start: 1804582800000, end: 1804586400000, emailContext: { ...context, kind: "pending", eventTypeId: "e2", resourceId: "r-e2" } }, 2],
    ["emails:sendBookingApproved", { ...flat, ...withLinks, start: 1804582800000, end: 1804586400000, emailContext: { ...context, kind: "approved", eventTypeId: "e2", resourceId: "r-e2" } }, 3],
    ["emails:sendBookingDeclined", { ...flat, start: 1804590000000, end: 1804593600000, reason: REASON, emailContext: { ...context, kind: "declined", reason: REASON } }, 0],
    ["emails:sendBookingCancellation", { ...flat, start: 1804590000000, end: 1804593600000, reason: REASON, emailContext: { ...context, kind: "cancelled", reason: REASON } }, 0],
    ["emails:sendBookingRescheduled", {
      ...flat, ...withLinks, oldStart: 1804582800000, oldEnd: 1804586400000, newStart: 1804669200000, newEnd: 1804672800000,
      emailContext: { ...context, kind: "rescheduled", previousStart: 1804582800000, previousEnd: 1804586400000, start: 1804669200000, end: 1804672800000 },
    }, 3],
  ] as const;

  test.each(QUEUED_0_4_2)("%s passes validation and renders escaped HTML", async (name, args, anchors) => {
    await t.mutation(booking.testInspect.replay, { name, args });
    await drainBookingJobs();
    const job = (await jobs()).find((entry) => entry.name === name)!;
    expect(job.state.kind).toBe("success");
    const [mail] = await queued();
    const doc = parse(mail.html);
    expect(doc.querySelector("#inj")).toBeNull();
    expect(text(doc, ".greeting")).toBe(`Hi ${NAME},`);
    expect(doc.querySelectorAll("a")).toHaveLength(anchors);
    if (anchors) expect(hrefs(doc)[0]).toBe(links.view);
    if ("reason" in args) expect(text(doc, ".reason")).toBe(`Reason: ${REASON}`);
  });
});
