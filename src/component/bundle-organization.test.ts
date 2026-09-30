/// <reference types="vite/client" />
/**
 * F7: a bundle belongs to its event type's organization.
 *
 * createBooking and createProvisionalBooking store the event type's
 * organization. createMultiResourceBooking stored only its optional
 * `organizationId` argument, so bundles created as the documented recipe does
 * (without it) were missing from organization lists and reached only global
 * hooks. It now falls back to the event type's organization. Since 0.5.0
 * (D6, PR-52) an explicit argument that differs from the event type's
 * organization is rejected; for an event type without organization the
 * argument is the fallback, but the items must belong to one organization
 * and the argument must name it (no cross-organization bookings). A move
 * gives the new row its event type's organization.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { BOOKER, LOCATION, TUESDAY, book, seedResource, setup, utc, type T } from "./setup.test.js";

const hour = (h: number) => utc(TUESDAY, `${String(h).padStart(2, "0")}:00`);

type Job = { name?: string; args: Array<Record<string, any>> };

/** The one triggerHooks job of `eventType` for a booking (by id or as a move's successor). */
async function hookJob(t: T, bookingId: Id<"bookings">, eventType: string) {
  const jobs = (await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  )) as unknown as Job[];
  const matches = jobs
    .filter((job) => job.name?.includes("triggerHooks"))
    .map((job) => job.args[0])
    .filter(
      (args) =>
        args.eventType === eventType &&
        (args.payload.bookingId === bookingId || args.payload.newBookingId === bookingId)
    );
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** Runs a triggerHooks job again; returns the names of the hook jobs it scheduled. */
async function replayHooks(t: T, job: Record<string, any>) {
  const jobs = async () =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())) as unknown as Array<
      Job & { _id: string }
    >;
  const before = new Set((await jobs()).map((row) => row._id));
  expect(await t.mutation(internal.hooks.triggerHooks, job as any)).toBeNull();
  return (await jobs())
    .filter((row) => !before.has(row._id) && !row.name?.startsWith("emails"))
    .map((row) => row.name)
    .sort();
}

function bundle(t: T, eventTypeId: string, h: number, organizationId?: string) {
  return t.mutation(api.multi_resource.createMultiResourceBooking, {
    eventTypeId,
    organizationId,
    resources: [{ resourceId: "res-1" }],
    start: hour(h),
    end: hour(h + 1),
    timezone: "UTC",
    booker: BOOKER,
    location: LOCATION,
  });
}

describe("createMultiResourceBooking organization", () => {
  test("omitted: the event type's organization is stored, listed and used for hooks and emails", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // res-1 + et-1 in org-1
    for (const organizationId of [undefined, "org-1", "org-2"]) {
      await t.mutation(api.hooks.registerHook, {
        eventType: "booking.created",
        functionHandle: `function://;probe:${organizationId ?? "global"}`,
        organizationId,
      });
    }

    const single = await book(t, seed, hour(8), hour(9)); // CONTROL: derived since 0.3.0
    const derived = await bundle(t, seed.eventTypeId, 10);
    expect([single.organizationId, derived.organizationId]).toEqual(["org-1", "org-1"]);

    const listed = (await t.query(api.public.listBookings, { organizationId: "org-1" })).map((b) => b._id);
    expect(listed.sort()).toEqual([single._id, derived._id].sort());

    const job = await hookJob(t, derived._id, "booking.created");
    expect([job.organizationId, job.emailContext.organizationId]).toEqual(["org-1", "org-1"]);
    // Replaying the job matches the global and the org-1 hook, like the single booking's.
    const singleJob = await hookJob(t, single._id, "booking.created");
    expect(await replayHooks(t, job)).toEqual(["probe:global", "probe:org-1"]);
    expect(await replayHooks(t, singleJob)).toEqual(["probe:global", "probe:org-1"]);
  });

  test("the organization carries through a move and a cancellation", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const derived = await bundle(t, seed.eventTypeId, 10);
    const moved = await t.mutation(api.public.rescheduleBooking, {
      bookingId: derived._id,
      newStart: hour(12),
      newEnd: hour(13),
    });
    const movedJob = await hookJob(t, moved._id, "booking.rescheduled");
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: moved._id });
    const cancelJob = await hookJob(t, moved._id, "booking.cancelled");

    expect({
      moved: moved.organizationId,
      rescheduledHook: movedJob.organizationId,
      cancelledHook: cancelJob.organizationId,
    }).toEqual({ moved: "org-1", rescheduledHook: "org-1", cancelledHook: "org-1" });
    expect(await t.query(api.public.listBookings, { organizationId: "org-1" })).toHaveLength(2);
  });

  test("explicit: a matching organization is stored; a mismatching one is rejected and nothing is written", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    for (const organizationId of ["org-1", "org-2"]) {
      await t.mutation(api.hooks.registerHook, {
        eventType: "booking.created",
        functionHandle: `function://;probe:${organizationId}`,
        organizationId,
      });
    }
    const matching = await bundle(t, seed.eventTypeId, 10, "org-1");
    expect(matching.organizationId).toBe("org-1");

    // 0.4.x stored "org-2" and routed the booking (and its management
    // token) to org-2's hooks (lc-skeptic LCS-F7-TOKEN).
    const jobsBefore = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    await expect(bundle(t, seed.eventTypeId, 12, "org-2")).rejects.toMatchObject({
      data: {
        code: "ORGANIZATION_MISMATCH",
        message: 'Organization "org-2" does not match the organization of event type "et-1"',
      },
    });
    expect((await t.query(api.public.listBookings, { resourceId: seed.resourceId })).map((b) => b._id)).toEqual([
      matching._id,
    ]);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(
      jobsBefore.length
    );
    expect(await t.query(api.public.listBookings, { organizationId: "org-2" })).toEqual([]);
  });

  test("an event type without organization: the argument is kept, and without one none is stored", async () => {
    const { t } = setup();
    const seed = await seedResource(t, { eventType: { organizationId: undefined } });
    expect((await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId }))!.organizationId).toBeUndefined();

    const explicit = await bundle(t, seed.eventTypeId, 10, "org-1");
    const none = await bundle(t, seed.eventTypeId, 12);
    const single = await book(t, seed, hour(14), hour(15)); // CONTROL: same rule as single bookings
    expect([explicit.organizationId, none.organizationId, single.organizationId]).toEqual([
      "org-1",
      undefined,
      undefined,
    ]);
    expect((await hookJob(t, none._id, "booking.created")).organizationId).toBeUndefined();
  });
});

describe("an event type without organization: one organization per bundle", () => {
  /** et-g without organization; ra and ra-2 of org-a and rb of org-b are linked to it. */
  async function seedGlobal(t: T) {
    await t.mutation(api.public.createEventType, {
      id: "et-g", slug: "et-g", title: "Global", lengthInMinutes: 60, timezone: "UTC",
      lockTimeZoneToggle: false, locations: [],
    });
    for (const [id, organizationId] of [["ra", "org-a"], ["ra-2", "org-a"], ["rb", "org-b"]]) {
      await t.mutation(api.resources.createResource, { id, organizationId, name: id, type: "room", timezone: "UTC" });
      await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: id, eventTypeId: "et-g" });
    }
    for (const organizationId of ["org-a", "org-b", "org-c"]) {
      await t.mutation(api.hooks.registerHook, {
        eventType: "booking.created", functionHandle: `function://;probe:${organizationId}`, organizationId,
      });
    }
  }
  const bundleOf = (t: T, resourceIds: string[], h: number, organizationId?: string) =>
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: "et-g", organizationId, resources: resourceIds.map((resourceId) => ({ resourceId })),
      start: hour(h), end: hour(h + 1), timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
  const jobCount = async (t: T) => (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).length;

  test("resources of two organizations, or an organization that is not theirs, are rejected and nothing is written", async () => {
    const { t } = setup();
    await seedGlobal(t);
    const jobsBefore = await jobCount(t);
    const mixed = { code: "ORGANIZATION_MISMATCH", message: 'Resource "rb" belongs to another organization than resource "ra"' };
    // The review's probe: org-c books org-a's and org-b's resources, and 0.5.0 stored it for org-c.
    await expect(bundleOf(t, ["ra", "rb"], 9, "org-c")).rejects.toMatchObject({ data: mixed });
    await expect(bundleOf(t, ["ra", "rb"], 9)).rejects.toMatchObject({ data: mixed });
    await expect(bundleOf(t, ["ra", "ra-2"], 9, "org-c")).rejects.toMatchObject({
      data: { code: "ORGANIZATION_MISMATCH", message: 'Organization "org-c" does not match the organization of resource "ra"' },
    });
    expect(await jobCount(t)).toBe(jobsBefore);
    expect(await t.query(api.public.listBookings, { organizationId: "org-c" })).toEqual([]);
    expect(await t.query(api.public.listBookings, { resourceId: "ra" })).toEqual([]);

    // CONTROL: one organization's resources, with its id or without one (unscoped, as a single booking).
    const own = await bundleOf(t, ["ra", "ra-2"], 9, "org-a");
    const unscoped = await bundleOf(t, ["rb"], 11);
    expect([own.organizationId, unscoped.organizationId]).toEqual(["org-a", undefined]);
    expect(await replayHooks(t, await hookJob(t, own._id, "booking.created"))).toEqual(["probe:org-a"]);
    expect(await replayHooks(t, await hookJob(t, unscoped._id, "booking.created"))).toEqual([]);
  });

  test("moves and confirmations re-check it over the stored bundle", async () => {
    const { t } = setup();
    await seedGlobal(t);
    await t.mutation(api.public.updateEventType, { id: "et-g", requiresConfirmation: true });
    const spanning = await bundleOf(t, ["ra", "ra-2"], 9);
    const thirdParty = await bundleOf(t, ["ra"], 11, "org-a");
    const own = await bundleOf(t, ["ra"], 13, "org-a"); // control
    // As 0.4.3 stored them: an item of org-b, and org-c's id on org-a's resource.
    await t.run(async (ctx) => {
      const [, second] = await ctx.db.query("booking_items").withIndex("by_booking", (q) => q.eq("bookingId", spanning._id)).collect();
      await ctx.db.patch(second._id, { resourceId: "rb" });
      await ctx.db.patch(thirdParty._id, { organizationId: "org-c" });
    });
    const mixed = { code: "ORGANIZATION_MISMATCH", message: 'Resource "rb" belongs to another organization than resource "ra"' };
    const foreign = { code: "ORGANIZATION_MISMATCH", message: 'Organization "org-c" does not match the organization of resource "ra"' };
    const move = (booking: Doc<"bookings">) =>
      t.mutation(api.public.rescheduleBookingByToken, { uid: booking.uid, token: booking.managementToken!, newStart: hour(15), newEnd: hour(16) });
    const approve = (booking: Doc<"bookings">) =>
      t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus: "confirmed" });

    await expect(move(spanning)).rejects.toMatchObject({ data: mixed });
    await expect(approve(spanning)).rejects.toMatchObject({ data: mixed });
    await expect(move(thirdParty)).rejects.toMatchObject({ data: foreign });
    await expect(approve(thirdParty)).rejects.toMatchObject({ data: foreign });
    // Cancelling is always allowed.
    expect(await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: thirdParty._id })).toEqual({ success: true });
    // CONTROL
    expect((await move(own)).organizationId).toBe("org-a");
  });
});

describe("a move gives the new row its event type's organization", () => {
  test("a stored mismatch or gap is not carried over; the hooks follow the event type's organization", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // et-1 in org-1
    for (const organizationId of ["org-1", "org-other"]) {
      await t.mutation(api.hooks.registerHook, {
        eventType: "booking.rescheduled", functionHandle: `function://;probe:${organizationId}`, organizationId,
      });
    }
    const patched = await bundle(t, seed.eventTypeId, 8);
    const gap = await book(t, seed, hour(9), hour(10));
    // As 0.4.3 stored them: a bundle with another organization's id, a booking without one.
    await t.run(async (ctx) => {
      await ctx.db.patch(patched._id, { organizationId: "org-other" });
      await ctx.db.patch(gap._id, { organizationId: undefined });
    });

    const movedPatched = await t.mutation(api.public.rescheduleBooking, { bookingId: patched._id, newStart: hour(12), newEnd: hour(13) });
    const movedGap = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: gap.uid, token: gap.managementToken!, newStart: hour(14), newEnd: hour(15),
    });
    const job = await hookJob(t, movedPatched._id, "booking.rescheduled");
    expect({
      movedPatched: movedPatched.organizationId,
      movedGap: movedGap.organizationId,
      hook: job.organizationId,
      emailContext: job.emailContext.organizationId,
      v2: job.payloadV2.organizationId,
    }).toEqual({ movedPatched: "org-1", movedGap: "org-1", hook: "org-1", emailContext: "org-1", v2: "org-1" });
    expect(await replayHooks(t, job)).toEqual(["probe:org-1"]);
    expect((await t.query(api.public.listBookings, { organizationId: "org-other", status: "confirmed" }))).toEqual([]);

    // CONTROL: a legacy row and a global event type's bundle keep what they store.
    const legacyId = await t.mutation(api.public.createReservation, {
      resourceId: "legacy-room", actorId: "ops@example.com", start: hour(16), end: hour(17),
    });
    await t.run((ctx) => ctx.db.patch(legacyId, { organizationId: "org-legacy" }));
    const movedLegacy = await t.mutation(api.public.rescheduleBooking, { bookingId: legacyId, newStart: hour(17), newEnd: hour(18) });
    expect(movedLegacy.organizationId).toBe("org-legacy");
    const global = await seedResource(t, { resourceId: "res-g", eventTypeId: "et-g", eventType: { organizationId: undefined } });
    const globalBundle = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: global.eventTypeId, organizationId: "org-1", resources: [{ resourceId: "res-g" }],
      start: hour(8), end: hour(9), timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
    const movedGlobal = await t.mutation(api.public.rescheduleBooking, { bookingId: globalBundle._id, newStart: hour(10), newEnd: hour(11) });
    expect(movedGlobal.organizationId).toBe("org-1");
  });
});
