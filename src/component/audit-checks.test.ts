/// <reference types="vite/client" />
/**
 * maintenance.audit: the checks a host runs before upgrading to 0.5.0
 * (plan PR-38). Each reports stored rows that 0.5.0 rejects on write, reads
 * differently or cannot move, with the list of problems per row:
 * - "event_type_config": invalid lengths, options, slot interval, buffers,
 *   notice, horizon or zone, a length outside its options, a dangling
 *   scheduleId;
 * - "schedule_config" / "resource_config": a zone Intl rejects;
 * - "date_override_config": an unknown type, "custom" without hours, a date
 *   that is not a canonical calendar day;
 * - "link_integrity": links to deleted rows, across organizations, and
 *   second rows of a pair;
 * - "booking_integrity": a missing organization the event type has, and
 *   active item-less bookings on pools.
 * Invalid rows are seeded with raw inserts, because the component's writes
 * reject them now; each check has valid controls next to them. Paging uses
 * the complete by_creation_time cursor (audit.test.ts covers ties).
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import type { WithoutSystemFields } from "convex/server";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  modules,
  seedFungibleResource,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type T,
} from "./setup.test.js";

type Check = (typeof api.maintenance.audit)["_args"]["check"];

const audit = (t: T, check: Check, limit = 100, cursor?: string | null) =>
  t.query(api.maintenance.audit, { check, limit, cursor });

/** Every issue of one check, walking all pages. */
async function auditAll(t: T, check: Check, limit = 100) {
  const issues = [];
  let scanned = 0;
  let cursor: string | null = null;
  for (;;) {
    const page = await audit(t, check, limit, cursor);
    issues.push(...page.issues);
    scanned += page.scanned;
    if (page.isDone) return { issues, scanned };
    cursor = page.continueCursor;
  }
}

const at = (time: string) => utc(TUESDAY, time);
const HOUR = 3_600_000;

const EVENT_TYPE: WithoutSystemFields<Doc<"event_types">> = {
  id: "et",
  slug: "et",
  title: "Consultation",
  lengthInMinutes: 60,
  timezone: "Europe/Berlin",
  lockTimeZoneToggle: false,
  locations: [],
  organizationId: ORG,
};

describe("event_type_config", () => {
  test("lists each stored value 0.5.0 rejects; valid event types are not reported", async () => {
    const { t } = setup();
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-1", organizationId: ORG, name: "Schedule", timezone: "Europe/Berlin", weeklyHours: [],
    });
    const rows: Array<Partial<Doc<"event_types">> & { id: string }> = [
      // Controls: valid, options containing the length, empty options, "" schedule, zero buffers and notice.
      { id: "ok" },
      { id: "ok-options", lengthInMinutes: 30, lengthInMinutesOptions: [30, 60], slotInterval: 15, scheduleId: "sch-1" },
      { id: "ok-empty-options", lengthInMinutesOptions: [], scheduleId: "" },
      { id: "ok-zeros", bufferBefore: 0, bufferAfter: 0, minNoticeMinutes: 0, maxFutureMinutes: 0 },
      // Invalid.
      { id: "length", lengthInMinutes: 0 },
      { id: "option", lengthInMinutesOptions: [60, Number.NaN] },
      { id: "not-in-options", lengthInMinutes: 45, lengthInMinutesOptions: [60, 90] },
      { id: "interval", slotInterval: -15 },
      { id: "numbers", bufferBefore: -5, bufferAfter: Number.NaN, minNoticeMinutes: -1, maxFutureMinutes: Number.POSITIVE_INFINITY },
      { id: "zone", timezone: "Mars/Olympus_Mons" },
      { id: "schedule", scheduleId: "ghost" },
    ];
    await t.run(async (ctx) => {
      for (const row of rows) await ctx.db.insert("event_types", { ...EVENT_TYPE, slug: row.id, ...row });
    });

    const { issues, scanned } = await auditAll(t, "event_type_config", 4);
    expect(scanned).toBe(rows.length);
    expect(issues).toEqual([
      { check: "event_type_config", eventTypeId: "length", problems: ["lengthInMinutes"] },
      { check: "event_type_config", eventTypeId: "option", problems: ["lengthInMinutesOptions"] },
      { check: "event_type_config", eventTypeId: "not-in-options", problems: ["lengthNotInOptions"] },
      { check: "event_type_config", eventTypeId: "interval", problems: ["slotInterval"] },
      {
        check: "event_type_config",
        eventTypeId: "numbers",
        problems: ["bufferBefore", "bufferAfter", "minNoticeMinutes", "maxFutureMinutes"],
      },
      { check: "event_type_config", eventTypeId: "zone", problems: ["timezone"] },
      { check: "event_type_config", eventTypeId: "schedule", problems: ["scheduleId"] },
    ]);
  });

  test("event types created through the component are clean", async () => {
    const { t } = setup();
    await seedResourceWithSchedule(t, { eventType: { lengthInMinutesOptions: [60, 90], bufferBefore: 10 } });
    expect(await audit(t, "event_type_config")).toMatchObject({ issues: [], scanned: 1, isDone: true });
  });
});

describe("schedule_config and resource_config", () => {
  test("list zones Intl rejects", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t); // sch-1 and res-1 in Europe/Berlin: controls
    await t.run(async (ctx) => {
      await ctx.db.insert("schedules", {
        id: "sch-bad", organizationId: ORG, name: "Bad", timezone: "UTC+2", isDefault: false, weeklyHours: [], createdAt: 0, updatedAt: 0,
      });
      await ctx.db.insert("resources", {
        id: "res-bad", organizationId: ORG, name: "Bad", type: "room", timezone: "", isActive: true, createdAt: 0, updatedAt: 0,
      });
    });
    expect(await audit(t, "schedule_config")).toMatchObject({
      issues: [{ check: "schedule_config", scheduleId: "sch-bad", problems: ["timezone"] }],
      scanned: 2,
    });
    expect(await audit(t, "resource_config")).toMatchObject({
      issues: [{ check: "resource_config", resourceId: "res-bad", problems: ["timezone"] }],
      scanned: 2,
    });
    expect(seed.scheduleId).toBe("sch-1");
  });
});

describe("date_override_config", () => {
  test("lists unknown types, custom overrides without hours and dates that are not canonical", async () => {
    const { t } = setup();
    const { scheduleDocId } = await seedResourceWithSchedule(t);
    const hours = [{ startTime: "09:00", endTime: "12:00" }];
    // Controls, through the component.
    await t.mutation(api.schedules.createDateOverride, { scheduleId: scheduleDocId, date: "2027-03-10", type: "unavailable" });
    await t.mutation(api.schedules.createDateOverride, { scheduleId: scheduleDocId, date: "2027-03-11", type: "custom", customHours: hours });
    const bad: Array<Omit<Doc<"date_overrides">, "_id" | "_creationTime" | "scheduleId">> = [
      { date: "2027-03-12", type: "holiday", customHours: hours },
      { date: "2027-03-15", type: "holiday" },
      { date: "2027-03-16", type: "custom" },
      { date: "2027-03-17", type: "custom", customHours: [] },
      { date: "2027-02-30", type: "unavailable" },
      { date: "2027-3-18", type: "unavailable" },
    ];
    const ids = await t.run(async (ctx) => {
      const inserted = [];
      for (const row of bad) inserted.push(await ctx.db.insert("date_overrides", { scheduleId: scheduleDocId, ...row }));
      return inserted;
    });

    const { issues, scanned } = await auditAll(t, "date_override_config");
    expect(scanned).toBe(8);
    expect(issues).toEqual([
      { check: "date_override_config", overrideId: ids[0], date: "2027-03-12", type: "holiday", problems: ["type"] },
      { check: "date_override_config", overrideId: ids[1], date: "2027-03-15", type: "holiday", problems: ["type"] },
      { check: "date_override_config", overrideId: ids[2], date: "2027-03-16", type: "custom", problems: ["customHours"] },
      { check: "date_override_config", overrideId: ids[3], date: "2027-03-17", type: "custom", problems: ["customHours"] },
      { check: "date_override_config", overrideId: ids[4], date: "2027-02-30", type: "unavailable", problems: ["date"] },
      { check: "date_override_config", overrideId: ids[5], date: "2027-3-18", type: "unavailable", problems: ["date"] },
    ]);
  });
});

describe("link_integrity", () => {
  test("lists dangling, cross-organization and duplicate links; the first row of a pair and valid links are not reported", async () => {
    const { t } = setup();
    await seedResource(t); // res-1 ↔ et-1, both org-1: control
    await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2", organizationId: "org-2" });
    // An event type without organization links any organization's resource: control.
    await t.mutation(api.public.createEventType, { ...EVENT_TYPE, id: "et-global", slug: "et-global", organizationId: undefined });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "res-2", eventTypeId: "et-global" });
    await t.run(async (ctx) => {
      await ctx.db.insert("resource_event_types", { resourceId: "res-2", eventTypeId: "et-1" }); // across organizations
      await ctx.db.insert("resource_event_types", { resourceId: "res-1", eventTypeId: "et-1" }); // second row of a pair
      await ctx.db.insert("resource_event_types", { resourceId: "gone", eventTypeId: "et-1" });
      await ctx.db.insert("resource_event_types", { resourceId: "res-1", eventTypeId: "gone" });
      await ctx.db.insert("resource_event_types", { resourceId: "gone", eventTypeId: "gone" });
    });

    const { issues, scanned } = await auditAll(t, "link_integrity", 2);
    expect(scanned).toBe(8);
    expect(issues).toEqual([
      { check: "link_integrity", resourceId: "res-2", eventTypeId: "et-1", problems: ["crossOrganization"] },
      { check: "link_integrity", resourceId: "res-1", eventTypeId: "et-1", problems: ["duplicate"] },
      { check: "link_integrity", resourceId: "gone", eventTypeId: "et-1", problems: ["resourceMissing"] },
      { check: "link_integrity", resourceId: "res-1", eventTypeId: "gone", problems: ["eventTypeMissing"] },
      { check: "link_integrity", resourceId: "gone", eventTypeId: "gone", problems: ["resourceMissing", "eventTypeMissing"] },
    ]);

    // CONTROL: relinking the pair collapses the duplicate, and the report follows.
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "res-1", eventTypeId: "et-1" });
    expect((await auditAll(t, "link_integrity")).issues.map((issue) => ("problems" in issue ? issue.problems : null))).toEqual([
      ["crossOrganization"], ["resourceMissing"], ["eventTypeMissing"], ["resourceMissing", "eventTypeMissing"],
    ]);
  });
});

describe("booking_integrity", () => {
  test("lists missing organizations the event type has and active item-less bookings on pools", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });
    await t.mutation(api.public.createEventType, { ...EVENT_TYPE, id: "et-global", slug: "et-global", organizationId: undefined });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: seed.resourceId, eventTypeId: "et-global" });

    const clean = await book(t, seed, at("08:00"), at("08:00") + HOUR); // control
    const noOrg = await book(t, seed, at("09:00"), at("09:00") + HOUR);
    const global = await book(t, { ...seed, eventTypeId: "et-global" }, at("10:00"), at("10:00") + HOUR); // control
    const legacyId = await t.mutation(api.public.createReservation, {
      resourceId: seed.resourceId, actorId: BOOKER.email, start: at("11:00"), end: at("11:00") + HOUR,
    }); // control: legacy rows never have one
    const stranded = await book(t, seed, at("12:00"), at("12:00") + HOUR);
    const ended = await book(t, seed, at("13:00"), at("13:00") + HOUR);
    await t.mutation(api.public.cancelBookingByToken, { uid: ended.uid, token: ended.managementToken! });
    const bundle = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId, resources: [{ resourceId: seed.resourceId }, { resourceId: "pool-1", quantity: 1 }],
      start: at("14:00"), end: at("14:00") + HOUR, timezone: "UTC", booker: BOOKER, location: LOCATION,
    }); // control: a bundle keeps its items
    await t.run(async (ctx) => {
      await ctx.db.patch(noOrg._id, { organizationId: undefined });
      // A 0.4.x flag change updateResource now refuses: res-1 becomes a pool of one.
      const resource = await ctx.db.query("resources").withIndex("by_external_id", (q) => q.eq("id", seed.resourceId)).unique();
      await ctx.db.patch(resource!._id, { isFungible: true });
    });

    const { issues, scanned } = await auditAll(t, "booking_integrity", 3);
    expect(scanned).toBe(7);
    // Every active single booking on res-1 is stranded now, the clean one included.
    expect(issues).toEqual([
      { check: "booking_integrity", uid: clean.uid, problems: ["poolWithoutItems"] },
      { check: "booking_integrity", uid: noOrg.uid, problems: ["organizationMissing", "poolWithoutItems"] },
      { check: "booking_integrity", uid: global.uid, problems: ["poolWithoutItems"] },
      { check: "booking_integrity", uid: (await t.query(api.public.getBooking, { bookingId: legacyId }))!.uid, problems: ["poolWithoutItems"] },
      { check: "booking_integrity", uid: stranded.uid, problems: ["poolWithoutItems"] },
    ]);
    expect(issues.map((issue) => (issue.check === "booking_integrity" ? issue.uid : null))).not.toContain(bundle.uid);
    expect(issues.map((issue) => (issue.check === "booking_integrity" ? issue.uid : null))).not.toContain(ended.uid);
  });

  test("without a pool flag only the missing organization is reported, and the backfill clears it", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const noOrg = await book(t, seed, at("09:00"), at("09:00") + HOUR);
    await book(t, seed, at("10:00"), at("10:00") + HOUR); // control
    await t.run(async (ctx) => ctx.db.patch(noOrg._id, { organizationId: undefined }));
    expect((await audit(t, "booking_integrity")).issues).toEqual([
      { check: "booking_integrity", uid: noOrg.uid, problems: ["organizationMissing"] },
    ]);
    await t.mutation(api.maintenance.backfillBookingOrganizations, { limit: 100, dryRun: false });
    expect((await audit(t, "booking_integrity")).issues).toEqual([]);
  });
});

describe("paging over the new tables", () => {
  test("a cursor of another table is rejected; a restart from a returned cursor continues there", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await book(t, seed, at("09:00"), at("09:00") + HOUR);
    const bookingCursor = (await audit(t, "booking_integrity", 1)).continueCursor;
    for (const check of ["event_type_config", "schedule_config", "resource_config", "date_override_config", "link_integrity"] as const) {
      await expect(audit(t, check, 1, bookingCursor)).rejects.toThrow("Invalid audit cursor");
    }
    // Two checks of one table share its cursors.
    const eventCursor = (await audit(t, "event_length_invalid", 1)).continueCursor;
    expect(await audit(t, "event_type_config", 10, eventCursor)).toMatchObject({ scanned: 0, isDone: true });
  });

  test("a full page of the costliest checks fits Convex's default limits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    try {
      const t: T = convexTest({ schema, modules, transactionLimits: true });
      // 500 of each, every row with its own event type and pool: no lookup is shared.
      await t.run(async (ctx) => {
        for (let i = 0; i < 500; i++) {
          await ctx.db.insert("event_types", { ...EVENT_TYPE, id: `et-${i}`, slug: `et-${i}`, scheduleId: `gone-${i}` });
          await ctx.db.insert("resources", {
            id: `pool-${i}`, organizationId: "org-2", name: "Pool", type: "equipment", timezone: "UTC",
            isFungible: true, quantity: 1, isActive: true, createdAt: 0, updatedAt: 0,
          });
          await ctx.db.insert("resource_event_types", { resourceId: `pool-${i}`, eventTypeId: `et-${i}` });
          await ctx.db.insert("bookings", {
            resourceId: `pool-${i}`, actorId: BOOKER.email, start: at("09:00"), end: at("10:00"), status: "confirmed",
            uid: `bk-${i}`, eventTypeId: `et-${i}`, timezone: "UTC", bookerName: BOOKER.name, bookerEmail: BOOKER.email,
            eventTitle: "Consultation", location: { type: "address" }, createdAt: 0, updatedAt: 0,
          });
        }
      });
      for (const check of ["event_type_config", "link_integrity", "booking_integrity"] as const) {
        const page = await audit(t, check, 500);
        expect({ check, scanned: page.scanned, issues: page.issues.length }).toEqual({ check, scanned: 500, issues: 500 });
      }
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
