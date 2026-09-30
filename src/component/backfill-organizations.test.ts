/// <reference types="vite/client" />
/**
 * maintenance.backfillBookingOrganizations (F7 repair, PR-28).
 *
 * Bundles created by 0.4.2 and earlier without `organizationId` stored none,
 * and no other function can set a booking's organization. The backfill fills
 * it from the event type, skips legacy rows and rows whose event type is gone
 * or has no organization, and reports (never rewrites) rows whose
 * organization differs from their event type's. The cursor is the complete
 * by_creation_time key, as in maintenance.audit.
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  modules,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const hour = (h: number) => utc(TUESDAY, `${String(h).padStart(2, "0")}:00`);

const backfill = (t: T, args: { limit: number; dryRun: boolean; cursor?: string | null }) =>
  t.mutation(api.maintenance.backfillBookingOrganizations, args);

/** Every page from the start. */
async function backfillAll(t: T, limit: number, dryRun = false) {
  const pages = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await backfill(t, { limit, dryRun, cursor });
    pages.push(page);
    if (page.isDone) return pages;
    cursor = page.continueCursor;
  }
}

/** Stored organization per booking uid. */
async function organizations(t: T): Promise<Record<string, string | undefined>> {
  const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
  return Object.fromEntries(rows.map((row) => [row.uid, row.organizationId]));
}

/** Removes a row's organization, as 0.4.2 stored bundles created without one. */
function dropOrganization(t: T, bookingId: Id<"bookings">) {
  return t.run((ctx) => ctx.db.patch(bookingId, { organizationId: undefined }));
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

/**
 * One row per case on res-1 (org-1): complete, missing (bundle and a moved
 * single booking, whose successor copied the gap), foreign, legacy, deleted
 * event type and event type without organization.
 */
async function seedMixed(t: T) {
  const seed = await seedResource(t);
  await t.mutation(api.public.createEventType, {
    id: "et-no-org", slug: "et-no-org", title: "No organization", lengthInMinutes: 60,
    timezone: "UTC", lockTimeZoneToggle: false, locations: [],
  });
  await t.mutation(api.public.createEventType, {
    id: "et-gone", slug: "et-gone", title: "Deleted", lengthInMinutes: 60,
    timezone: "UTC", lockTimeZoneToggle: false, locations: [], organizationId: ORG,
  });
  // Bundle items are linked to their event type (required since 0.5.0).
  await t.mutation(api.resource_event_types.setEventTypesForResource, {
    resourceId: seed.resourceId, eventTypeIds: [seed.eventTypeId, "et-no-org", "et-gone"],
  });

  const complete = await book(t, seed, hour(6), hour(7));
  const missing = await bundle(t, seed.eventTypeId, 7);
  await dropOrganization(t, missing._id);
  const movedAway = await book(t, seed, hour(8), hour(9));
  await dropOrganization(t, movedAway._id);
  const successor = await t.mutation(api.public.rescheduleBooking, {
    bookingId: movedAway._id,
    newStart: hour(9),
    newEnd: hour(10),
  });
  // A foreign organization as 0.4.x stored it (rejected at creation since 0.5.0).
  const foreign = await bundle(t, seed.eventTypeId, 10);
  await t.run((ctx) => ctx.db.patch(foreign._id, { organizationId: "org-2" }));
  const legacyId = await t.mutation(api.public.createReservation, {
    resourceId: seed.resourceId, actorId: "ops@example.com", start: hour(11), end: hour(12),
  });
  const legacy = (await t.query(api.public.getBooking, { bookingId: legacyId }))!;
  const gone = await bundle(t, "et-gone", 12);
  await dropOrganization(t, gone._id);
  await t.run(async (ctx) => {
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", "et-gone"))
      .unique();
    await ctx.db.delete(eventType!._id); // deleteEventType refuses while bookings exist
  });
  const noOrg = await bundle(t, "et-no-org", 13);

  const rows = { complete, missing, movedAway, successor, foreign, legacy, gone, noOrg };
  // CONTROL: the fixture holds the gaps it claims.
  expect(await organizations(t)).toEqual({
    [complete.uid]: ORG,
    [missing.uid]: undefined,
    [movedAway.uid]: undefined,
    [successor.uid]: undefined,
    [foreign.uid]: "org-2",
    [legacy.uid]: undefined,
    [gone.uid]: undefined,
    [noOrg.uid]: undefined,
  });
  return rows;
}

describe("backfillBookingOrganizations", () => {
  test("a dry run counts and reports but writes nothing", async () => {
    const { t } = setup();
    const rows = await seedMixed(t);
    const before = await organizations(t);

    expect(await backfill(t, { limit: 100, dryRun: true })).toEqual({
      scanned: 8,
      updated: 3,
      skipped: 3,
      mismatches: [{ uid: rows.foreign.uid, organizationId: "org-2", eventTypeOrganizationId: ORG }],
      continueCursor: expect.any(String),
      isDone: true,
    });
    expect(await organizations(t)).toEqual(before);
  });

  test("a run fills only missing organizations, leaves mismatches, and a second run changes nothing", async () => {
    const { t } = setup();
    const rows = await seedMixed(t);

    const first = await backfill(t, { limit: 100, dryRun: false });
    expect(first).toMatchObject({ scanned: 8, updated: 3, skipped: 3, isDone: true });
    expect(await organizations(t)).toEqual({
      [rows.complete.uid]: ORG,
      [rows.missing.uid]: ORG,
      [rows.movedAway.uid]: ORG,
      [rows.successor.uid]: ORG,
      [rows.foreign.uid]: "org-2", // reported, not rewritten
      [rows.legacy.uid]: undefined,
      [rows.gone.uid]: undefined,
      [rows.noOrg.uid]: undefined,
    });
    // The repaired rows are listed for their organization now.
    const listed = (await t.query(api.public.listBookings, { organizationId: ORG, status: "confirmed" })).map(
      (booking) => booking.uid
    );
    expect(listed.sort()).toEqual([rows.complete.uid, rows.missing.uid, rows.successor.uid].sort());

    const second = await backfill(t, { limit: 100, dryRun: false });
    expect(second).toEqual({ ...first, updated: 0, continueCursor: expect.any(String) });
  });
});

describe("paging", () => {
  /** `count` bundles of et-1 without organization, 00:00, 01:00, … on res-1. */
  async function seedMissing(t: T, count: number): Promise<Doc<"bookings">[]> {
    const seed = await seedResource(t);
    const bookings = [];
    for (let i = 0; i < count; i++) {
      const created = await bundle(t, seed.eventTypeId, i);
      await dropOrganization(t, created._id);
      bookings.push(created);
    }
    return bookings;
  }

  test.each([
    [7, 3, [3, 3, 1]],
    [6, 3, [3, 3, 0]],
    [2, 5, [2]],
  ])("%i rows with limit %i: pages of %j, each row updated once", async (count, limit, sizes) => {
    const { t } = setup();
    await seedMissing(t, count);
    const pages = await backfillAll(t, limit);
    expect(pages.map((page) => page.scanned)).toEqual(sizes);
    expect(pages.map((page) => page.updated)).toEqual(sizes);
    expect(pages.map((page) => page.isDone)).toEqual(sizes.map((_, i) => i === sizes.length - 1));
    expect(Object.values(await organizations(t))).toEqual(Array(count).fill(ORG));
  });

  test("a restart from an issued cursor continues there; a deleted cursor row does not stop the walk", async () => {
    const { t } = setup();
    const bookings = await seedMissing(t, 5);
    const first = await backfill(t, { limit: 2, dryRun: true });
    expect(first).toMatchObject({ scanned: 2, updated: 2 });
    await t.run((ctx) => ctx.db.delete(bookings[1]._id)); // the row the cursor names
    const rest = await backfill(t, { limit: 10, dryRun: false, cursor: first.continueCursor });
    expect(rest).toMatchObject({ scanned: 3, updated: 3, isDone: true });
    // The dry-run page was not written; a fresh run picks it up.
    expect(await backfill(t, { limit: 10, dryRun: false })).toMatchObject({ scanned: 4, updated: 1 });
  });

  test("rows with equal creation times are neither skipped nor repeated at a page boundary", async () => {
    // Far enough in the future that convex-test's creation-time bump rounds
    // away: rows inserted at one instant share a _creationTime, as imported
    // rows can in production.
    const TIED_NOW = Date.UTC(2600, 0, 1);
    const { t } = setup({ now: TIED_NOW });
    await seedResource(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("bookings", {
          resourceId: "res-1", actorId: "ada@example.com", start: hour(i), end: hour(i + 1),
          status: "confirmed", uid: `tied-${i}`, eventTypeId: "et-1", timezone: "UTC",
          bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Consultation",
          location: { type: "address" }, createdAt: 0, updatedAt: 0,
        });
      }
    });
    vi.setSystemTime(TIED_NOW + 1_000);
    const later = await bundle(t, "et-1", 10);
    await dropOrganization(t, later._id);
    const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
    // CONTROL: one tie group of five, then one later row.
    const tied = rows.filter((row) => row.uid.startsWith("tied-"));
    expect(new Set(tied.map((row) => row._creationTime)).size).toBe(1);
    expect(rows.filter((row) => row._creationTime > tied[0]._creationTime)).toHaveLength(1);

    const pages = await backfillAll(t, 2);
    expect(pages.map((page) => page.scanned)).toEqual([2, 2, 2, 0]);
    expect(pages.map((page) => page.updated)).toEqual([2, 2, 2, 0]);
    expect(Object.values(await organizations(t))).toEqual(Array(6).fill(ORG));
  });

  test("rejects a limit outside 1–500 and a cursor it did not issue", async () => {
    const { t } = setup();
    await seedMissing(t, 2);
    for (const limit of [0, -1, 2.5, 501, Number.NaN]) {
      await expect(backfill(t, { limit, dryRun: true })).rejects.toThrow("limit must be an integer from 1 to 500");
    }
    const eventType = (await t.query(api.public.getEventType, { eventTypeId: "et-1" }))!;
    for (const cursor of ["", "nope", "[1]", JSON.stringify([1, eventType._id])]) {
      await expect(backfill(t, { limit: 1, dryRun: true, cursor })).rejects.toThrow("Invalid backfill cursor");
    }
    // CONTROL: the bounds and an issued cursor are accepted.
    const first = await backfill(t, { limit: 1, dryRun: true });
    expect(await backfill(t, { limit: 500, dryRun: true, cursor: first.continueCursor })).toMatchObject({ scanned: 1 });
  });

  test("a full page fits Convex's default limits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    try {
      const t: T = convexTest({ schema, modules, transactionLimits: true });
      await t.run(async (ctx) => {
        for (let i = 0; i < 500; i++) {
          await ctx.db.insert("event_types", {
            id: `et-${i}`, slug: `et-${i}`, title: "Consultation", lengthInMinutes: 60,
            timezone: "UTC", lockTimeZoneToggle: false, locations: [], organizationId: ORG,
          });
          const start = FIXED_NOW + i * 60 * 60 * 1000;
          await ctx.db.insert("bookings", {
            resourceId: "res-1", actorId: "ada@example.com", start, end: start + 60 * 60 * 1000,
            status: "confirmed", uid: `bk-${i}`, eventTypeId: `et-${i}`, timezone: "UTC",
            bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Consultation",
            location: { type: "address" }, createdAt: 0, updatedAt: 0,
          });
        }
      });
      expect(await backfill(t, { limit: 500, dryRun: false })).toMatchObject({ scanned: 500, updated: 500 });
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
