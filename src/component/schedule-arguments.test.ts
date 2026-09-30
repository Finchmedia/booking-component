/// <reference types="vite/client" />
/**
 * Schedule arguments of the month and day queries (F12, N15).
 *
 * - `scheduleId` without `resourceTimezone` reads the hours in the schedule's
 *   own zone (until 0.4.2: as UTC in the month view, ignored in the day view).
 * - getDaySlots accepts `scheduleId` and resolves the day's hours and zone.
 * - 0.5.0 (plan PR-53, decision D8): a `resourceTimezone` that differs from
 *   the schedule's zone, the partial shapes (`resourceTimezone` alone,
 *   `availableSlots` without a zone) and an unknown `scheduleId` throw
 *   instead of reading closed days as open. Only `{}` (no schedule
 *   argument) keeps the legacy 09:00–17:00 UTC window.
 * - A schedule stored with a zone Intl rejects is read without throwing, its
 *   hours as UTC (0.4.3: the legacy window), and that is logged.
 * - The month view reads the schedule and its overrides once per call.
 */
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { getMonthAvailability } from "./public.js";
import {
  berlin,
  book,
  getBusySlots,
  getEffectiveSlots,
  range,
  seedResourceWithSchedule,
  setup,
  zoned,
  type SeededSchedule,
  type T,
} from "./setup.test.js";

const TUE = "2027-03-09"; // Mon–Fri 09–17 Berlin: open
const WED = "2027-03-10"; // override 09:00–10:00, and that hour is booked: closed
const SAT = "2027-03-13"; // no weekly hours: closed
const TZ = "Europe/Berlin";
const LEGACY_UTC = ["09:00Z", "10:00Z", "11:00Z", "12:00Z", "13:00Z", "14:00Z", "15:00Z", "16:00Z"];
const BERLIN_DAY = ["08:00Z", "09:00Z", "10:00Z", "11:00Z", "12:00Z", "13:00Z", "14:00Z", "15:00Z"];

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

async function fixture() {
  const { t } = setup();
  const seed = await seedResourceWithSchedule(t); // Mon–Fri 09–17 Europe/Berlin, 60 min on a 60-min grid
  await t.mutation(api.schedules.createDateOverride, {
    scheduleId: seed.scheduleDocId,
    date: WED,
    type: "custom",
    customHours: [{ startTime: "09:00", endTime: "10:00" }],
  });
  await book(t, seed, berlin(WED, "09:00"), berlin(WED, "10:00"));
  // CONTROL: the fixture is what the table assumes.
  expect(await getEffectiveSlots(t, seed.scheduleId, TUE)).toEqual(range(36, 68));
  expect(await getEffectiveSlots(t, seed.scheduleId, WED)).toEqual(range(36, 40));
  expect(await getEffectiveSlots(t, seed.scheduleId, SAT)).toEqual([]);
  expect(await getBusySlots(t, seed.resourceId, WED)).toEqual(range(32, 36));
  return { t, seed };
}

const month = async (t: T, seed: SeededSchedule, extra: object) => {
  const result = await t.query(api.public.getMonthAvailability, {
    resourceId: seed.resourceId,
    dateFrom: TUE,
    dateTo: SAT,
    eventLength: 60,
    slotInterval: 60,
    ...extra,
  });
  return { TUE: result[TUE], WED: result[WED], SAT: result[SAT] };
};

const day = async (t: T, seed: SeededSchedule, date: string, extra: object) => {
  const slots = await t.query(api.public.getDaySlots, {
    resourceId: seed.resourceId,
    date,
    eventLength: 60,
    slotInterval: 60,
    ...extra,
  });
  return slots.map((slot) => `${slot.time.slice(11, 16)}Z`);
};

describe("scheduleId without resourceTimezone uses the schedule's zone", () => {
  test("month view: Saturday and the booked-override Wednesday are closed, as with complete arguments", async () => {
    const { t, seed } = await fixture();
    const complete = await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ });
    expect(complete).toEqual({ TUE: true, WED: false, SAT: false });
    // Until 0.4.2: { TUE: true, WED: true, SAT: true }.
    expect(await month(t, seed, { scheduleId: seed.scheduleId })).toEqual(complete);
    expect(await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: "" })).toEqual(complete);
    expect(warn).not.toHaveBeenCalled();
  });

  test("an empty UTC schedule reads closed with scheduleId alone (the original review case)", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { timezone: "UTC", weeklyHours: [] });
    const base = { resourceId: seed.resourceId, dateFrom: TUE, dateTo: TUE, eventLength: 60, scheduleId: seed.scheduleId };
    expect(await t.query(api.public.getMonthAvailability, { ...base, resourceTimezone: "UTC" })).toEqual({ [TUE]: false });
    expect(await t.query(api.public.getMonthAvailability, base)).toEqual({ [TUE]: false });
  });

  test("getDaySlots({ scheduleId }) resolves hours and zone; month and day agree", async () => {
    const { t, seed } = await fixture();
    expect(await day(t, seed, TUE, { scheduleId: seed.scheduleId })).toEqual(BERLIN_DAY);
    expect(await day(t, seed, WED, { scheduleId: seed.scheduleId })).toEqual([]); // booked
    expect(await day(t, seed, SAT, { scheduleId: seed.scheduleId })).toEqual([]);
    // Caller hours with the schedule's zone.
    expect(await day(t, seed, WED, { scheduleId: seed.scheduleId, availableSlots: range(40, 44) })).toEqual(["09:00Z"]);
    const byMonth = await month(t, seed, { scheduleId: seed.scheduleId });
    for (const [key, date] of [["TUE", TUE], ["WED", WED], ["SAT", SAT]] as const) {
      expect((await day(t, seed, date, { scheduleId: seed.scheduleId })).length > 0, key).toBe(byMonth[key]);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  test.each([
    ["Europe/Berlin", ["2027-03-09", "2027-03-28", "2027-10-31"]],
    ["Pacific/Auckland", ["2027-06-07", "2027-06-06", "2027-04-04"]],
    ["America/New_York", ["2027-03-14", "2027-11-07", "2027-11-08"]],
  ])("getDaySlots({ scheduleId }) equals the host flow in %s", async (timezone, dates) => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, {
      timezone,
      lengthInMinutes: 120,
      slotInterval: 15,
      // Every day 01:00–04:00 and 09:00–17:00, so DST days are exercised.
      weeklyHours: range(0, 7).flatMap((dayOfWeek) => [
        { dayOfWeek, startTime: "01:00", endTime: "04:00" },
        { dayOfWeek, startTime: "09:00", endTime: "17:00" },
      ]),
    });
    // A booking the candidates must avoid.
    await book(t, seed, zoned(dates[0], "10:00", timezone), zoned(dates[0], "12:00", timezone));
    for (const date of dates) {
      const availableSlots = await getEffectiveSlots(t, seed.scheduleId, date);
      const host = await t.query(api.public.getDaySlots, {
        resourceId: seed.resourceId,
        date,
        eventLength: 120,
        slotInterval: 15,
        resourceTimezone: timezone,
        availableSlots,
      });
      const byId = await t.query(api.public.getDaySlots, {
        resourceId: seed.resourceId,
        date,
        eventLength: 120,
        slotInterval: 15,
        scheduleId: seed.scheduleId,
      });
      expect(byId, date).toEqual(host);
    }
    // CONTROL: the comparison is not vacuous.
    expect(
      (await t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date: dates[1], eventLength: 120, slotInterval: 15, scheduleId: seed.scheduleId })).length
    ).toBeGreaterThan(10);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("a resourceTimezone that differs from the schedule's zone", () => {
  test("is rejected (0.4.3 used it and logged); the matching zone is accepted silently", async () => {
    const { t, seed } = await fixture();
    const mismatch = {
      code: "INVALID_INPUT",
      message: 'Invalid resourceTimezone "UTC": schedule "sch-1" uses "Europe/Berlin". Omit resourceTimezone to use the schedule\'s zone.',
    };
    await expect(month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: "UTC" })).rejects.toMatchObject({ data: mismatch });
    await expect(day(t, seed, TUE, { scheduleId: seed.scheduleId, resourceTimezone: "UTC" })).rejects.toMatchObject({ data: mismatch });
    await expect(
      day(t, seed, WED, { scheduleId: seed.scheduleId, resourceTimezone: "UTC", availableSlots: range(36, 40) }),
    ).rejects.toMatchObject({ data: mismatch });
    // CONTROL: the matching zone.
    expect(await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ })).toEqual({ TUE: true, WED: false, SAT: false });
    expect(await day(t, seed, TUE, { scheduleId: seed.scheduleId, resourceTimezone: TZ })).toEqual(BERLIN_DAY);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("partial shapes and unknown schedules are rejected; {} keeps the legacy window", () => {
  const PARTIAL_DAY_ZONE = {
    code: "INVALID_INPUT",
    message:
      "Incomplete schedule arguments: resourceTimezone needs availableSlots or scheduleId (pass none of them for the legacy 09:00–17:00 UTC hours)",
  };
  const PARTIAL_DAY_SLOTS = {
    code: "INVALID_INPUT",
    message:
      "Incomplete schedule arguments: availableSlots needs resourceTimezone or scheduleId (pass none of them for the legacy 09:00–17:00 UTC hours)",
  };
  const PARTIAL_MONTH_ZONE = {
    code: "INVALID_INPUT",
    message: "Incomplete schedule arguments: resourceTimezone needs scheduleId (pass neither for the legacy 09:00–17:00 UTC hours)",
  };
  const UNKNOWN = { code: "SCHEDULE_NOT_FOUND", message: 'Schedule "no-such" not found' };

  test("month view", async () => {
    const { t, seed } = await fixture();
    expect({
      "{}": await month(t, seed, {}),
      '{scheduleId: ""}': await month(t, seed, { scheduleId: "" }),
      "{scheduleId, resourceTimezone}": await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ }),
    }).toEqual({
      "{}": { TUE: true, WED: true, SAT: true }, // legacy 09–17 UTC
      '{scheduleId: ""}': { TUE: true, WED: true, SAT: true },
      "{scheduleId, resourceTimezone}": { TUE: true, WED: false, SAT: false },
    });
    // 0.4.3 answered { TUE: true, WED: true, SAT: true } for each of these.
    await expect(month(t, seed, { resourceTimezone: TZ })).rejects.toMatchObject({ data: PARTIAL_MONTH_ZONE });
    await expect(month(t, seed, { scheduleId: "", resourceTimezone: TZ })).rejects.toMatchObject({ data: PARTIAL_MONTH_ZONE });
    await expect(month(t, seed, { scheduleId: "no-such", resourceTimezone: TZ })).rejects.toMatchObject({ data: UNKNOWN });
    await expect(month(t, seed, { scheduleId: "no-such" })).rejects.toMatchObject({ data: UNKNOWN });
    expect(warn).not.toHaveBeenCalled();
  });

  test("day view", async () => {
    const { t, seed } = await fixture();
    expect({
      "SAT {}": await day(t, seed, SAT, {}),
      "SAT {resourceTimezone: \"\"}": await day(t, seed, SAT, { resourceTimezone: "" }),
      "SAT {resourceTimezone, availableSlots: []}": await day(t, seed, SAT, { resourceTimezone: TZ, availableSlots: [] }),
      "WED {resourceTimezone, availableSlots: [36..39]}": await day(t, seed, WED, { resourceTimezone: TZ, availableSlots: range(36, 40) }),
      "TUE {resourceTimezone, availableSlots: [36..67]}": await day(t, seed, TUE, { resourceTimezone: TZ, availableSlots: range(36, 68) }),
      "SAT {scheduleId, availableSlots: [36..39]}": await day(t, seed, SAT, { scheduleId: seed.scheduleId, availableSlots: range(36, 40) }),
    }).toEqual({
      "SAT {}": LEGACY_UTC,
      "SAT {resourceTimezone: \"\"}": LEGACY_UTC,
      "SAT {resourceTimezone, availableSlots: []}": [],
      "WED {resourceTimezone, availableSlots: [36..39]}": [],
      "TUE {resourceTimezone, availableSlots: [36..67]}": BERLIN_DAY,
      "SAT {scheduleId, availableSlots: [36..39]}": ["08:00Z"], // caller hours, schedule zone
    });
    // 0.4.3 answered the legacy window (or 09–17 local for an unknown id).
    await expect(day(t, seed, SAT, { resourceTimezone: TZ })).rejects.toMatchObject({ data: PARTIAL_DAY_ZONE });
    await expect(day(t, seed, SAT, { availableSlots: [] })).rejects.toMatchObject({ data: PARTIAL_DAY_SLOTS });
    await expect(day(t, seed, WED, { availableSlots: range(36, 40) })).rejects.toMatchObject({ data: PARTIAL_DAY_SLOTS });
    await expect(day(t, seed, WED, { availableSlots: range(36, 40), resourceTimezone: "" })).rejects.toMatchObject({ data: PARTIAL_DAY_SLOTS });
    await expect(day(t, seed, SAT, { scheduleId: "no-such" })).rejects.toMatchObject({ data: UNKNOWN });
    await expect(day(t, seed, SAT, { scheduleId: "no-such", resourceTimezone: TZ })).rejects.toMatchObject({ data: UNKNOWN });
    expect(warn).not.toHaveBeenCalled();
  });

  test("a deleted schedule's id is rejected, also by getEffectiveAvailability", async () => {
    const { t } = setup();
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-gone", organizationId: "org-1", name: "Gone", timezone: TZ, weeklyHours: [],
    });
    await t.mutation(api.schedules.deleteSchedule, { id: "sch-gone" });
    await expect(t.query(api.schedules.getEffectiveAvailability, { scheduleId: "sch-gone", date: SAT })).rejects.toMatchObject({
      data: { code: "SCHEDULE_NOT_FOUND", message: 'Schedule "sch-gone" not found' },
    });
    // 0.4.3 returned 09:00–17:00 for any unknown id.
    await expect(t.query(api.schedules.getEffectiveAvailability, { scheduleId: "no-such", date: SAT })).rejects.toMatchObject({
      data: UNKNOWN,
    });
  });
});

describe("a schedule stored with a zone Intl rejects (before 0.4.3)", () => {
  test("its hours are read as UTC without throwing, and that is logged", async () => {
    const { t, seed } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.scheduleDocId, { timezone: "Mars/Olympus_Mons" });
    });
    // The hours as UTC: Saturday stays closed in both views (0.4.3 took the
    // legacy window, so it read open), and WED's override hour 09:00Z is free.
    expect(await month(t, seed, { scheduleId: seed.scheduleId })).toEqual({ TUE: true, WED: true, SAT: false });
    expect(await day(t, seed, TUE, { scheduleId: seed.scheduleId })).toEqual(LEGACY_UTC);
    expect(await day(t, seed, WED, { scheduleId: seed.scheduleId })).toEqual(["09:00Z"]);
    expect(await day(t, seed, SAT, { scheduleId: seed.scheduleId })).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0][0]).toBe(
      '[booking] getMonthAvailability: schedule "sch-1" has the invalid time zone "Mars/Olympus_Mons"; reading its hours in UTC. Set a valid zone with updateSchedule.'
    );
    expect(warn.mock.calls[1][0]).toContain('[booking] getDaySlots: schedule "sch-1" has the invalid time zone');

    // CONTROL: a caller's zone is used for such a schedule, and logged.
    expect(await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ })).toEqual({
      TUE: true,
      WED: false,
      SAT: false,
    });
    expect(warn.mock.calls[4][0]).toContain("reading its hours in Europe/Berlin");

    // CONTROL: repaired, the schedule's zone applies again, silently.
    await t.mutation(api.schedules.updateSchedule, { id: seed.scheduleId, timezone: TZ });
    warn.mockClear();
    expect(await month(t, seed, { scheduleId: seed.scheduleId })).toEqual({ TUE: true, WED: false, SAT: false });
    expect(await day(t, seed, TUE, { scheduleId: seed.scheduleId })).toEqual(BERLIN_DAY);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("month view reads", () => {
  type MonthArgs = (typeof api.public.getMonthAvailability)["_args"];
  const handler = (
    getMonthAvailability as unknown as { _handler: (ctx: any, args: MonthArgs) => Promise<Record<string, boolean>> }
  )._handler;

  /** `ctx` whose db counts the queries (index ranges) it opens per table. */
  function countingQueries(ctx: any) {
    const queries: Record<string, number> = {};
    const db = new Proxy(ctx.db, {
      get(target, prop) {
        if (prop === "query") {
          return (table: string) => {
            queries[table] = (queries[table] ?? 0) + 1;
            return target.query(table);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { ctx: { ...ctx, db }, queries };
  }

  test("a 42-day { scheduleId } query reads the schedule and its overrides once", async () => {
    const { t, seed } = await fixture();
    const THU = "2027-03-11";
    const override = (date: string) =>
      t.mutation(api.schedules.createDateOverride, { scheduleId: seed.scheduleDocId, date, type: "unavailable" });
    await override("2027-03-17"); // a Wednesday
    await override("2027-05-05"); // outside the range
    // Two stored rows for one day: the first wins, as in the day view.
    await t.run(async (ctx) => {
      const rows: Array<Omit<Doc<"date_overrides">, "_id" | "_creationTime">> = [
        { scheduleId: seed.scheduleDocId, date: THU, type: "custom", customHours: [{ startTime: "13:00", endTime: "14:00" }] },
        { scheduleId: seed.scheduleDocId, date: THU, type: "unavailable" },
      ];
      for (const row of rows) await ctx.db.insert("date_overrides", row);
    });

    const measure = async (dateTo: string) => {
      const args: MonthArgs = {
        resourceId: seed.resourceId,
        dateFrom: "2027-03-01",
        dateTo,
        eventLength: 60,
        slotInterval: 60,
        scheduleId: seed.scheduleId,
      };
      const measured = await t.run(async (ctx) => {
        const counted = countingQueries(ctx);
        return { result: await handler(counted.ctx, args), queries: counted.queries };
      });
      // The registered query (validators included) returns the same.
      expect(measured.result).toEqual(await t.query(api.public.getMonthAvailability, args));
      return measured;
    };

    const week = await measure("2027-03-07");
    const sixWeeks = await measure("2027-04-11");
    expect(Object.keys(week.result)).toHaveLength(7);
    expect(Object.keys(sixWeeks.result)).toHaveLength(42);
    for (const { queries } of [week, sixWeeks]) {
      expect(queries.schedules).toBe(1);
      expect(queries.date_overrides).toBe(1);
    }
    // CONTROL: the overrides apply, and month and day agree on the day with two rows.
    expect(sixWeeks.result).toMatchObject({ [TUE]: true, [WED]: false, "2027-03-17": false, [THU]: true, [SAT]: false });
    expect(await getEffectiveSlots(t, seed.scheduleId, THU)).toEqual(range(52, 56));
    expect(await day(t, seed, THU, { scheduleId: seed.scheduleId })).toEqual(["12:00Z"]);
  });
});
