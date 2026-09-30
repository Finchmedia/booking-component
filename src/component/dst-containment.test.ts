/// <reference types="vite/client" />
/**
 * DST transition days (F11 and the ambiguity rule).
 *
 * - Spring forward: a run of local slots closes at its last existing quarter
 *   hour + 15 minutes, and every offered booking must END by then. Starts in
 *   the gap are still skipped.
 * - Fall back: a repeated wall-clock time resolves to its EARLIER occurrence,
 *   in zones east and west of UTC and with half-hour shifts alike.
 *
 * Public-query cases use the host sequence getEffectiveAvailability → complete
 * getDaySlots, plus getMonthAvailability. The sweep compares the generator
 * with an oracle built from Intl alone. No expectation depends on the process
 * time zone (each case runs under several).
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { generateDaySlotsWithTimezone, timeToSlotIndex, wallClockToUTC } from "./utils.js";
import { getEffectiveSlots, range, seedResourceWithSchedule, setup, type T } from "./setup.test.js";
import { PROCESS_TIME_ZONES, withProcessTimeZones } from "../testing/process-time-zone.js";

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const utc = (value: string) => Date.parse(value);
/** Local slot indices covering the wall-clock window [from, to). */
const slotWindow = (from: string, to: string) => range(timeToSlotIndex(from), timeToSlotIndex(to));

let seedCounter = 0;

/**
 * One resource with a single-weekday schedule of `windows` on `date`, and
 * what the day and month views offer there for `length` minutes on an
 * `interval` grid.
 */
async function views(
  t: T,
  timezone: string,
  date: string,
  windows: Array<[string, string]>,
  length: number,
  interval: number
): Promise<{ starts: string[]; month: boolean }> {
  const id = `dst-${++seedCounter}`;
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const seed = await seedResourceWithSchedule(t, {
    resourceId: `res-${id}`,
    eventTypeId: `et-${id}`,
    scheduleId: `sch-${id}`,
    timezone,
    date,
    lengthInMinutes: length,
    slotInterval: interval,
    weeklyHours: windows.map(([startTime, endTime]) => ({ dayOfWeek, startTime, endTime })),
  });
  const availableSlots = await getEffectiveSlots(t, seed.scheduleId, date);
  const day = await t.query(api.public.getDaySlots, {
    resourceId: seed.resourceId,
    date,
    eventLength: length,
    slotInterval: interval,
    resourceTimezone: timezone,
    availableSlots,
  });
  const month = await t.query(api.public.getMonthAvailability, {
    resourceId: seed.resourceId,
    dateFrom: date,
    dateTo: date,
    eventLength: length,
    slotInterval: interval,
    resourceTimezone: timezone,
    scheduleId: seed.scheduleId,
  });
  return { starts: day.map((slot) => slot.time), month: month[date] };
}

/** Runs `check` once per process time zone and expects the same result each time. */
async function inEveryProcessZone<R>(check: () => Promise<R>): Promise<R> {
  const results: R[] = [];
  await withProcessTimeZones(PROCESS_TIME_ZONES, async () => {
    results.push(await check());
  });
  for (const result of results) expect(result).toEqual(results[0]);
  return results[0];
}

// ============================================
// Spring forward: bookings end by the time the window closes
// ============================================

describe("spring forward: offered bookings end by closing time", () => {
  test("Berlin 01:00–04:00, 120 min on a 15-min grid: only 01:00 CET (it ends at 04:00 CEST)", async () => {
    const { t } = setup();
    // 2027-03-28: 02:00 CET → 03:00 CEST at 01:00Z; the window lasts 2 hours.
    const spring = await inEveryProcessZone(() =>
      views(t, "Europe/Berlin", "2027-03-28", [["01:00", "04:00"]], 120, 15)
    );
    expect(spring).toEqual({ starts: ["2027-03-28T00:00:00.000Z"], month: true });
    // Before 0.4.3 01:15, 01:30 and 01:45 CET were offered too, ending 15, 30
    // and 45 minutes after closing.

    // CONTROL: a week earlier the window lasts 3 hours and offers 01:00–02:00.
    const control = await views(t, "Europe/Berlin", "2027-03-21", [["01:00", "04:00"]], 120, 15);
    expect(control.starts).toEqual(range(0, 5).map((i) => iso(utc("2027-03-21T00:00:00Z") + i * 15 * MIN)));
    expect(Date.parse(control.starts[4]) + 120 * MIN).toBe(utc("2027-03-21T03:00:00Z")); // 04:00 CET
  });

  test("Berlin 01:00–03:00 lasts one hour: a 120-min event is not offered and the month view reads closed", async () => {
    const { t } = setup();
    expect(await views(t, "Europe/Berlin", "2027-03-28", [["01:00", "03:00"]], 120, 60)).toEqual({
      starts: [],
      month: false,
    });
    // CONTROL: a 60-min event fits the one elapsed hour exactly (00:00Z–01:00Z).
    expect(await views(t, "Europe/Berlin", "2027-03-28", [["01:00", "03:00"]], 60, 60)).toEqual({
      starts: ["2027-03-28T00:00:00.000Z"],
      month: true,
    });
    // CONTROL: on an ordinary Sunday the 120-min event fits.
    expect(await views(t, "Europe/Berlin", "2027-03-21", [["01:00", "03:00"]], 120, 60)).toEqual({
      starts: ["2027-03-21T00:00:00.000Z"],
      month: true,
    });
  });

  test("a full-day event on a 00:00–24:00 window is not offered on the 23-hour day", async () => {
    const { t } = setup();
    expect(
      await views(t, "Europe/Berlin", "2027-03-28", [["00:00", "24:00"]], 1440, 1440)
    ).toEqual({ starts: [], month: false });
    // CONTROL: on a 24-hour day it is offered, from 00:00 to 24:00 local.
    expect(
      await views(t, "Europe/Berlin", "2027-03-21", [["00:00", "24:00"]], 1440, 1440)
    ).toEqual({ starts: ["2027-03-20T23:00:00.000Z"], month: true });
    // CONTROL: a 23-hour event fills the short day exactly.
    expect(
      await views(t, "Europe/Berlin", "2027-03-28", [["00:00", "24:00"]], 1380, 1440)
    ).toEqual({ starts: ["2027-03-27T23:00:00.000Z"], month: true });
  });

  test("New York, London and Lord Howe (30-min shift) keep every booking inside the window", async () => {
    const { t } = setup();
    // New York 2027-03-14: 02:00 EST → 03:00 EDT at 07:00Z; 01:00 EST is 06:00Z.
    expect(await views(t, "America/New_York", "2027-03-14", [["01:00", "04:00"]], 120, 15)).toEqual({
      starts: ["2027-03-14T06:00:00.000Z"],
      month: true,
    });
    // London 2027-03-28: 01:00 GMT → 02:00 BST at 01:00Z; 00:00–03:00 lasts 2 hours.
    expect(await views(t, "Europe/London", "2027-03-28", [["00:00", "03:00"]], 120, 15)).toEqual({
      starts: ["2027-03-28T00:00:00.000Z"],
      month: true,
    });
    // Lord Howe 2027-10-03: 02:00 → 02:30 at 15:30Z; 01:00–04:00 lasts 2h30.
    // 01:45 (15:15Z) would end at 04:15 and is no longer offered.
    expect(await views(t, "Australia/Lord_Howe", "2027-10-03", [["01:00", "04:00"]], 120, 15)).toEqual({
      starts: ["2027-10-02T14:30:00.000Z", "2027-10-02T14:45:00.000Z", "2027-10-02T15:00:00.000Z"],
      month: true,
    });
    // CONTROLS: the same windows a week earlier offer every locally fitting start.
    expect((await views(t, "America/New_York", "2027-03-07", [["01:00", "04:00"]], 120, 15)).starts).toHaveLength(5);
    expect((await views(t, "Europe/London", "2027-03-21", [["00:00", "03:00"]], 120, 15)).starts).toHaveLength(5);
    expect((await views(t, "Australia/Lord_Howe", "2027-09-26", [["01:00", "04:00"]], 120, 15)).starts).toHaveLength(5);
  });

  test("a window ending where the gap starts closes at the transition and keeps its starts", async () => {
    const { t } = setup();
    // Berlin 00:00–02:00: 02:00 does not exist; the window closes at 01:00Z.
    expect(await views(t, "Europe/Berlin", "2027-03-28", [["00:00", "02:00"]], 60, 15)).toEqual({
      starts: range(0, 5).map((i) => iso(utc("2027-03-27T23:00:00Z") + i * 15 * MIN)),
      month: true,
    });
    // America/Santiago jumps from 24:00 to 01:00 at 04:00Z on 2027-09-05: a
    // 20:00–24:00 window on the eve lasts its full four hours.
    const eve = await views(t, "America/Santiago", "2027-09-04", [["20:00", "24:00"]], 60, 15);
    expect(eve.starts).toEqual(range(0, 13).map((i) => iso(utc("2027-09-05T00:00:00Z") + i * 15 * MIN)));
    expect(Date.parse(eve.starts[12]) + 60 * MIN).toBe(utc("2027-09-05T04:00:00Z"));
  });

  test("split windows on the transition day are contained per window", async () => {
    const { t } = setup();
    const split = await views(
      t,
      "Europe/Berlin",
      "2027-03-28",
      [["00:00", "02:30"], ["03:00", "05:00"]],
      60,
      15
    );
    expect(split.starts).toEqual([
      // 00:00–02:30 closes at the transition (01:00Z): 00:00…01:00 CET.
      ...range(0, 5).map((i) => iso(utc("2027-03-27T23:00:00Z") + i * 15 * MIN)),
      // 03:00–05:00 CEST (01:00Z–03:00Z): 03:00…04:00 CEST.
      ...range(0, 5).map((i) => iso(utc("2027-03-28T01:00:00Z") + i * 15 * MIN)),
    ]);
  });

  test("15-minute events are unaffected: every existing quarter hour of the window is offered", async () => {
    const { t } = setup();
    // 00:00–06:00 has 24 quarter hours, 4 of them in the gap.
    const quarter = await views(t, "Europe/Berlin", "2027-03-28", [["00:00", "06:00"]], 15, 15);
    expect(quarter.starts).toHaveLength(20);
    expect(new Set(quarter.starts).size).toBe(20);
    expect(quarter.starts[0]).toBe("2027-03-27T23:00:00.000Z");
    expect(quarter.starts[19]).toBe("2027-03-28T03:45:00.000Z"); // 05:45 CEST
  });
});

// ============================================
// Sweep against an Intl-only oracle
// ============================================

type Wall = { date: string; minute: number };
const wallFormatters = new Map<string, Intl.DateTimeFormat>();
function wallOf(ms: number, timezone: string): Wall {
  let format = wallFormatters.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    wallFormatters.set(timezone, format);
  }
  const parts = format.formatToParts(ms);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/**
 * The starts a window should offer, from Intl alone: each local start on the
 * window's grid that fits the window locally, exists on `date` (its earliest
 * instant), and whose elapsed quarter hours all read, on the wall clock of
 * `date`, as times inside the window.
 */
function oracleStarts(date: string, timezone: string, window: [number, number], length: number, interval: number) {
  const dayStart = utc(`${date}T00:00:00Z`);
  const instantOf = new Map<number, number>();
  for (let ms = dayStart - 15 * 60 * MIN; ms < dayStart + 39 * 60 * MIN; ms += 15 * MIN) {
    const wall = wallOf(ms, timezone);
    if (wall.date === date && !instantOf.has(wall.minute)) instantOf.set(wall.minute, ms);
  }
  const [from, to] = window;
  const starts: string[] = [];
  for (let minute = from; minute + length <= to; minute += interval) {
    const start = instantOf.get(minute);
    if (start === undefined) continue; // in the gap
    let inside = true;
    for (let chunk = start; chunk < start + length * MIN; chunk += 15 * MIN) {
      const wall = wallOf(chunk, timezone);
      if (wall.date !== date || wall.minute < from || wall.minute >= to) inside = false;
    }
    if (inside) starts.push(iso(start));
  }
  return starts;
}

describe("spring-forward sweep: generator equals the Intl oracle", () => {
  const cases: Array<[string, string, string]> = [
    ["Europe/Berlin", "2027-03-28", "transition 02:00 → 03:00"],
    ["America/New_York", "2027-03-14", "transition 02:00 → 03:00"],
    ["Europe/London", "2027-03-28", "transition 01:00 → 02:00"],
    ["Australia/Lord_Howe", "2027-10-03", "transition 02:00 → 02:30"],
    ["America/Santiago", "2027-09-05", "transition 24:00 → 01:00"],
    ["Europe/Berlin", "2027-03-21", "control: no transition"],
  ];

  test.each(cases)("%s %s (%s)", async (timezone, date) => {
    await withProcessTimeZones(["UTC", "Pacific/Auckland", "America/New_York"], () => {
      let offered = 0;
      let checked = 0;
      // Windows opening 00:00–06:00 and closing up to 08:00 (30-minute grid).
      for (let from = 0; from <= 360; from += 30) {
        for (let to = from + 30; to <= 480; to += 30) {
          for (const length of [15, 60, 120, 240]) {
            if (length > to - from) continue;
            const actual = generateDaySlotsWithTimezone(
              date,
              length,
              15,
              range(from / 15, to / 15),
              timezone
            ).map((candidate) => candidate.start);
            expect(actual, `${from}-${to} len ${length}`).toEqual(
              oracleStarts(date, timezone, [from, to], length, 15)
            );
            offered += actual.length;
            checked++;
          }
        }
      }
      // CONTROL: the sweep is not vacuous.
      expect(checked).toBeGreaterThan(300);
      expect(offered).toBeGreaterThan(1000);
    });
  }, 60_000);
});

// ============================================
// Fall back: the earlier occurrence, uniformly
// ============================================

describe("fall back: a repeated wall-clock time is its earlier occurrence", () => {
  test("wallClockToUTC picks the first occurrence east and west of UTC and for half-hour shifts", async () => {
    await withProcessTimeZones(PROCESS_TIME_ZONES, () => {
      // Berlin 2027-10-31: 02:30 occurs at 00:30Z (CEST) and 01:30Z (CET).
      expect(iso(wallClockToUTC("2027-10-31", "02:30", "Europe/Berlin"))).toBe("2027-10-31T00:30:00.000Z");
      // New York 2027-11-07: 01:30 occurs at 05:30Z (EDT) and 06:30Z (EST).
      expect(iso(wallClockToUTC("2027-11-07", "01:30", "America/New_York"))).toBe("2027-11-07T05:30:00.000Z");
      // Lord Howe 2027-04-04: 01:45 occurs at 14:45Z (+11) and 15:15Z (+10:30).
      expect(iso(wallClockToUTC("2027-04-04", "01:45", "Australia/Lord_Howe"))).toBe("2027-04-03T14:45:00.000Z");
      // CONTROLS: unambiguous times on the same days and an ordinary day.
      expect(iso(wallClockToUTC("2027-10-31", "03:00", "Europe/Berlin"))).toBe("2027-10-31T02:00:00.000Z");
      expect(iso(wallClockToUTC("2027-10-31", "01:59", "Europe/Berlin"))).toBe("2027-10-30T23:59:00.000Z");
      expect(iso(wallClockToUTC("2027-11-07", "02:00", "America/New_York"))).toBe("2027-11-07T07:00:00.000Z");
      expect(iso(wallClockToUTC("2027-04-04", "02:00", "Australia/Lord_Howe"))).toBe("2027-04-03T15:30:00.000Z");
      expect(iso(wallClockToUTC("2027-10-24", "02:30", "Europe/Berlin"))).toBe("2027-10-24T00:30:00.000Z");
      // A gap time maps one gap length early (and is never offered as a start).
      expect(iso(wallClockToUTC("2027-03-28", "02:30", "Europe/Berlin"))).toBe("2027-03-28T00:30:00.000Z");
    });
  });

  test("Berlin 2027-10-31 01:00–04:00: first occurrence offered, no duplicates, no overflow", async () => {
    const { t } = setup();
    const fall = await inEveryProcessZone(() =>
      views(t, "Europe/Berlin", "2027-10-31", [["01:00", "04:00"]], 60, 15)
    );
    expect(fall.starts).toEqual([
      // 01:00–02:45 CEST
      ...range(0, 8).map((i) => iso(utc("2027-10-30T23:00:00Z") + i * 15 * MIN)),
      "2027-10-31T02:00:00.000Z", // 03:00 CET
    ]);
    // The second 02:xx (CET, 01:00Z–01:45Z) is never a start.
    for (const minute of ["00", "15", "30", "45"]) {
      expect(fall.starts).not.toContain(`2027-10-31T01:${minute}:00.000Z`);
    }
    // Every booking ends by 04:00 CET (03:00Z).
    expect(fall.starts.every((start) => Date.parse(start) + 60 * MIN <= utc("2027-10-31T03:00:00Z"))).toBe(true);
    expect(fall.month).toBe(true);
    // Conservative (D38): 240 minutes fit the four elapsed hours but not the three local ones.
    expect((await views(t, "Europe/Berlin", "2027-10-31", [["01:00", "04:00"]], 240, 15)).starts).toEqual([]);
    // CONTROL: 2027-10-24 offers 01:00…03:00 CEST, nine starts.
    expect((await views(t, "Europe/Berlin", "2027-10-24", [["01:00", "04:00"]], 60, 15)).starts).toEqual(
      range(0, 9).map((i) => iso(utc("2027-10-23T23:00:00Z") + i * 15 * MIN))
    );
  });

  test("New York 2027-11-07 and Lord Howe 2027-04-04 resolve the repeated times the same way", async () => {
    const { t } = setup();
    // New York: 01:00–01:45 EDT (05:00Z–05:45Z) are offered, the EST repeat is not.
    const ny = await views(t, "America/New_York", "2027-11-07", [["00:00", "03:00"]], 60, 15);
    expect(ny.starts).toEqual([
      ...range(0, 8).map((i) => iso(utc("2027-11-07T04:00:00Z") + i * 15 * MIN)),
      "2027-11-07T07:00:00.000Z", // 02:00 EST
    ]);
    // Lord Howe: 01:30 and 01:45 are +11 (14:30Z, 14:45Z), not +10:30.
    const lh = await views(t, "Australia/Lord_Howe", "2027-04-04", [["01:00", "03:00"]], 30, 15);
    expect(lh.starts).toEqual([
      "2027-04-03T14:00:00.000Z",
      "2027-04-03T14:15:00.000Z",
      "2027-04-03T14:30:00.000Z",
      "2027-04-03T14:45:00.000Z",
      "2027-04-03T15:30:00.000Z", // 02:00 (+10:30)
      "2027-04-03T15:45:00.000Z",
      "2027-04-03T16:00:00.000Z",
    ]);
    // Neither lists an instant twice.
    for (const starts of [ny.starts, lh.starts]) expect(new Set(starts).size).toBe(starts.length);
  });

  test("ordinary days and daytime windows on transition days are unchanged", async () => {
    await withProcessTimeZones(PROCESS_TIME_ZONES, () => {
      for (const date of ["2027-03-28", "2027-10-31", "2027-06-13"]) {
        const starts = generateDaySlotsWithTimezone(date, 60, 60, slotWindow("09:00", "17:00"), "Europe/Berlin").map(
          (candidate) => candidate.start
        );
        const offset = date === "2027-06-13" || date === "2027-03-28" ? 2 : 1;
        expect(starts).toEqual(range(9, 17).map((hour) => iso(utc(`${date}T00:00:00Z`) + (hour - offset) * 60 * MIN)));
      }
    });
  });
});
