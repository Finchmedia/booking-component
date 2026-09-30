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
import { BOOKER, LOCATION, TUESDAY, book, seedResource, setup, utc, type SeededResource, type T } from "./setup.test.js";

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
      const [, second] = await ctx.db.query("booking_items").withIndex("by_bookingId", (q) => q.eq("bookingId", spanning._id)).collect();
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
    // The cancelled originals are given it too, so org-other lists neither row.
    expect([await storedOrganization(t, patched._id), await storedOrganization(t, gap._id)]).toEqual(["org-1", "org-1"]);
    expect(await t.query(api.public.listBookings, { organizationId: "org-other" })).toEqual([]);

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

/** Version 1 and version 2 probes of org-1 and org-other for `eventType`. */
async function probes(t: T, eventType: string) {
  for (const organizationId of ["org-1", "org-other"]) {
    await t.mutation(api.hooks.registerHook, { eventType, functionHandle: `function://;probe:${organizationId}`, organizationId });
    await t.mutation(api.hooks.registerHook, {
      eventType, functionHandle: `function://;probe-v2:${organizationId}`, organizationId, payloadVersion: 2,
    });
  }
}
const storedOrganization = async (t: T, bookingId: Id<"bookings">) =>
  (await t.query(api.public.getBooking, { bookingId }))?.organizationId;
const transition = (
  t: T,
  bookingId: Id<"bookings">,
  toStatus: "pending" | "confirmed" | "cancelled" | "declined" | "completed",
) => t.mutation(api.hooks.transitionBookingState, { bookingId, toStatus });

describe("confirming a booking or submitting a hold gives it its event type's organization", () => {
  test("a request stored for another organization: approving it notifies the event type's organization only", async () => {
    const { t } = setup();
    const seed = await seedResource(t, { requiresConfirmation: true }); // et-1 and res-1 in org-1
    await probes(t, "booking.confirmed");
    const request = await book(t, seed, hour(9), hour(10));
    const control = await book(t, seed, hour(11), hour(12));
    expect([request.status, control.status]).toEqual(["pending", "pending"]);
    // As 0.4.x could store it: org-other's id on org-1's event type and resource.
    await t.run((ctx) => ctx.db.patch(request._id, { organizationId: "org-other" }));

    await transition(t, request._id, "confirmed");
    const job = await hookJob(t, request._id, "booking.confirmed");
    expect({
      stored: await storedOrganization(t, request._id),
      hook: job.organizationId,
      emailContext: job.emailContext.organizationId,
      v1Booking: job.payload.booking.organizationId,
      v2: job.payloadV2.organizationId,
    }).toEqual({ stored: "org-1", hook: "org-1", emailContext: "org-1", v1Booking: "org-1", v2: "org-1" });
    // org-other's hooks receive nothing: neither the booker's details nor the management token.
    expect(await replayHooks(t, job)).toEqual(["probe-v2:org-1", "probe:org-1"]);
    expect(await t.query(api.public.listBookings, { organizationId: "org-other" })).toEqual([]);

    // CONTROL: a matching organization stays, routes the same way, and the payloads keep their keys.
    await transition(t, control._id, "confirmed");
    const controlJob = await hookJob(t, control._id, "booking.confirmed");
    expect([await storedOrganization(t, control._id), controlJob.organizationId]).toEqual(["org-1", "org-1"]);
    expect(await replayHooks(t, controlJob)).toEqual(["probe-v2:org-1", "probe:org-1"]);
    expect(Object.keys(job.payload).sort()).toEqual(Object.keys(controlJob.payload).sort());
    expect(Object.keys(job.payload.booking).sort()).toEqual(Object.keys(controlJob.payload.booking).sort());
  });

  test("holds stored for another organization or without one: submitting and confirming them", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await probes(t, "booking.pending");
    await probes(t, "booking.confirmed");
    const hold = (h: number) =>
      t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: hour(h), end: hour(h + 1),
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
    const foreign = await hold(9);
    const gap = await hold(11);
    await t.run(async (ctx) => {
      await ctx.db.patch(foreign._id, { organizationId: "org-other" });
      await ctx.db.patch(gap._id, { organizationId: undefined });
    });

    await transition(t, foreign._id, "pending"); // provisional -> pending
    await transition(t, gap._id, "confirmed"); // provisional -> confirmed
    const pendingJob = await hookJob(t, foreign._id, "booking.pending");
    const confirmedJob = await hookJob(t, gap._id, "booking.confirmed");
    expect({
      foreign: await storedOrganization(t, foreign._id),
      gap: await storedOrganization(t, gap._id),
      pendingHook: pendingJob.organizationId,
      pendingEmail: pendingJob.emailContext.organizationId,
      confirmedHook: confirmedJob.organizationId,
      confirmedEmail: confirmedJob.emailContext.organizationId,
    }).toEqual({
      foreign: "org-1", gap: "org-1", pendingHook: "org-1", pendingEmail: "org-1", confirmedHook: "org-1", confirmedEmail: "org-1",
    });
    expect(await replayHooks(t, pendingJob)).toEqual(["probe-v2:org-1", "probe:org-1"]);
    expect(await replayHooks(t, confirmedJob)).toEqual(["probe-v2:org-1", "probe:org-1"]);
  });

  test("CONTROL: an event type without organization keeps the stored one; a rejected confirmation changes nothing", async () => {
    const { t } = setup();
    const global = await seedResource(t, {
      resourceId: "res-g", eventTypeId: "et-g", requiresConfirmation: true, eventType: { organizationId: undefined },
    }); // res-g in org-1
    const scoped = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: global.eventTypeId, organizationId: "org-1", resources: [{ resourceId: "res-g" }],
      start: hour(8), end: hour(9), timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
    const unscoped = await book(t, global, hour(10), hour(11));
    await transition(t, scoped._id, "confirmed");
    await transition(t, unscoped._id, "confirmed");
    expect({
      scoped: await storedOrganization(t, scoped._id),
      scopedHook: (await hookJob(t, scoped._id, "booking.confirmed")).organizationId,
      unscoped: await storedOrganization(t, unscoped._id),
      unscopedHook: (await hookJob(t, unscoped._id, "booking.confirmed")).organizationId,
    }).toEqual({ scoped: "org-1", scopedHook: "org-1", unscoped: undefined, unscopedHook: undefined });

    // A confirmation the rules reject rolls back: the stored organization stays, and nothing is queued.
    const seed = await seedResource(t, { requiresConfirmation: true });
    const request = await book(t, seed, hour(13), hour(14));
    await t.run((ctx) => ctx.db.patch(request._id, { organizationId: "org-other" }));
    await t.mutation(api.public.toggleEventTypeActive, { id: seed.eventTypeId, isActive: false });
    const jobsBefore = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).length;
    await expect(transition(t, request._id, "confirmed")).rejects.toMatchObject({ data: { code: "EVENT_TYPE_INACTIVE" } });
    expect(await storedOrganization(t, request._id)).toBe("org-other");
    expect((await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).length).toBe(jobsBefore);
  });
});

describe("cancelling, declining, completing and expiring notify the event type's organization", () => {
  const ENDINGS = ["booking.cancelled", "booking.declined", "booking.completed"];

  /**
   * One booking per path from hour `h` on (et-1, org-1), stored under
   * `organizationId`, then ended; every call must succeed. Returns the rows
   * and the triggerHooks job of each notifying path.
   */
  async function endEach(t: T, seed: SeededResource, h: number, organizationId: string) {
    await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, requiresConfirmation: false });
    const rows = {
      cancelBookingByToken: await book(t, seed, hour(h), hour(h + 1)),
      cancelReservation: await book(t, seed, hour(h + 1), hour(h + 2)),
      cancelMultiResourceBooking: await bundle(t, seed.eventTypeId, h + 2),
      "transition to cancelled": await book(t, seed, hour(h + 3), hour(h + 4)),
      "transition to completed": await book(t, seed, hour(h + 4), hour(h + 5)),
      expireProvisionalBooking: await t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: hour(h + 5), end: hour(h + 6),
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      }),
      "transition to declined": await (async () => {
        await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, requiresConfirmation: true });
        return await book(t, seed, hour(h + 6), hour(h + 7));
      })(),
    };
    await t.run(async (ctx) => {
      for (const row of Object.values(rows)) await ctx.db.patch(row._id, { organizationId });
    });

    expect({
      cancelBookingByToken: await t.mutation(api.public.cancelBookingByToken, {
        uid: rows.cancelBookingByToken.uid, token: rows.cancelBookingByToken.managementToken!,
      }),
      cancelReservation: await t.mutation(api.public.cancelReservation, { reservationId: rows.cancelReservation._id }),
      cancelMultiResourceBooking: await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
        bookingId: rows.cancelMultiResourceBooking._id,
      }),
      "transition to cancelled": await transition(t, rows["transition to cancelled"]._id, "cancelled"),
      "transition to completed": await transition(t, rows["transition to completed"]._id, "completed"),
      "transition to declined": await transition(t, rows["transition to declined"]._id, "declined"),
      expireProvisionalBooking: await t.mutation(api.public.expireProvisionalBooking, { bookingId: rows.expireProvisionalBooking._id }),
    }).toEqual({
      cancelBookingByToken: { success: true },
      cancelReservation: { success: true, alreadyCancelled: false },
      cancelMultiResourceBooking: { success: true },
      "transition to cancelled": { success: true },
      "transition to completed": { success: true },
      "transition to declined": { success: true },
      expireProvisionalBooking: { success: true },
    });

    const jobs = {
      cancelBookingByToken: await hookJob(t, rows.cancelBookingByToken._id, "booking.cancelled"),
      cancelReservation: await hookJob(t, rows.cancelReservation._id, "booking.cancelled"),
      cancelMultiResourceBooking: await hookJob(t, rows.cancelMultiResourceBooking._id, "booking.cancelled"),
      "transition to cancelled": await hookJob(t, rows["transition to cancelled"]._id, "booking.cancelled"),
      "transition to completed": await hookJob(t, rows["transition to completed"]._id, "booking.completed"),
      "transition to declined": await hookJob(t, rows["transition to declined"]._id, "booking.declined"),
    };
    return { rows, jobs };
  }

  /** Where a job is routed and which organization its email context and payloads name. */
  const routing = (job: Record<string, any>) => ({
    hook: job.organizationId,
    email: job.emailContext?.organizationId,
    v1Booking: job.payload.booking?.organizationId,
    v2: job.payloadV2.organizationId,
  });

  test("a booking stored for another organization: only the event type's organization is notified, and it is stored", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // et-1 and res-1 in org-1
    for (const event of ENDINGS) await probes(t, event);
    const foreign = await endEach(t, seed, 0, "org-other");
    const control = await endEach(t, seed, 8, "org-1");

    for (const [name, job] of Object.entries(foreign.jobs)) {
      const controlJob = control.jobs[name as keyof typeof control.jobs];
      expect({ name, ...routing(job) }).toEqual({ name, ...routing(controlJob) });
      expect({ name, hook: job.organizationId, v2: job.payloadV2.organizationId }).toEqual({ name, hook: "org-1", v2: "org-1" });
      // org-other's hooks receive nothing, in either payload version.
      expect({ name, hooks: await replayHooks(t, job) }).toEqual({ name, hooks: ["probe-v2:org-1", "probe:org-1"] });
      // CONTROL: the key sets are the ones a matching organization produces (hook-payloads-v1.test.ts pins those).
      expect({ name, keys: Object.keys(job.payload).sort() }).toEqual({ name, keys: Object.keys(controlJob.payload).sort() });
      expect({ name, keys: Object.keys(job.payloadV2).sort() }).toEqual({ name, keys: Object.keys(controlJob.payloadV2).sort() });
    }
    for (const [name, row] of Object.entries({ ...foreign.rows, ...Object.fromEntries(
      Object.entries(control.rows).map(([key, value]) => [`control ${key}`, value])
    ) })) {
      expect({ name, stored: await storedOrganization(t, row._id) }).toEqual({ name, stored: "org-1" });
    }
    expect(await t.query(api.public.listBookings, { organizationId: "org-other" })).toEqual([]);
  });

  test("legacy rows and event types without organization keep the stored one (CONTROL); cancelling never fails", async () => {
    const { t } = setup();
    const global = await seedResource(t, {
      resourceId: "res-g", eventTypeId: "et-g", eventType: { organizationId: undefined },
    }); // res-g in org-1
    const scoped = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: global.eventTypeId, organizationId: "org-1", resources: [{ resourceId: "res-g" }],
      start: hour(8), end: hour(9), timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
    const unscoped = await book(t, global, hour(10), hour(11));
    const legacyId = await t.mutation(api.public.createReservation, {
      resourceId: "legacy-room", actorId: "ops@example.com", start: hour(12), end: hour(13),
    });
    await t.run((ctx) => ctx.db.patch(legacyId, { organizationId: "org-legacy" }));
    // A deactivated event type and an unlinked resource block nothing here.
    const seed = await seedResource(t);
    const stale = await book(t, seed, hour(14), hour(15));
    await t.run((ctx) => ctx.db.patch(stale._id, { organizationId: "org-other" }));
    await t.mutation(api.public.toggleEventTypeActive, { id: seed.eventTypeId, isActive: false });
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: seed.resourceId, eventTypeId: seed.eventTypeId });

    expect([
      await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: scoped._id }),
      await t.mutation(api.public.cancelBookingByToken, { uid: unscoped.uid, token: unscoped.managementToken! }),
      await t.mutation(api.public.cancelReservation, { reservationId: legacyId }),
      await t.mutation(api.public.cancelBookingByToken, { uid: stale.uid, token: stale.managementToken! }),
    ]).toEqual([{ success: true }, { success: true }, { success: true, alreadyCancelled: false }, { success: true }]);
    expect({
      scoped: [await storedOrganization(t, scoped._id), (await hookJob(t, scoped._id, "booking.cancelled")).organizationId],
      unscoped: [await storedOrganization(t, unscoped._id), (await hookJob(t, unscoped._id, "booking.cancelled")).organizationId],
      legacy: [await storedOrganization(t, legacyId), (await hookJob(t, legacyId, "booking.cancelled")).organizationId],
      stale: [await storedOrganization(t, stale._id), (await hookJob(t, stale._id, "booking.cancelled")).organizationId],
    }).toEqual({
      scoped: ["org-1", "org-1"],
      unscoped: [undefined, undefined],
      legacy: ["org-legacy", "org-legacy"],
      stale: ["org-1", "org-1"],
    });
  });
});

describe("the event type's organization takes a booking over only when the booking's resources belong to it", () => {
  /** Version 1 and version 2 probes of each organization for `eventType`. */
  async function probesOf(t: T, eventType: string, organizationIds: string[]) {
    for (const organizationId of organizationIds) {
      await t.mutation(api.hooks.registerHook, { eventType, functionHandle: `function://;probe:${organizationId}`, organizationId });
      await t.mutation(api.hooks.registerHook, {
        eventType, functionHandle: `function://;probe-v2:${organizationId}`, organizationId, payloadVersion: 2,
      });
    }
  }
  /** Moves a resource to another organization, as a 0.4.x link across organizations left it. */
  const rehomeResource = (t: T, resourceId: string, organizationId: string) =>
    t.run(async (ctx) => {
      const resource = await ctx.db.query("resources").withIndex("by_external_id", (q) => q.eq("id", resourceId)).unique();
      await ctx.db.patch(resource!._id, { organizationId });
    });
  /** The stored organization, where the job is routed, what its email context and payloads name, and which probes it reaches. */
  const outcome = async (t: T, bookingId: Id<"bookings">, event: string) => {
    const job = await hookJob(t, bookingId, event);
    return {
      stored: await storedOrganization(t, bookingId),
      hook: job.organizationId,
      email: job.emailContext?.organizationId,
      v1Booking: job.payload.booking?.organizationId,
      v2: job.payloadV2.organizationId,
      probes: await replayHooks(t, job),
    };
  };
  const integrityIssues = async (t: T) =>
    (await t.query(api.maintenance.audit, { check: "booking_integrity", limit: 100 })).issues;

  test("event type of org-1, resource of org-b: cancelling and completing keep the stored organization and notify only it", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // et-1 and res-1 in org-1
    for (const event of ["booking.cancelled", "booking.completed"]) await probesOf(t, event, ["org-1", "org-b"]);
    const paths = [
      {
        path: "cancelBookingByToken", event: "booking.cancelled", v1Booking: true, email: true,
        create: (h: number) => book(t, seed, hour(h), hour(h + 1)),
        end: (booking: Doc<"bookings">) =>
          t.mutation(api.public.cancelBookingByToken, { uid: booking.uid, token: booking.managementToken! }),
      },
      {
        path: "transition to completed", event: "booking.completed", v1Booking: true, email: false,
        create: (h: number) => book(t, seed, hour(h), hour(h + 1)),
        end: (booking: Doc<"bookings">) => transition(t, booking._id, "completed"),
      },
      {
        path: "cancelMultiResourceBooking", event: "booking.cancelled", v1Booking: false, email: true,
        create: (h: number) => bundle(t, seed.eventTypeId, h),
        end: (booking: Doc<"bookings">) => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id }),
      },
    ];
    const cases: Array<(typeof paths)[number] & { stored: string; booking: Doc<"bookings"> }> = [];
    for (const stored of ["org-1", "org-b"]) {
      for (const path of paths) cases.push({ ...path, stored, booking: await path.create(cases.length) });
    }
    await t.run(async (ctx) => {
      for (const { booking, stored } of cases) await ctx.db.patch(booking._id, { organizationId: stored });
    });
    await rehomeResource(t, "res-1", "org-b");

    for (const { path, event, v1Booking, email, stored, booking, end } of cases) {
      const name = `${path}, stored ${stored}`;
      expect({ name, result: await end(booking) }).toEqual({ name, result: { success: true } });
      // org-1's hooks receive org-b's booking (and, in version 1, its management token) from none of them.
      expect({ name, ...(await outcome(t, booking._id, event)) }).toEqual({
        name,
        stored,
        hook: stored,
        email: email ? stored : undefined,
        v1Booking: v1Booking ? stored : undefined,
        v2: stored,
        probes: [`probe-v2:${stored}`, `probe:${stored}`],
      });
    }
    const uids = (stored: string) => cases.filter((row) => row.stored === stored).map((row) => row.booking.uid).sort();
    expect((await t.query(api.public.listBookings, { organizationId: "org-1" })).map((b) => b.uid).sort()).toEqual(uids("org-1"));
    // The audit keeps listing the bookings stored for another organization than the event type's.
    expect(await integrityIssues(t)).toEqual(
      cases
        .filter((row) => row.stored === "org-b")
        .map((row) => ({ check: "booking_integrity", uid: row.booking.uid, problems: ["organizationMismatch"] }))
    );
  });

  test("a bundle with a secondary item of org-b stays where it is stored; one whose items all belong to org-1 is corrected (CONTROL)", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // et-1 and res-1 in org-1
    for (const resourceId of ["res-2", "res-3"]) {
      await t.mutation(api.resources.createResource, { id: resourceId, organizationId: "org-1", name: resourceId, type: "room", timezone: "UTC" });
      await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId, eventTypeId: seed.eventTypeId });
    }
    await probesOf(t, "booking.cancelled", ["org-1", "org-b", "org-other"]);
    const bundleOf = (resourceIds: string[], h: number) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId, resources: resourceIds.map((resourceId) => ({ resourceId })),
        start: hour(h), end: hour(h + 1), timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
    const storedForB = await bundleOf(["res-1", "res-2"], 8);
    const storedForNone = await bundleOf(["res-1", "res-2"], 10);
    const control = await bundleOf(["res-1", "res-3"], 12);
    expect([storedForB.resourceId, storedForNone.resourceId, control.resourceId]).toEqual(["res-1", "res-1", "res-1"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(storedForB._id, { organizationId: "org-b" });
      await ctx.db.patch(storedForNone._id, { organizationId: undefined });
      await ctx.db.patch(control._id, { organizationId: "org-other" });
    });
    await rehomeResource(t, "res-2", "org-b"); // the primary res-1 stays in org-1

    for (const booking of [storedForB, storedForNone, control]) {
      expect(await t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id })).toEqual({ success: true });
    }
    const organizations = (organizationId: string | undefined) => ({
      stored: organizationId, hook: organizationId, email: organizationId, v1Booking: undefined, v2: organizationId,
    });
    expect({
      storedForB: await outcome(t, storedForB._id, "booking.cancelled"),
      storedForNone: await outcome(t, storedForNone._id, "booking.cancelled"),
      control: await outcome(t, control._id, "booking.cancelled"),
    }).toEqual({
      storedForB: { ...organizations("org-b"), probes: ["probe-v2:org-b", "probe:org-b"] },
      storedForNone: { ...organizations(undefined), probes: [] }, // global hooks only, as before
      control: { ...organizations("org-1"), probes: ["probe-v2:org-1", "probe:org-1"] },
    });
    expect((await t.query(api.public.listBookings, { organizationId: "org-1" })).map((b) => b.uid)).toEqual([control.uid]);
    expect(await integrityIssues(t)).toEqual([
      { check: "booking_integrity", uid: storedForB.uid, problems: ["organizationMismatch"] },
      { check: "booking_integrity", uid: storedForNone.uid, problems: ["organizationMismatch"] },
    ]);
  });
});
