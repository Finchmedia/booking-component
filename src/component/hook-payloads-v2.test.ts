/// <reference types="vite/client" />
/**
 * Hook payloads, version 2 (N7, decision D16).
 *
 * A hook's handle runs with the payload as its arguments, so a handler with
 * an args validator accepts exactly one key set. Version 1 payloads differ per
 * emitter and stay frozen (hook-payloads-v1.test.ts). A hook registered with
 * `payloadVersion: 2` receives `bookingHookEventV2` instead: one envelope per
 * event name, whichever function emitted it, built from the written booking
 * and without the management token.
 *
 * The handlers below are real functions invoked through real function handles
 * (as in the ar-skeptic HS-1 probe): a handler whose args are the exported
 * validator must succeed for every emitter of every event, while a strict v1
 * handler keeps its 0.4.x behaviour. docs/hook-payloads-v2.md is rendered
 * from the validator at the end.
 */
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { createFunctionHandle, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { internalMutation } from "./_generated/server.js";
import { bookingHookEventV2, type BookingHookEventV2 } from "../shared/hook-events-v2.js";
import {
  BOOKER,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  drain,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

// ============================================
// HANDLERS (addressed as "hook-payloads-v2.test:<name>")
// ============================================

/** A host handler that validates every delivery against the exported validator. */
export const strictV2 = internalMutation({
  args: bookingHookEventV2,
  returns: v.null(),
  handler: async () => null,
});

/** A host handler written against createBooking's v1 `booking.created` payload (HS-1). */
export const strictV1Created = internalMutation({
  args: {
    bookingId: v.string(), resourceId: v.string(), eventTypeId: v.string(), start: v.number(), end: v.number(),
    timezone: v.string(), status: v.string(), bookerName: v.string(), bookerEmail: v.string(),
    eventTitle: v.string(), uid: v.string(), managementToken: v.string(),
  },
  returns: v.null(),
  handler: async () => null,
});

/** No validator: accepts anything. */
export const looseAny = internalMutation({ args: v.any(), returns: v.null(), handler: async () => null });

type Handler = "strictV2" | "strictV1Created" | "looseAny";
type Run = { handler: Handler; args: Record<string, unknown>; state: string };

const handleFor = (t: T, name: Handler) =>
  t.run(async () => await createFunctionHandle(makeFunctionReference<"mutation">(`hook-payloads-v2.test:${name}`)));

async function register(t: T, name: Handler, eventType: string, extra: { payloadVersion?: 2; organizationId?: string } = {}) {
  return await t.mutation(api.hooks.registerHook, { eventType, functionHandle: await handleFor(t, name), ...extra });
}

/** The handler runs so far, in scheduling order. */
async function runs(t: T): Promise<Run[]> {
  const jobs = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())) as unknown as Array<{
    name: string; args: unknown[]; state: { kind: string };
  }>;
  return jobs
    .filter((job) => job.name.includes("hook-payloads-v2.test"))
    .map((job) => ({
      handler: job.name.split(":").pop() as Handler,
      args: job.args[0] as Record<string, unknown>,
      state: job.state.kind,
    }));
}

// ============================================
// FIXTURE
// ============================================

const at = (time: string) => utc(TUESDAY, time);
const HOUR = 3_600_000;
const BOOKING_EVENTS = [
  "booking.created", "booking.pending", "booking.confirmed", "booking.declined",
  "booking.cancelled", "booking.completed", "booking.rescheduled",
];

async function seedWorld(t: T) {
  const seed = await seedResource(t); // res-1 + et-1, organization org-1
  await seedFungibleResource(t, { eventTypeId: seed.eventTypeId }); // pool-1
  const approval = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-approval", requiresConfirmation: true });
  await t.mutation(api.public.createEventType, {
    id: "et-no-org", slug: "et-no-org", title: "No organization", lengthInMinutes: 60, timezone: "UTC",
    lockTimeZoneToggle: false, locations: [],
  });
  await t.mutation(api.resource_event_types.setResourcesForEventType, {
    eventTypeId: "et-no-org", resourceIds: [seed.resourceId, "pool-1"],
  });
  const single = (time: string) => book(t, seed, at(time), at(time) + HOUR);
  const pending = (time: string) => book(t, approval, at(time), at(time) + HOUR);
  const bundle = (time: string, eventTypeId = seed.eventTypeId) =>
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId, resources: [{ resourceId: seed.resourceId }, { resourceId: "pool-1", quantity: 2 }],
      start: at(time), end: at(time) + HOUR, timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
  const legacy = async (time: string) => {
    const bookingId = await t.mutation(api.public.createReservation, {
      resourceId: seed.resourceId, actorId: BOOKER.email, start: at(time), end: at(time) + HOUR,
    });
    return (await t.query(api.public.getBooking, { bookingId }))!;
  };
  const provisional = (time: string) =>
    t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: at(time), end: at(time) + HOUR,
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
  return { seed, single, pending, bundle, legacy, provisional };
}

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // Failing handler runs (the v1 control) are logged by the scheduler.
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

// ============================================
// TESTS
// ============================================

describe("a handler whose args are bookingHookEventV2", () => {
  test("succeeds for every emitter of every event, with the documented values", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    const tokens: string[] = [];
    const keep = <B extends Doc<"bookings">>(booking: B) => {
      if (booking.managementToken) tokens.push(booking.managementToken);
      return booking;
    };
    // Bookings the later calls act on, created before any hook is registered.
    const held = keep(await world.provisional("12:00"));
    const held2 = keep(await world.provisional("13:00"));
    const request2 = keep(await world.pending("09:00"));
    const request3 = keep(await world.pending("10:00"));
    const [a, b] = [keep(await world.single("14:00")), keep(await world.single("15:00"))];
    const [c1, c2, c3] = [keep(await world.single("16:00")), keep(await world.single("17:00")), keep(await world.single("18:00"))];
    await drain(t); // their own booking.created events run before the hooks exist

    for (const event of BOOKING_EVENTS) await register(t, "strictV2", event, { payloadVersion: 2 });

    // Every emitter once. Each call's delivery is captured right after it,
    // with the values it must carry (undefined: the key is left out).
    const deliveries: Array<{ call: string; values: Partial<BookingHookEventV2>; run: Run }> = [];
    const emit = async <R,>(call: string, values: Partial<BookingHookEventV2>, run: () => Promise<R>): Promise<R> => {
      const before = (await runs(t)).length;
      const result = await run();
      await drain(t);
      const fresh = (await runs(t)).slice(before);
      expect({ call, handlers: fresh.map((r) => r.handler) }).toEqual({ call, handlers: ["strictV2"] });
      deliveries.push({ call, values, run: fresh[0] });
      return result;
    };
    const created = { event: "booking.created", previousStatus: undefined, reason: undefined } as const;

    const single = keep(await emit("createBooking",
      { ...created, status: "confirmed", changedBy: "system", isMultiResource: false, resourceIds: ["res-1"] },
      () => world.single("08:00")));
    const request = keep(await emit("createBooking (requires confirmation)",
      { ...created, status: "pending", changedBy: "system" },
      () => world.pending("08:00")));
    const bundle = keep(await emit("createMultiResourceBooking",
      { ...created, status: "confirmed", changedBy: "system", isMultiResource: true, resourceIds: ["res-1", "pool-1"], organizationId: ORG },
      () => world.bundle("09:00")));
    const orgless = keep(await emit("createMultiResourceBooking (no organization)",
      { ...created, organizationId: undefined, changedBy: "system" },
      () => world.bundle("10:00", "et-no-org")));
    const legacy = await emit("createReservation",
      { ...created, eventTypeId: "legacy", organizationId: undefined, changedBy: undefined, isMultiResource: false },
      () => world.legacy("11:00"));

    await emit("transition provisional -> pending", { event: "booking.pending", status: "pending", previousStatus: "provisional" },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: held._id, toStatus: "pending" }));
    await emit("transition pending -> confirmed", { event: "booking.confirmed", status: "confirmed", previousStatus: "pending", changedBy: "admin" },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: request._id, toStatus: "confirmed", changedBy: "admin" }));
    await emit("transition provisional -> confirmed", { event: "booking.confirmed", status: "confirmed", previousStatus: "provisional", changedBy: undefined },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: held2._id, toStatus: "confirmed" }));
    await emit("transition pending -> declined", { event: "booking.declined", status: "declined", previousStatus: "pending", reason: "full" },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: request2._id, toStatus: "declined", reason: "full" }));
    await emit("transition pending -> cancelled", { event: "booking.cancelled", status: "cancelled", previousStatus: "pending" },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: request3._id, toStatus: "cancelled" }));
    await emit("transition confirmed -> completed", { event: "booking.completed", status: "completed", previousStatus: "confirmed" },
      () => t.mutation(api.hooks.transitionBookingState, { bookingId: single._id, toStatus: "completed" }));

    // Moves: single, bundle and legacy row, by ID and by token.
    await emit("rescheduleBooking", {
      event: "booking.rescheduled", status: "confirmed", previousStatus: undefined, reason: "Rescheduled to new time",
      changedBy: "system", previousStart: a.start, previousEnd: a.end, originalBookingId: a._id, start: a.start + 8 * HOUR,
    }, () => t.mutation(api.public.rescheduleBooking, { bookingId: a._id, newStart: a.start + 8 * HOUR, newEnd: a.end + 8 * HOUR }));
    await emit("rescheduleBookingByToken", { event: "booking.rescheduled", reason: "Rescheduled to new time", changedBy: "system" },
      () => t.mutation(api.public.rescheduleBookingByToken, {
        uid: b.uid, token: b.managementToken!, newStart: b.start + 8 * HOUR, newEnd: b.end + 8 * HOUR,
      }));
    await emit("rescheduleBooking (bundle)", {
      event: "booking.rescheduled", isMultiResource: true, resourceIds: ["res-1", "pool-1"], reason: "moved", changedBy: "admin",
    }, () => t.mutation(api.public.rescheduleBooking, {
      bookingId: bundle._id, newStart: bundle.start + 12 * HOUR, newEnd: bundle.end + 12 * HOUR, reason: "moved", changedBy: "admin",
    }));
    await emit("rescheduleBooking (legacy row)", { event: "booking.rescheduled", eventTypeId: "legacy", organizationId: undefined },
      () => t.mutation(api.public.rescheduleBooking, { bookingId: legacy._id, newStart: legacy.start + 13 * HOUR, newEnd: legacy.end + 13 * HOUR }));

    // The four cancel paths.
    await emit("cancelReservation", { event: "booking.cancelled", status: "cancelled", previousStatus: "confirmed", reason: undefined, changedBy: "unknown" },
      () => t.mutation(api.public.cancelReservation, { reservationId: c1._id }));
    await emit("cancelBookingByToken", {
      event: "booking.cancelled", status: "cancelled", previousStatus: "confirmed", reason: "Cancelled by booker", changedBy: "user",
    }, () => t.mutation(api.public.cancelBookingByToken, { uid: c2.uid, token: c2.managementToken! }));
    await emit("cancelMultiResourceBooking (a single booking)", {
      event: "booking.cancelled", isMultiResource: false, reason: "r", changedBy: "admin",
    }, () => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: c3._id, reason: "r", cancelledBy: "admin" }));
    await emit("cancelMultiResourceBooking (bundle)", {
      event: "booking.cancelled", isMultiResource: true, resourceIds: ["res-1", "pool-1"], organizationId: undefined, changedBy: "unknown",
    }, () => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: orgless._id }));

    // Every event name was emitted, and every delivery passed the validator.
    expect(new Set(deliveries.map((d) => d.values.event))).toEqual(new Set(BOOKING_EVENTS));
    for (const { call, values, run } of deliveries) {
      expect({ call, state: run.state }).toEqual({ call, state: "success" });
      const present = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
      expect({ call, args: run.args }).toEqual({ call, args: expect.objectContaining({ version: 2, ...present }) });
      for (const key of Object.keys(values).filter((key) => !(key in present))) {
        expect({ call, key, present: key in run.args }).toEqual({ call, key, present: false });
      }
      // A rescheduled payload names the new booking twice; other events have no rescheduled fields.
      if (run.args.event === "booking.rescheduled") expect(run.args.newBookingId).toBe(run.args.bookingId);
      else expect(Object.keys(run.args).filter((key) => key.startsWith("original") || key.startsWith("new"))).toEqual([]);
    }
    // Never the management token, under any key.
    expect(tokens.length).toBeGreaterThan(10);
    const text = JSON.stringify(deliveries.map((d) => d.run.args));
    expect(text).not.toContain("managementToken");
    for (const token of tokens) expect(text).not.toContain(token);
  });

  test("createBooking: the complete envelope", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    await register(t, "strictV2", "booking.created", { payloadVersion: 2 });
    const booking = await world.single("08:00");
    await drain(t);
    const [delivered] = await runs(t);
    expect(delivered).toEqual({
      handler: "strictV2",
      state: "success",
      args: {
        event: "booking.created",
        version: 2,
        bookingId: booking._id,
        uid: booking.uid,
        organizationId: ORG,
        resourceId: "res-1",
        resourceIds: ["res-1"],
        eventTypeId: "et-1",
        status: "confirmed",
        start: at("08:00"),
        end: at("09:00"),
        timezone: "Europe/Berlin",
        bookerName: BOOKER.name,
        bookerEmail: BOOKER.email,
        eventTitle: "Consultation",
        changedBy: "system",
        isMultiResource: false,
      },
    });
  });
});

describe("version 1 stays as it was", () => {
  test("HS-1: a strict v1 handler still succeeds for createBooking and fails for the bundle and legacy emitters", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    await register(t, "strictV1Created", "booking.created");
    await register(t, "looseAny", "booking.created");
    await world.single("08:00");
    await world.bundle("09:00");
    await world.legacy("10:00");
    await drain(t);
    const all = await runs(t);
    // CONTROL: every emitter reached both handlers; the unvalidated one succeeds 3/3.
    expect(all.filter((run) => run.handler === "looseAny").map((run) => run.state)).toEqual(["success", "success", "success"]);
    expect(all.filter((run) => run.handler === "strictV1Created").map((run) => run.state)).toEqual(["success", "failed", "failed"]);
  });

  test("v1 and v2 registrations of one event each get their own payload from one trigger", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    await register(t, "strictV1Created", "booking.created");
    await register(t, "strictV2", "booking.created", { payloadVersion: 2 });
    const booking = await world.single("08:00");
    await drain(t);
    const all = await runs(t);
    expect(all.map((run) => [run.handler, run.state])).toEqual([
      ["strictV1Created", "success"],
      ["strictV2", "success"],
    ]);
    expect(all[0].args).toMatchObject({ managementToken: booking.managementToken, uid: booking.uid });
    expect(all[0].args).not.toHaveProperty("version");
    expect(all[1].args).toMatchObject({ version: 2, event: "booking.created", uid: booking.uid });
  });

  test("a job queued without payloadV2 (before 0.5.0) still reaches v1 hooks and skips v2 hooks with a warning", async () => {
    const { t } = setup();
    await seedWorld(t);
    await register(t, "looseAny", "booking.created");
    const v2 = await register(t, "strictV2", "booking.created", { payloadVersion: 2 });
    await t.mutation(internal.hooks.triggerHooks, {
      eventType: "booking.created",
      payload: { bookingId: "b1", resourceId: "res-1", start: at("08:00"), end: at("09:00"), status: "confirmed", bookerEmail: BOOKER.email },
    });
    await drain(t);
    expect((await runs(t)).map((run) => run.handler)).toEqual(["looseAny"]);
    expect(warn).toHaveBeenCalledWith(`Skipped hook ${v2}: this booking.created event was queued without a version 2 payload`);
  });
});

describe("registration", () => {
  test("payloadVersion is stored and returned by listHooks and getHook; v1 rows have none", async () => {
    const { t } = setup();
    const v1 = await register(t, "looseAny", "booking.created");
    const v2 = await register(t, "strictV2", "booking.cancelled", { payloadVersion: 2, organizationId: ORG });
    expect(await t.query(api.hooks.getHook, { hookId: v2 })).toMatchObject({ payloadVersion: 2, organizationId: ORG });
    const listed = await t.query(api.hooks.listHooks, {});
    expect(listed.map((hook) => [hook._id, hook.payloadVersion])).toEqual([[v1, undefined], [v2, 2]]);
    expect(listed[0]).not.toHaveProperty("payloadVersion");
    expect(await t.query(api.hooks.listHooks, { eventType: "booking.cancelled", organizationId: ORG })).toHaveLength(1);
  });

  test("only version 2 exists besides the default", async () => {
    const { t } = setup();
    const functionHandle = await handleFor(t, "looseAny");
    for (const payloadVersion of [1, 3]) {
      await expect(
        t.mutation(api.hooks.registerHook, { eventType: "booking.created", functionHandle, payloadVersion: payloadVersion as 2 })
      ).rejects.toThrow("Expected `2`");
    }
  });

  test("organization scoping is the same for v2 hooks", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    await register(t, "strictV2", "booking.created", { payloadVersion: 2, organizationId: "org-2" });
    await register(t, "looseAny", "booking.created", { payloadVersion: 2, organizationId: ORG });
    await world.single("08:00");
    await drain(t);
    expect((await runs(t)).map((run) => run.handler)).toEqual(["looseAny"]);
  });
});

// ============================================
// docs/hook-payloads-v2.md
// ============================================

/** The public shape of a convex/values validator, as far as the doc needs it. */
type Validator = { kind: string; isOptional: string; value?: unknown; members?: Validator[]; element?: Validator };

function typeText(validator: Validator): string {
  switch (validator.kind) {
    case "literal": return JSON.stringify(validator.value);
    case "array": return `Array<${typeText(validator.element!)}>`;
    case "union": return validator.members!.map(typeText).join(" | ");
    case "float64": return "number";
    default: return validator.kind;
  }
}

const RESCHEDULED_ONLY = ["originalBookingId", "newBookingId", "previousStart", "previousEnd"];

function hookPayloadsV2Doc(): string {
  const fields = Object.entries(bookingHookEventV2.fields as unknown as Record<string, Validator>);
  // CONTROL: the rescheduled-only fields are the last ones.
  expect(fields.slice(-RESCHEDULED_ONLY.length).map(([key]) => key)).toEqual(RESCHEDULED_ONLY);
  const type = ["{"];
  for (const [key, validator] of fields) {
    if (key === RESCHEDULED_ONLY[0]) type.push("  // booking.rescheduled only: the moved original");
    type.push(`  ${key}${validator.isOptional === "optional" ? "?" : ""}: ${typeText(validator)};`);
  }
  type.push("}");
  return [
    "# Hook payloads, version 2",
    "",
    "<!-- Generated from bookingHookEventV2 (src/shared/hook-events-v2.ts) by src/component/hook-payloads-v2.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/component/hook-payloads-v2.test.ts -u`. -->",
    "",
    "Register a hook with `payloadVersion: 2` to receive this payload instead of the",
    "[version 1 shapes](hook-payloads-v1.md). The handle runs with the payload as its arguments. Every",
    "event has the same shape, whichever function emitted it, so a handler can declare",
    "`args: bookingHookEventV2` from `@mrfinch/booking`:",
    "",
    "```ts",
    "import { internalMutation } from \"./_generated/server\";",
    "import { bookingHookEventV2 } from \"@mrfinch/booking\";",
    "",
    "export const onBookingEvent = internalMutation({",
    "  args: bookingHookEventV2,",
    "  handler: async (ctx, event) => {",
    "    // event.event, event.bookingId, event.status, ...",
    "  },",
    "});",
    "```",
    "",
    "Register it in a host mutation, once per event name:",
    "",
    "```ts",
    "await ctx.runMutation(components.booking.hooks.registerHook, {",
    "  eventType: \"booking.cancelled\",",
    "  functionHandle: await createFunctionHandle(internal.hooks.onBookingEvent),",
    "  payloadVersion: 2,",
    "});",
    "```",
    "",
    "- The payload is built from the booking as the emitting function wrote it. It carries the",
    "  booker's contact details and never the management token; fetch the booking by `bookingId`",
    "  in trusted host code when you need it.",
    "- The shape is frozen within version 2: a key is never added or removed, because either would",
    "  fail a handler that validates its arguments. Keys without a value are left out, never sent as",
    "  `null`.",
    "- Hooks registered without `payloadVersion` keep receiving the version 1 payloads.",
    "  `updateHook` cannot change a hook's version: to switch, register a version 2 handler, then",
    "  remove the version 1 hook with `unregisterHook`. Until then both run.",
    "- An event queued by 0.4.x and delivered after the upgrade has no version 2 payload; version 2",
    "  hooks skip it with a logged warning.",
    "",
    "```ts",
    ...type,
    "```",
    "",
    "## Emitters and values",
    "",
    "- `booking.created`: `createBooking` (status `pending` when the event type requires",
    "  confirmation), `createMultiResourceBooking` and `createReservation` (`eventTypeId: \"legacy\"`).",
    "- `booking.pending`, `booking.confirmed`, `booking.declined` and `booking.completed`:",
    "  `transitionBookingState`.",
    "- `booking.cancelled`: `cancelReservation`, `cancelBookingByToken`, `cancelMultiResourceBooking`",
    "  and `transitionBookingState`.",
    "- `booking.rescheduled`: `rescheduleBooking` and `rescheduleBookingByToken`. The common fields",
    "  describe the new booking; `newBookingId` equals `bookingId`, and `originalBookingId`,",
    "  `previousStart` and `previousEnd` name the moved original.",
    "- `createProvisionalBooking` and `expireProvisionalBooking` emit no event, and `presence.timeout`",
    "  is never emitted.",
    "- `previousStatus` is set by the transitions and cancellations.",
    "- `changedBy` is the actor the booking history records: `\"system\"` for creations and for moves",
    "  without `changedBy`, `\"user\"` for `cancelBookingByToken`, `cancelledBy` or `\"unknown\"` for",
    "  `cancelReservation` and `cancelMultiResourceBooking`, and `changedBy` when given to",
    "  `transitionBookingState`. `createReservation` records none.",
    "- `reason` is the reason given, or the default the function records: `\"Cancelled by booker\"` for",
    "  `cancelBookingByToken` and `\"Rescheduled to new time\"` for moves.",
    "",
  ].join("\n");
}

test("docs/hook-payloads-v2.md is generated from bookingHookEventV2", async () => {
  const doc = hookPayloadsV2Doc();
  // CONTROL: the events and the rescheduled-only fields are in the rendered text.
  for (const text of ['"booking.cancelled"', "originalBookingId?: string;", "organizationId?: string;", "version: 2;"]) {
    expect(doc).toContain(text);
  }
  await expect(doc).toMatchFileSnapshot("../../docs/hook-payloads-v2.md");
});
