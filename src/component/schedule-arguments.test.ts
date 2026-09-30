/// <reference types="vite/client" />
/**
 * Schedule arguments of the month and day queries (F12, additive part).
 *
 * - `scheduleId` without `resourceTimezone` reads the hours in the schedule's
 *   own zone (until 0.4.2: as UTC in the month view, ignored in the day view).
 * - getDaySlots accepts `scheduleId` and resolves the day's hours and zone.
 * - A `resourceTimezone` that differs from the schedule's zone is still used,
 *   and logged.
 * - Every other partial shape keeps its 0.4.2 answer (pinned below).
 */
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { api } from "./_generated/api.js";
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
  test("is still used, and logged", async () => {
    const { t, seed } = await fixture();
    // 0.4.2 answer kept: the hours read as UTC, so WED 10:00Z is free.
    expect(await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: "UTC" })).toEqual({
      TUE: true,
      WED: true,
      SAT: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      '[booking] getMonthAvailability: resourceTimezone "UTC" differs from the timezone "Europe/Berlin" of schedule "sch-1"; using resourceTimezone. Omit it to use the schedule\'s zone.'
    );
    expect(await day(t, seed, TUE, { scheduleId: seed.scheduleId, resourceTimezone: "UTC" })).toEqual(LEGACY_UTC);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain("[booking] getDaySlots:");
    // CONTROL: the matching zone is silent.
    await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ });
    await day(t, seed, TUE, { scheduleId: seed.scheduleId, resourceTimezone: TZ });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("other shapes keep their 0.4.2 answers", () => {
  test("month view", async () => {
    const { t, seed } = await fixture();
    expect({
      "{}": await month(t, seed, {}),
      "{resourceTimezone}": await month(t, seed, { resourceTimezone: TZ }),
      "{scheduleId, resourceTimezone}": await month(t, seed, { scheduleId: seed.scheduleId, resourceTimezone: TZ }),
      "{scheduleId: unknown, resourceTimezone}": await month(t, seed, { scheduleId: "no-such", resourceTimezone: TZ }),
      "{scheduleId: unknown}": await month(t, seed, { scheduleId: "no-such" }),
    }).toEqual({
      "{}": { TUE: true, WED: true, SAT: true }, // legacy 09–17 UTC
      "{resourceTimezone}": { TUE: true, WED: true, SAT: true },
      "{scheduleId, resourceTimezone}": { TUE: true, WED: false, SAT: false },
      "{scheduleId: unknown, resourceTimezone}": { TUE: true, WED: true, SAT: true }, // 09–17 local default
      "{scheduleId: unknown}": { TUE: true, WED: true, SAT: true },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test("day view", async () => {
    const { t, seed } = await fixture();
    expect({
      "SAT {}": await day(t, seed, SAT, {}),
      "SAT {resourceTimezone}": await day(t, seed, SAT, { resourceTimezone: TZ }),
      "SAT {availableSlots: []}": await day(t, seed, SAT, { availableSlots: [] }),
      "WED {availableSlots: [36..39]}": await day(t, seed, WED, { availableSlots: range(36, 40) }),
      "SAT {resourceTimezone, availableSlots: []}": await day(t, seed, SAT, { resourceTimezone: TZ, availableSlots: [] }),
      "WED {resourceTimezone, availableSlots: [36..39]}": await day(t, seed, WED, { resourceTimezone: TZ, availableSlots: range(36, 40) }),
      "TUE {resourceTimezone, availableSlots: [36..67]}": await day(t, seed, TUE, { resourceTimezone: TZ, availableSlots: range(36, 68) }),
      "SAT {scheduleId: unknown}": await day(t, seed, SAT, { scheduleId: "no-such" }),
      "SAT {scheduleId: unknown, resourceTimezone}": await day(t, seed, SAT, { scheduleId: "no-such", resourceTimezone: TZ }),
    }).toEqual({
      "SAT {}": LEGACY_UTC,
      "SAT {resourceTimezone}": LEGACY_UTC,
      "SAT {availableSlots: []}": LEGACY_UTC,
      "WED {availableSlots: [36..39]}": LEGACY_UTC,
      "SAT {resourceTimezone, availableSlots: []}": [],
      "WED {resourceTimezone, availableSlots: [36..39]}": [],
      "TUE {resourceTimezone, availableSlots: [36..67]}": BERLIN_DAY,
      "SAT {scheduleId: unknown}": LEGACY_UTC,
      "SAT {scheduleId: unknown, resourceTimezone}": BERLIN_DAY, // 09–17 local default
    });
  });
});
