/// <reference types="vite/client" />
/**
 * N6/O6: hooks store and invoke only Convex function handles.
 *
 * The scheduler runs a string that is not a handle as a function path inside
 * the booking component, so registerHook("maintenance:wipeAllBookingData")
 * scheduled that component mutation on the next booking (only its args
 * validator stopped it). Registration now rejects such strings, and rows
 * stored before are skipped at trigger time. A handle made by
 * createFunctionHandle in the host is accepted and invoked across the
 * component boundary, which pins the "function://" prefix check.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import {
  anyApi, componentsGeneric, createFunctionHandle, defineSchema, defineTable,
  internalMutationGeneric, mutationGeneric, queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import bookingComponent from "../test.js";

// Host fixture: the hook target records what it received.
const hostSchema = defineSchema({ deliveries: defineTable({ uid: v.string(), start: v.number() }) });
const fixtureApi = anyApi.fixture;
const components = componentsGeneric() as any;
const booking = components.booking;
const START = Date.UTC(2027, 2, 9, 9);

const onBookingCreated = internalMutationGeneric({
  handler: async (ctx, payload: { uid: string; start: number }) => {
    await ctx.db.insert("deliveries", { uid: payload.uid, start: payload.start });
  },
});
const deliveries = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.db.query("deliveries").collect(),
});

// Component-side test module: seeds a pre-0.4.3 hook row and lists jobs.
const insertLegacyHook = mutationGeneric({
  args: { functionHandle: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("hooks", {
      eventType: "booking.created", functionHandle: args.functionHandle, enabled: true, createdAt: 0,
    });
  },
});
const inspectJobs = queryGeneric({
  args: {}, returns: v.any(),
  handler: async (ctx) => ctx.db.system.query("_scheduled_functions").collect(),
});

function setup() {
  const t = convexTest(hostSchema, {
    "./_generated/api.ts": async () => ({}),
    "./fixture.ts": async () => ({ onBookingCreated, deliveries }),
  });
  t.registerComponent("booking", bookingComponent.schema, {
    ...bookingComponent.modules,
    "./component/testInspect.ts": async () => ({ insertLegacyHook, inspectJobs }),
  });
  return t;
}
let t: ReturnType<typeof setup>;

const hostHandle = () => t.run(() => createFunctionHandle(fixtureApi.onBookingCreated));
const jobNames = async (): Promise<string[]> =>
  (await t.query(booking.testInspect.inspectJobs, {})).map((job: { name: string }) => job.name);

async function seed() {
  await t.mutation(booking.resources.createResource, {
    id: "resource", organizationId: "org", name: "Room", type: "room", timezone: "UTC",
  });
  await t.mutation(booking.public.createEventType, {
    id: "event", slug: "event", title: "Consultation", organizationId: "org",
    lengthInMinutes: 60, timezone: "UTC", lockTimeZoneToggle: false, locations: [],
  });
  await t.mutation(booking.resource_event_types.linkResourceToEventType, { resourceId: "resource", eventTypeId: "event" });
}

async function createAndDrain(start = START) {
  const created = await t.mutation(booking.public.createBooking, {
    resourceId: "resource", eventTypeId: "event", start, end: start + 3_600_000,
    timezone: "UTC", booker: { name: "Ada", email: "ada@example.com" }, location: { type: "address", value: "Room 1" },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return created;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 8));
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  t = setup();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hook function handles", () => {
  test("a createFunctionHandle handle is accepted and invoked with the payload", async () => {
    await seed();
    const handle = await hostHandle();
    expect(handle.startsWith("function://")).toBe(true);
    await t.mutation(booking.hooks.registerHook, { eventType: "booking.created", functionHandle: handle });

    const created = await createAndDrain();

    expect(await t.query(fixtureApi.deliveries, {})).toEqual([
      expect.objectContaining({ uid: created.uid, start: START }),
    ]);
  });

  test.each(["maintenance:wipeAllBookingData", "host:onBookingCreated", "", "fixture:onBookingCreated"])(
    "registerHook rejects the non-handle %j and nothing is scheduled for it",
    async (functionHandle) => {
      await seed();
      await expect(
        t.mutation(booking.hooks.registerHook, { eventType: "booking.created", functionHandle })
      ).rejects.toThrow(`Invalid hook functionHandle "${functionHandle}"`);
      expect(await t.query(booking.hooks.listHooks, {})).toEqual([]);

      await createAndDrain();
      expect(await jobNames()).not.toContain(functionHandle);
      expect(await jobNames()).not.toContain("maintenance:wipeAllBookingData");
      expect(await t.query(booking.public.listBookings, {})).toHaveLength(1);
    }
  );

  test("updateHook rejects a non-handle and keeps the stored handle", async () => {
    await seed();
    const handle = await hostHandle();
    const hookId = await t.mutation(booking.hooks.registerHook, { eventType: "booking.created", functionHandle: handle });

    await expect(
      t.mutation(booking.hooks.updateHook, { hookId, functionHandle: "maintenance:wipeAllData" })
    ).rejects.toThrow('Invalid hook functionHandle "maintenance:wipeAllData"');
    expect((await t.query(booking.hooks.getHook, { hookId })).functionHandle).toBe(handle);

    // CONTROL: a handle is still accepted as an update.
    const again = await hostHandle();
    await t.mutation(booking.hooks.updateHook, { hookId, functionHandle: again, enabled: false });
    expect(await t.query(booking.hooks.getHook, { hookId })).toMatchObject({ functionHandle: again, enabled: false });
  });

  test("a stored non-handle row is skipped and logged; a valid hook next to it still runs", async () => {
    await seed();
    await t.mutation(booking.testInspect.insertLegacyHook, { functionHandle: "maintenance:wipeAllBookingData" });
    await t.mutation(booking.hooks.registerHook, { eventType: "booking.created", functionHandle: await hostHandle() });

    const created = await createAndDrain();

    expect(await jobNames()).not.toContain("maintenance:wipeAllBookingData");
    expect(await t.query(booking.public.listBookings, {})).toHaveLength(1);
    expect((await t.query(fixtureApi.deliveries, {})).map((d: { uid: string }) => d.uid)).toEqual([created.uid]);
    expect(vi.mocked(console.error).mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringMatching(/^Skipped hook .+: functionHandle is not a function handle$/),
    ]);
  });

  test("booking.completed schedules nothing: no email and no hook without registrations", async () => {
    await seed();
    const created = await createAndDrain();
    const before = await jobNames();

    await t.mutation(booking.hooks.transitionBookingState, { bookingId: created._id, toStatus: "completed" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Only the triggerHooks job itself was added.
    expect((await jobNames()).slice(before.length)).toEqual(["hooks:triggerHooks"]);
    // CONTROL: booking.created did schedule its confirmation email.
    expect(before).toContain("emails:sendBookingConfirmation");
  });
});
