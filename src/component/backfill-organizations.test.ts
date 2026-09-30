/// <reference types="vite/client" />
/**
 * maintenance.backfillBookingOrganizations (F7 repair, PR-28).
 *
 * Bundles created by 0.4.2 and earlier without `organizationId` stored none.
 * Since 0.5.0 a booking takes its event type's organization when it is
 * moved, transitioned or cancelled; for the untouched ones the backfill fills
 * it from the event type only when every resource the booking occupies
 * exists and belongs to that organization too: an event type can move to
 * another organization later, and that organization must not receive older
 * bookings (booker details, management token) through its booking list. It
 * skips legacy rows, lists the rows it cannot assign in `needsReview` with a
 * reason, and reports (never rewrites) rows whose organization differs from
 * their event type's. The cursor is the complete by_creation_time key, as in
 * maintenance.audit.
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
 * One row per case on res-1 (org-1): complete, missing (a bundle), a moved
 * single booking stored without organization (since 0.5.0 the move gives
 * the original and its successor the event type's organization), foreign,
 * legacy, deleted event type and event type without organization.
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
    [movedAway.uid]: ORG, // a move fills the gap on both rows (0.5.0)
    [successor.uid]: ORG,
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
      updated: 1,
      skipped: 3,
      mismatches: [{ uid: rows.foreign.uid, organizationId: "org-2", eventTypeOrganizationId: ORG }],
      needsReview: [
        { uid: rows.gone.uid, eventTypeId: "et-gone", reason: "event_type_missing" },
        { uid: rows.noOrg.uid, eventTypeId: "et-no-org", reason: "event_type_without_organization" },
      ],
      continueCursor: expect.any(String),
      isDone: true,
    });
    expect(await organizations(t)).toEqual(before);
  });

  test("a run fills only missing organizations, leaves mismatches, and a second run changes nothing", async () => {
    const { t } = setup();
    const rows = await seedMixed(t);

    const first = await backfill(t, { limit: 100, dryRun: false });
    expect(first).toMatchObject({ scanned: 8, updated: 1, skipped: 3, isDone: true });
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

describe("the booking's resources must corroborate the event type's organization", () => {
  /**
   * A bundle of et-1 over `resourceIds` as 0.4.2 stored it: without
   * organization, and with items 0.5.0 rejects (unlinked, unknown or another
   * organization's resources).
   */
  function orphanBundle(t: T, resourceIds: string[], h: number) {
    return t.run(async (ctx) => {
      const bookingId = await ctx.db.insert("bookings", {
        resourceId: resourceIds[0], actorId: BOOKER.email, start: hour(h), end: hour(h + 1),
        status: "confirmed", uid: `orphan-${h}`, eventTypeId: "et-1", timezone: "UTC",
        bookerName: BOOKER.name, bookerEmail: BOOKER.email, eventTitle: "Consultation",
        location: LOCATION, createdAt: 0, updatedAt: 0,
      });
      for (const resourceId of resourceIds) {
        await ctx.db.insert("booking_items", { bookingId, resourceId, quantity: 1 });
      }
      return (await ctx.db.get(bookingId))!;
    });
  }

  const listed = async (t: T, organizationId: string) =>
    (await t.query(api.public.listBookings, { organizationId })).map((booking) => booking.uid).sort();

  /** Moves et-1 to `organizationId`, as a host re-homing the event type. */
  function rehomeEventType(t: T, organizationId: string) {
    return t.run(async (ctx) => {
      const eventType = await ctx.db
        .query("event_types")
        .withIndex("by_external_id", (q) => q.eq("id", "et-1"))
        .unique();
      await ctx.db.patch(eventType!._id, { organizationId });
    });
  }

  test("a bundle whose resources all belong to the event type's organization is written", async () => {
    const { t } = setup();
    await seedResource(t); // res-1 and et-1 in org-1
    await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" }); // res-2 in org-1
    const bundle = await orphanBundle(t, ["res-1", "res-2"], 9);

    expect(await backfill(t, { limit: 10, dryRun: false })).toMatchObject({ updated: 1, skipped: 0, needsReview: [] });
    expect(await organizations(t)).toEqual({ [bundle.uid]: ORG });
    expect(await listed(t, ORG)).toEqual([bundle.uid]);
  });

  test("an event type re-homed to another organization: older bookings are reported, not handed to it", async () => {
    const { t } = setup();
    await seedResource(t); // res-1 and et-1 in org-1
    await seedResource(t, { resourceId: "res-3", eventTypeId: "et-3", organizationId: "org-2" });
    const older = await orphanBundle(t, ["res-1"], 9);
    await rehomeEventType(t, "org-2");
    // CONTROL: a bundle of org-2's own inventory after the move is written.
    const newer = await orphanBundle(t, ["res-3"], 11);
    const review = {
      uid: older.uid,
      eventTypeId: "et-1",
      reason: "resource_organization_differs",
      eventTypeOrganizationId: "org-2",
      resourceId: "res-1",
      resourceOrganizationId: ORG,
    };

    const dryRun = await backfill(t, { limit: 10, dryRun: true });
    expect(dryRun).toMatchObject({ scanned: 2, updated: 1, skipped: 1, needsReview: [review] });
    expect(await organizations(t)).toEqual({ [older.uid]: undefined, [newer.uid]: undefined });

    expect(await backfill(t, { limit: 10, dryRun: false })).toEqual(dryRun);
    expect(await organizations(t)).toEqual({ [older.uid]: undefined, [newer.uid]: "org-2" });
    // org-2 does not list the older booking, its booker or its token.
    expect(await listed(t, "org-2")).toEqual([newer.uid]);
    expect(await listed(t, ORG)).toEqual([]);
  });

  test("a secondary resource of another organization is reported as well", async () => {
    const { t } = setup();
    await seedResource(t); // res-1 and et-1 in org-1
    await seedResource(t, { resourceId: "res-3", eventTypeId: "et-3", organizationId: "org-2" });
    const mixed = await orphanBundle(t, ["res-1", "res-3"], 9);

    expect(await backfill(t, { limit: 10, dryRun: false })).toMatchObject({
      updated: 0,
      skipped: 1,
      needsReview: [
        {
          uid: mixed.uid,
          eventTypeId: "et-1",
          reason: "resource_organization_differs",
          eventTypeOrganizationId: ORG,
          resourceId: "res-3",
          resourceOrganizationId: "org-2",
        },
      ],
    });
    expect(await organizations(t)).toEqual({ [mixed.uid]: undefined });
  });

  test("a resource without a document is reported, the booking left without organization", async () => {
    const { t } = setup();
    await seedResource(t); // res-1 and et-1 in org-1
    await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    // 0.4.2 bundles accepted resource ids without a document.
    const unknown = await orphanBundle(t, ["res-1", "res-unknown"], 9);
    const deleted = await orphanBundle(t, ["res-2"], 11);
    await t.run(async (ctx) => {
      const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", "res-2"))
        .unique();
      await ctx.db.delete(resource!._id); // deleteResource refuses while bookings exist
    });
    // CONTROL: a bundle of res-1 alone is written.
    const complete = await orphanBundle(t, ["res-1"], 13);

    expect(await backfill(t, { limit: 10, dryRun: false })).toMatchObject({
      updated: 1,
      skipped: 2,
      needsReview: [
        { uid: unknown.uid, eventTypeId: "et-1", reason: "resource_missing", eventTypeOrganizationId: ORG, resourceId: "res-unknown" },
        { uid: deleted.uid, eventTypeId: "et-1", reason: "resource_missing", eventTypeOrganizationId: ORG, resourceId: "res-2" },
      ],
    });
    expect(await organizations(t)).toEqual({ [unknown.uid]: undefined, [deleted.uid]: undefined, [complete.uid]: ORG });
  });

  /**
   * et-g, stored without organization and later given org-a as 0.4.x let
   * createEventType do while a resource of org-b stayed linked (0.5.0
   * refuses that adoption): res-a (org-a) and res-b (org-b) are linked.
   */
  async function seedAdopted(t: T) {
    await t.mutation(api.public.createEventType, {
      id: "et-g", slug: "et-g", title: "Global", lengthInMinutes: 60, timezone: "UTC",
      lockTimeZoneToggle: false, locations: [],
    });
    for (const [id, organizationId] of [["res-a", "org-a"], ["res-b", "org-b"]]) {
      await t.mutation(api.resources.createResource, { id, organizationId, name: id, type: "room", timezone: "UTC" });
      await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: id, eventTypeId: "et-g" });
    }
    const on = (resourceIds: string[], h: number) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: "et-g", resources: resourceIds.map((resourceId) => ({ resourceId })),
        start: hour(h), end: hour(h + 1), timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
    const ownSingle = await book(t, { resourceId: "res-a", eventTypeId: "et-g", timezone: "UTC" }, hour(8), hour(9));
    const otherSingle = await book(t, { resourceId: "res-b", eventTypeId: "et-g", timezone: "UTC" }, hour(8), hour(9));
    const ownBundle = await on(["res-a"], 10);
    const mixedBundle = await on(["res-a"], 11);
    const ghostBundle = await on(["res-a"], 12);
    await t.run(async (ctx) => {
      const eventType = await ctx.db.query("event_types").withIndex("by_external_id", (q) => q.eq("id", "et-g")).unique();
      await ctx.db.patch(eventType!._id, { organizationId: "org-a" });
      // 0.4.x bundles: an item of another organization, and an id without a resource.
      await ctx.db.insert("booking_items", { bookingId: mixedBundle._id, resourceId: "res-b", quantity: 1 });
      await ctx.db.insert("booking_items", { bookingId: ghostBundle._id, resourceId: "no-such-resource", quantity: 1 });
    });
    // CONTROL: none has an organization (a global event type's bookings store none).
    expect(Object.values(await organizations(t))).toEqual(Array(5).fill(undefined));
    return { ownSingle, otherSingle, ownBundle, mixedBundle, ghostBundle };
  }

  test("an event type given an organization later: only bookings on its resources are filled, the audit agrees", async () => {
    const { t } = setup();
    const rows = await seedAdopted(t);
    const review = { eventTypeId: "et-g", eventTypeOrganizationId: "org-a" };
    const differs = { reason: "resource_organization_differs", resourceId: "res-b", resourceOrganizationId: "org-b" };

    const dry = await backfill(t, { limit: 100, dryRun: true });
    expect(dry).toMatchObject({
      scanned: 5, updated: 2, skipped: 3, mismatches: [],
      needsReview: [
        { uid: rows.otherSingle.uid, ...review, ...differs },
        { uid: rows.mixedBundle.uid, ...review, ...differs },
        { uid: rows.ghostBundle.uid, ...review, reason: "resource_missing", resourceId: "no-such-resource" },
      ],
    });
    expect(await backfill(t, { limit: 100, dryRun: false })).toEqual({ ...dry, continueCursor: expect.any(String) });
    expect(await organizations(t)).toEqual({
      [rows.ownSingle.uid]: "org-a",
      [rows.ownBundle.uid]: "org-a",
      [rows.otherSingle.uid]: undefined, // org-b's booking is not stamped with org-a
      [rows.mixedBundle.uid]: undefined,
      [rows.ghostBundle.uid]: undefined,
    });
    // org-a lists, and its hooks would receive, only its own bookings.
    expect(await listed(t, "org-a")).toEqual([rows.ownSingle.uid, rows.ownBundle.uid].sort());
    // The audit agrees: the rest are mismatches, not fillable gaps.
    const integrity = await t.query(api.maintenance.audit, { check: "booking_integrity", limit: 100 });
    expect(integrity.issues).toEqual(
      [rows.otherSingle, rows.mixedBundle, rows.ghostBundle].map((booking) => ({
        check: "booking_integrity", uid: booking.uid, problems: ["organizationMismatch"],
      }))
    );
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
      // 500 bundles, each with its own event type and two resources of its own.
      for (let batch = 0; batch < 5; batch++) {
        await t.run(async (ctx) => {
          for (let i = batch * 100; i < (batch + 1) * 100; i++) {
            await ctx.db.insert("event_types", {
              id: `et-${i}`, slug: `et-${i}`, title: "Consultation", lengthInMinutes: 60,
              timezone: "UTC", lockTimeZoneToggle: false, locations: [], organizationId: ORG,
            });
            const resourceIds = [`res-${i}`, `add-${i}`];
            for (const id of resourceIds) {
              await ctx.db.insert("resources", {
                id, organizationId: ORG, name: id, type: "room", timezone: "UTC", isActive: true,
                createdAt: 0, updatedAt: 0,
              });
            }
            const start = FIXED_NOW + i * 60 * 60 * 1000;
            const bookingId = await ctx.db.insert("bookings", {
              resourceId: resourceIds[0], actorId: "ada@example.com", start, end: start + 60 * 60 * 1000,
              status: "confirmed", uid: `bk-${i}`, eventTypeId: `et-${i}`, timezone: "UTC",
              bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Consultation",
              location: { type: "address" }, createdAt: 0, updatedAt: 0,
            });
            for (const resourceId of resourceIds) {
              await ctx.db.insert("booking_items", { bookingId, resourceId, quantity: 1 });
            }
          }
        });
      }
      expect(await backfill(t, { limit: 500, dryRun: false })).toMatchObject({ scanned: 500, updated: 500 });
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
