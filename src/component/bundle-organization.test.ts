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
 * argument is the fallback.
 */
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
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
    expect((await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId })).organizationId).toBeUndefined();

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
