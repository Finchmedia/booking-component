/// <reference types="vite/client" />
/**
 * maintenance.audit: read-only upgrade checks over stored rows (PR-38a).
 *
 * - "f10_weekday" lists upcoming active bookings that lie outside the hours
 *   of their own weekday on dates where 0.4.2 used the next weekday's hours.
 * - "event_length_invalid" lists event types with a length that is not a
 *   positive number.
 * One check and one page per call; the cursor is the complete
 * by_creation_time key, so rows with equal creation times are neither skipped
 * nor repeated.
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  FIXED_NOW,
  ORG,
  book,
  modules,
  seedResource,
  seedResourceWithSchedule,
  setup,
  zoned,
  type T,
} from "./setup.test.js";

const AUCKLAND = "Pacific/Auckland";
type Check = "f10_weekday" | "event_length_invalid";

const audit = (t: T, check: Check, limit: number, cursor?: string | null) =>
  t.query(api.maintenance.audit, { check, limit, cursor });

/** Every page of one check, from the start. */
async function auditAll(t: T, check: Check, limit: number) {
  const pages = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await audit(t, check, limit, cursor);
    pages.push(page);
    if (page.isDone) return pages;
    cursor = page.continueCursor;
  }
}

describe("f10_weekday", () => {
  test("Auckland Mon–Fri: a Sunday booking is reported, a Friday booking is not", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { timezone: AUCKLAND, date: "2027-06-06" });
    // createBooking has no opening-hours check, like hosts without a guard.
    const sunday = await book(t, seed, zoned("2027-06-06", "10:00", AUCKLAND), zoned("2027-06-06", "11:00", AUCKLAND));
    await book(t, seed, zoned("2027-06-11", "10:00", AUCKLAND), zoned("2027-06-11", "11:00", AUCKLAND)); // Friday
    await book(t, seed, zoned("2027-06-08", "10:00", AUCKLAND), zoned("2027-06-08", "11:00", AUCKLAND)); // Tuesday

    expect(await audit(t, "f10_weekday", 100)).toEqual({
      issues: [
        {
          check: "f10_weekday",
          uid: sunday.uid,
          start: sunday.start,
          scheduleId: seed.scheduleId,
          date: "2027-06-06",
        },
      ],
      scanned: 3,
      continueCursor: expect.any(String),
      isDone: true,
    });
  });

  test("cancelled, past and overridden bookings and unaffected zones and dates are not reported", async () => {
    const { t } = setup();
    const nz = await seedResourceWithSchedule(t, { timezone: AUCKLAND });
    const at = (date: string, time: string, tz = AUCKLAND) => zoned(date, time, tz);
    const reported = await book(t, nz, at("2027-06-13", "10:00"), at("2027-06-13", "11:00")); // Sunday: reported (control)
    const cancelled = await book(t, nz, at("2027-06-20", "10:00"), at("2027-06-20", "11:00"));
    await t.mutation(api.public.cancelBookingByToken, { uid: cancelled.uid, token: cancelled.managementToken! });
    await book(t, nz, at("2027-02-21", "10:00"), at("2027-02-21", "11:00")); // Sunday before FIXED_NOW
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: nz.scheduleDocId,
      date: "2027-06-27",
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });
    await book(t, nz, at("2027-06-27", "10:00"), at("2027-06-27", "11:00")); // Sunday with an override

    // Berlin (+2) and Norfolk in standard time (+11) never used the next weekday.
    for (const [key, tz, date] of [
      ["berlin", "Europe/Berlin", "2027-06-13"],
      ["norfolk", "Pacific/Norfolk", "2027-06-13"],
    ]) {
      const other = await seedResourceWithSchedule(t, {
        resourceId: `res-${key}`,
        eventTypeId: `et-${key}`,
        scheduleId: `sch-${key}`,
        timezone: tz,
      });
      await book(t, other, at(date, "10:00", tz), at(date, "11:00", tz));
    }

    const page = await audit(t, "f10_weekday", 100);
    expect(page.scanned).toBe(6);
    expect(page.issues.map((issue) => (issue.check === "f10_weekday" ? issue.uid : null))).toEqual([reported.uid]);
  });

  test("Tuesday-only schedules in +13 and +14 zones: the Monday bookings 0.4.2 offered are reported", async () => {
    const { t } = setup();
    for (const tz of ["Pacific/Tongatapu", "Pacific/Kiritimati", "Pacific/Norfolk"]) {
      const key = tz.split("/")[1];
      const seed = await seedResourceWithSchedule(t, {
        resourceId: `res-${key}`,
        eventTypeId: `et-${key}`,
        scheduleId: `sch-${key}`,
        timezone: tz,
        weeklyHours: [{ dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }],
      });
      // Norfolk is +12 only in its DST season (2027-03-08) and +11 in June.
      const monday = tz === "Pacific/Norfolk" ? "2027-03-08" : "2027-06-07";
      const tuesday = tz === "Pacific/Norfolk" ? "2027-03-09" : "2027-06-08";
      await book(t, seed, zoned(monday, "09:00", tz), zoned(monday, "10:00", tz));
      await book(t, seed, zoned(tuesday, "09:00", tz), zoned(tuesday, "10:00", tz)); // control
    }
    const page = await audit(t, "f10_weekday", 100);
    expect(page.scanned).toBe(6);
    expect(page.issues.map((issue) => (issue.check === "f10_weekday" ? [issue.scheduleId, issue.date] : null))).toEqual([
      ["sch-Tongatapu", "2027-06-07"],
      ["sch-Kiritimati", "2027-06-07"],
      ["sch-Norfolk", "2027-03-08"],
    ]);
  });

  test("an event type without a schedule is checked against the organization's default schedule", async () => {
    const { t } = setup();
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-other",
      organizationId: ORG,
      name: "Other",
      timezone: "Europe/Berlin",
      weeklyHours: [],
    });
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-default",
      organizationId: ORG,
      name: "Default",
      timezone: AUCKLAND,
      isDefault: true,
      weeklyHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "17:00" })),
    });
    const seed = await seedResource(t, { timezone: AUCKLAND }); // no scheduleId
    const sunday = await book(t, seed, zoned("2027-06-06", "10:00", AUCKLAND), zoned("2027-06-06", "11:00", AUCKLAND));
    const page = await audit(t, "f10_weekday", 100);
    expect(page.issues).toEqual([
      { check: "f10_weekday", uid: sunday.uid, start: sunday.start, scheduleId: "sch-default", date: "2027-06-06" },
    ]);
  });

  test("a schedule stored with an invalid zone is skipped, not an error", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { timezone: AUCKLAND });
    await book(t, seed, zoned("2027-06-06", "10:00", AUCKLAND), zoned("2027-06-06", "11:00", AUCKLAND));
    // CONTROL: reported while the zone is valid.
    expect((await audit(t, "f10_weekday", 10)).issues).toHaveLength(1);
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.scheduleDocId, { timezone: "Mars/Olympus_Mons" });
    });
    expect(await audit(t, "f10_weekday", 10)).toMatchObject({ issues: [], scanned: 1, isDone: true });
  });
});

describe("event_length_invalid", () => {
  test("lists lengths and length options that are not positive numbers", async () => {
    const { t } = setup();
    const lengths: Array<[string, number, number[] | undefined]> = [
      ["ok", 60, [30, 60]], // control
      ["ok-no-options", 15, undefined], // control
      ["zero", 0, undefined],
      ["negative", -15, undefined],
      ["nan", Number.NaN, undefined],
      ["infinite", Number.POSITIVE_INFINITY, undefined],
      ["bad-option", 30, [30, 0]],
      ["nan-option", 30, [Number.NaN]],
    ];
    for (const [id, lengthInMinutes, lengthInMinutesOptions] of lengths) {
      await seedResource(t, {
        resourceId: `res-${id}`,
        eventTypeId: id,
        lengthInMinutes,
        slotInterval: 15,
        eventType: { lengthInMinutesOptions },
      });
    }
    const page = await audit(t, "event_length_invalid", 100);
    expect(page.scanned).toBe(lengths.length);
    expect(page.issues).toEqual([
      { check: "event_length_invalid", eventTypeId: "zero", lengthInMinutes: 0 },
      { check: "event_length_invalid", eventTypeId: "negative", lengthInMinutes: -15 },
      { check: "event_length_invalid", eventTypeId: "nan", lengthInMinutes: Number.NaN },
      { check: "event_length_invalid", eventTypeId: "infinite", lengthInMinutes: Number.POSITIVE_INFINITY },
      { check: "event_length_invalid", eventTypeId: "bad-option", lengthInMinutes: 30, lengthInMinutesOptions: [30, 0] },
      { check: "event_length_invalid", eventTypeId: "nan-option", lengthInMinutes: 30, lengthInMinutesOptions: [Number.NaN] },
    ]);
  });
});

describe("paging", () => {
  async function seedEventTypes(t: T, count: number, prefix = "et") {
    for (let i = 0; i < count; i++) {
      await t.mutation(api.public.createEventType, {
        id: `${prefix}-${i}`,
        slug: `${prefix}-${i}`,
        title: "Consultation",
        lengthInMinutes: i % 2 === 0 ? 0 : 60, // every other one is invalid
        timezone: "UTC",
        lockTimeZoneToggle: false,
        locations: [],
      });
    }
  }
  const idsOf = (pages: Array<Awaited<ReturnType<typeof audit>>>) =>
    pages.flatMap((page) =>
      page.issues.flatMap((issue) => (issue.check === "event_length_invalid" ? [issue.eventTypeId] : []))
    );

  test.each([
    [7, 3, [3, 3, 1]],
    [6, 3, [3, 3, 0]],
    [2, 5, [2]],
  ])("%i rows with limit %i: pages of %j, each row visited once", async (count, limit, sizes) => {
    const { t } = setup();
    await seedEventTypes(t, count);
    const pages = await auditAll(t, "event_length_invalid", limit);
    expect(pages.map((page) => page.scanned)).toEqual(sizes);
    expect(pages.map((page) => page.isDone)).toEqual(sizes.map((_, i) => i === sizes.length - 1));
    expect(idsOf(pages)).toEqual(Array.from({ length: count }, (_, i) => `et-${i}`).filter((_, i) => i % 2 === 0));
    // Restarting from any returned cursor continues from there.
    const [first] = pages;
    const rest = await audit(t, "event_length_invalid", 100, first.continueCursor);
    expect(rest.scanned).toBe(count - first.scanned);
  });

  test("a deleted cursor row does not stop the walk", async () => {
    const { t } = setup();
    await seedEventTypes(t, 5);
    const first = await audit(t, "event_length_invalid", 2);
    expect(first.scanned).toBe(2);
    await t.mutation(api.public.deleteEventType, { id: "et-1" }); // the row the cursor names
    const rest = await audit(t, "event_length_invalid", 10, first.continueCursor);
    expect(rest).toMatchObject({ scanned: 3, isDone: true });
    expect(idsOf([first, rest])).toEqual(["et-0", "et-2", "et-4"]);
  });

  test("rows with equal creation times are neither skipped nor repeated at a page boundary", async () => {
    // Far enough in the future that convex-test's +0.001 ms creation-time bump
    // rounds away: rows inserted at one instant share a _creationTime, as
    // imported rows can in production.
    const TIED_NOW = Date.UTC(2600, 0, 1);
    const { t } = setup({ now: TIED_NOW });
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("event_types", {
          id: `tied-${i}`,
          slug: `tied-${i}`,
          title: "Tied",
          lengthInMinutes: 0,
          timezone: "UTC",
          lockTimeZoneToggle: false,
          locations: [],
        });
      }
    });
    vi.setSystemTime(TIED_NOW + 1_000);
    await seedEventTypes(t, 2, "later");
    const rows = await t.run(async (ctx) => await ctx.db.query("event_types").collect());
    // CONTROL: one tie group of five, then two later rows.
    const tied = rows.filter((row) => row.id.startsWith("tied-"));
    expect(new Set(tied.map((row) => row._creationTime)).size).toBe(1);
    expect(rows.filter((row) => row._creationTime > tied[0]._creationTime)).toHaveLength(2);

    const pages = await auditAll(t, "event_length_invalid", 2);
    expect(pages.map((page) => page.scanned)).toEqual([2, 2, 2, 1]);
    expect(idsOf(pages).sort()).toEqual(["later-0", ...tied.map((row) => row.id)].sort());
  });

  test("rejects a limit outside 1–500 and a cursor it did not issue", async () => {
    const { t } = setup();
    await seedEventTypes(t, 2);
    for (const limit of [0, -1, 2.5, 501, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(audit(t, "event_length_invalid", limit)).rejects.toThrow("limit must be an integer from 1 to 500");
    }
    const seed = await seedResource(t, { resourceId: "res-x", eventTypeId: "et-x" });
    const booking = await book(t, seed, Date.UTC(2027, 2, 9, 9), Date.UTC(2027, 2, 9, 10));
    const bookingId = booking._id as Id<"bookings">;
    for (const cursor of ["", "nope", "[1]", '["1","2"]', "[1,2]", JSON.stringify([1, bookingId])]) {
      await expect(audit(t, "event_length_invalid", 1, cursor)).rejects.toThrow("Invalid audit cursor");
    }
    // A cursor of one check is foreign to the other.
    const eventCursor = (await audit(t, "event_length_invalid", 1)).continueCursor;
    await expect(audit(t, "f10_weekday", 1, eventCursor)).rejects.toThrow("Invalid audit cursor");
    // CONTROL: the bounds and an issued cursor are accepted.
    expect(await audit(t, "event_length_invalid", 500)).toMatchObject({ scanned: 3 });
    expect(await audit(t, "event_length_invalid", 1, eventCursor)).toMatchObject({ scanned: 1 });
  });

  test("a full page of the costliest check fits Convex's default limits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    try {
      const t: T = convexTest({ schema, modules, transactionLimits: true });
      // 500 upcoming Sunday bookings, each with its own event type and schedule.
      await t.run(async (ctx) => {
        for (let i = 0; i < 500; i++) {
          await ctx.db.insert("schedules", {
            id: `sch-${i}`,
            organizationId: ORG,
            name: "Auckland",
            timezone: AUCKLAND,
            isDefault: false,
            weeklyHours: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
            createdAt: 0,
            updatedAt: 0,
          });
          await ctx.db.insert("event_types", {
            id: `et-${i}`,
            slug: `et-${i}`,
            title: "Consultation",
            lengthInMinutes: 60,
            timezone: AUCKLAND,
            lockTimeZoneToggle: false,
            locations: [],
            organizationId: ORG,
            scheduleId: `sch-${i}`,
          });
          const start = zoned("2027-06-06", "10:00", AUCKLAND) + i * 7 * 24 * 60 * 60 * 1000;
          await ctx.db.insert("bookings", {
            resourceId: "res-1",
            actorId: "ada@example.com",
            start,
            end: start + 60 * 60 * 1000,
            status: "confirmed",
            uid: `bk-${i}`,
            eventTypeId: `et-${i}`,
            organizationId: ORG,
            timezone: AUCKLAND,
            bookerName: "Ada",
            bookerEmail: "ada@example.com",
            eventTitle: "Consultation",
            location: { type: "address" },
            createdAt: 0,
            updatedAt: 0,
          });
        }
      });
      const page = await audit(t, "f10_weekday", 500);
      expect(page).toMatchObject({ scanned: 500, isDone: false });
      expect(page.issues).toHaveLength(500);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
