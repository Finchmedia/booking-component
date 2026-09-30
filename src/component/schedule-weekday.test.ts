/// <reference types="vite/client" />
/**
 * Weekly hours use the weekday of the calendar day itself (F10).
 *
 * Until 0.4.2 the weekday was read from `${date}T12:00Z` in the schedule's
 * zone, which is already the next day at UTC+12 and beyond: every date there
 * took the following weekday's hours. Each case uses a schedule open on ONE
 * weekday, so a mix-up cannot be masked by identical neighbouring days.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { getEffectiveSlots, range, seedResourceWithSchedule, setup, zoned, type T } from "./setup.test.js";
import { PROCESS_TIME_ZONES, withProcessTimeZones } from "../testing/process-time-zone.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

let seedCounter = 0;

/** A schedule open 09:00–10:00 only on the weekday of `date`, in `timezone`. */
async function seedOneWeekday(t: T, timezone: string, date: string) {
  const id = `wd-${++seedCounter}`;
  return await seedResourceWithSchedule(t, {
    resourceId: `res-${id}`,
    eventTypeId: `et-${id}`,
    scheduleId: `sch-${id}`,
    timezone,
    date,
    weeklyHours: [{ dayOfWeek: weekday(date), startTime: "09:00", endTime: "10:00" }],
  });
}

/** Effective hours, month view and day view of the day before, the day itself and the day after. */
async function threeDays(t: T, seed: Awaited<ReturnType<typeof seedOneWeekday>>, date: string) {
  const days = [shiftDate(date, -1), date, shiftDate(date, 1)];
  const effective: number[][] = [];
  const day: string[][] = [];
  for (const d of days) {
    const availableSlots = await getEffectiveSlots(t, seed.scheduleId, d);
    effective.push(availableSlots);
    const slots = await t.query(api.public.getDaySlots, {
      resourceId: seed.resourceId,
      date: d,
      eventLength: 60,
      slotInterval: 60,
      resourceTimezone: seed.timezone,
      availableSlots,
    });
    day.push(slots.map((slot) => slot.time));
  }
  const month = await t.query(api.public.getMonthAvailability, {
    resourceId: seed.resourceId,
    dateFrom: days[0],
    dateTo: days[2],
    eventLength: 60,
    slotInterval: 60,
    resourceTimezone: seed.timezone,
    scheduleId: seed.scheduleId,
  });
  return { effective, day, month: days.map((d) => month[d]) };
}

// [zone, date, note]
const AFFECTED: Array<[string, string, string]> = [
  ["Pacific/Auckland", "2027-06-08", "NZST +12"],
  ["Pacific/Auckland", "2027-03-09", "NZDT +13"],
  ["Pacific/Auckland", "2027-04-04", "NZDT → NZST transition day"],
  ["Pacific/Auckland", "2027-09-26", "NZST → NZDT transition day"],
  ["Pacific/Chatham", "2027-06-08", "+12:45"],
  ["Pacific/Chatham", "2027-03-09", "+13:45"],
  ["Pacific/Tongatapu", "2027-06-08", "+13"],
  ["Pacific/Kiritimati", "2027-06-08", "+14"],
  ["Asia/Kamchatka", "2027-06-08", "+12"],
  ["Etc/GMT-12", "2027-06-08", "+12"],
  ["Pacific/Apia", "2027-06-08", "+13"],
  ["Pacific/Fiji", "2027-06-08", "+12"],
  ["Pacific/Norfolk", "2027-03-09", "+12 in its DST season"],
];
const UNAFFECTED: Array<[string, string, string]> = [
  ["Pacific/Norfolk", "2027-06-08", "+11 in standard time"],
  ["Europe/Berlin", "2027-06-08", "+2"],
  ["America/New_York", "2027-06-08", "-4"],
  ["Pacific/Pago_Pago", "2027-06-08", "-11"],
  ["Etc/GMT+12", "2027-06-08", "-12"],
];

describe("a one-weekday schedule is open on that weekday only", () => {
  test.each([...AFFECTED, ...UNAFFECTED])("%s on %s (%s)", async (timezone, date) => {
    const { t } = setup();
    const seed = await seedOneWeekday(t, timezone, date);
    const results: unknown[] = [];
    await withProcessTimeZones(PROCESS_TIME_ZONES, async () => {
      const views = await threeDays(t, seed, date);
      expect(views.effective).toEqual([[], range(36, 40), []]);
      expect(views.month).toEqual([false, true, false]);
      expect(views.day).toEqual([[], [new Date(zoned(date, "09:00", timezone)).toISOString()], []]);
      results.push(views);
    });
    for (const result of results) expect(result).toEqual(results[0]);
  });
});

describe("Mon–Fri 09:00–17:00 in Pacific/Auckland", () => {
  test("Sunday is closed and Friday open; month and day views agree on every day", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { timezone: "Pacific/Auckland", date: "2027-06-06" });
    const days = range(6, 13).map((day) => `2027-06-${String(day).padStart(2, "0")}`); // Sun … Sat
    const month = await t.query(api.public.getMonthAvailability, {
      resourceId: seed.resourceId,
      dateFrom: days[0],
      dateTo: days[6],
      eventLength: 60,
      slotInterval: 60,
      resourceTimezone: seed.timezone,
      scheduleId: seed.scheduleId,
    });
    expect(days.map((day) => month[day])).toEqual([false, true, true, true, true, true, false]);
    for (const day of days) {
      const availableSlots = await getEffectiveSlots(t, seed.scheduleId, day);
      const slots = await t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, date: day, availableSlots });
      expect(slots.length > 0, day).toBe(month[day]);
    }
    // CONTROL: the same schedule in Berlin.
    const berlin = await seedResourceWithSchedule(t, {
      resourceId: "res-berlin",
      eventTypeId: "et-berlin",
      scheduleId: "sch-berlin",
    });
    const berlinMonth = await t.query(api.public.getMonthAvailability, {
      resourceId: berlin.resourceId,
      dateFrom: days[0],
      dateTo: days[6],
      eventLength: 60,
      resourceTimezone: berlin.timezone,
      scheduleId: berlin.scheduleId,
    });
    expect(days.map((day) => berlinMonth[day])).toEqual([false, true, true, true, true, true, false]);
  });
});

describe("host guard replica", () => {
  // The reference host takes the start's calendar day in the schedule zone,
  // then getEffectiveAvailability → getDaySlots, and accepts the start only
  // when it is offered.
  async function hostAccepts(t: T, seed: Awaited<ReturnType<typeof seedOneWeekday>>, start: number) {
    const dayKey = new Date(start).toLocaleDateString("sv-SE", { timeZone: seed.timezone });
    const availableSlots = await getEffectiveSlots(t, seed.scheduleId, dayKey);
    const slots = await t.query(api.public.getDaySlots, {
      resourceId: seed.resourceId,
      date: dayKey,
      eventLength: 60,
      slotInterval: 60,
      resourceTimezone: seed.timezone,
      availableSlots,
    });
    return slots.some((slot) => Date.parse(slot.time) === start);
  }

  test.each(["Pacific/Auckland", "Europe/Berlin"])("%s Tuesday-only: Tue 09:00 accepted, Mon 09:00 rejected", async (timezone) => {
    const { t } = setup();
    const seed = await seedOneWeekday(t, timezone, "2027-06-08");
    expect(await hostAccepts(t, seed, zoned("2027-06-08", "09:00", timezone))).toBe(true);
    expect(await hostAccepts(t, seed, zoned("2027-06-07", "09:00", timezone))).toBe(false);
    expect(await hostAccepts(t, seed, zoned("2027-06-09", "09:00", timezone))).toBe(false);
  });
});

describe("date overrides at UTC+12 and beyond", () => {
  test("an override replaces its own date only, whatever the weekly hours say", async () => {
    const { t } = setup();
    for (const timezone of ["Pacific/Kiritimati", "Pacific/Auckland", "Pacific/Chatham"]) {
      const seed = await seedOneWeekday(t, timezone, "2027-06-08"); // Tuesday-only
      await t.mutation(api.schedules.createDateOverride, {
        scheduleId: seed.scheduleDocId,
        date: "2027-06-07", // Monday: opened by the override
        type: "custom",
        customHours: [{ startTime: "13:00", endTime: "14:00" }],
      });
      await t.mutation(api.schedules.createDateOverride, {
        scheduleId: seed.scheduleDocId,
        date: "2027-06-08", // Tuesday: closed by the override
        type: "unavailable",
      });
      expect(await getEffectiveSlots(t, seed.scheduleId, "2027-06-07")).toEqual(range(52, 56));
      expect(await getEffectiveSlots(t, seed.scheduleId, "2027-06-08")).toEqual([]);
      // CONTROL: the next Tuesday has its weekly hours again.
      expect(await getEffectiveSlots(t, seed.scheduleId, "2027-06-15")).toEqual(range(36, 40));
      expect(await getEffectiveSlots(t, seed.scheduleId, "2027-06-14")).toEqual([]);
    }
  });
});
