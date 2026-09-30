// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCalendarDays } from "./date-utils";

// Vitest runs in Node, but the package's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// F9: a cell's label, its key and today/past name one civil date, whatever the
// process (browser) zone. Each block runs in several process zones and, within
// it, display zones equal to, east and west of it.
const PROCESS_ZONES = [
  "UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland", "America/Denver",
  "Europe/London", "America/Santiago",
];
const DISPLAY_ZONES = [...PROCESS_ZONES, "Pacific/Honolulu", "America/Phoenix", "Atlantic/Reykjavik", "Pacific/Kiritimati"];
const ORIGINAL_TZ = process.env.TZ;

// Today in each display zone at NOW, written out rather than computed.
const NOW = "2027-09-01T23:30:00Z";
const TODAY: Record<string, string> = {
  UTC: "2027-09-01",
  "Europe/Berlin": "2027-09-02",
  "America/New_York": "2027-09-01",
  "Pacific/Auckland": "2027-09-02",
  "America/Denver": "2027-09-01",
  "Europe/London": "2027-09-02",
  "America/Santiago": "2027-09-01",
  "Pacific/Honolulu": "2027-09-01",
  "America/Phoenix": "2027-09-01",
  "Atlantic/Reykjavik": "2027-09-01",
  "Pacific/Kiritimati": "2027-09-02",
};

// March and October/November contain the DST changes of the process zones
// (the F9 probe's Denver -> Phoenix and London -> Reykjavik cases included).
const MONTHS: Array<[number, number, string, string]> = [
  // [year, month index, first cell, last cell]
  [2027, 2, "2027-03-01", "2027-04-11"],
  [2027, 8, "2027-08-30", "2027-10-10"],
  [2027, 9, "2027-09-27", "2027-11-07"],
  [2027, 10, "2027-11-01", "2027-12-12"],
];

const pad = (n: number) => String(n).padStart(2, "0");
const localFields = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;
const utcDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

describe.each(PROCESS_ZONES)("generateCalendarDays in process TZ %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it("CONTROL: the process zone is in effect", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it("rejects an invalid month Date instead of producing unusable keys", () => {
    expect(() => generateCalendarDays(new Date(NaN), null, {}, "UTC")).toThrow(RangeError);
  });

  it.each(DISPLAY_ZONES)("display %s: label, key and carrier name the same 42 distinct, consecutive days", (display) => {
    for (const [year, month, first, last] of MONTHS) {
      const days = generateCalendarDays(new Date(year, month, 1), null, {}, display);
      expect(days).toHaveLength(42);
      expect(days[0].civilDate).toBe(first);
      expect(days[41].civilDate).toBe(last);
      days.forEach((day, i) => {
        expect(utcDay(day.civilDate!) - utcDay(first)).toBe(i); // no duplicates, no gaps
        expect(localFields(day.date)).toBe(day.civilDate);
        expect(day.day).toBe(Number(day.civilDate!.slice(8)));
        expect(day.isCurrentMonth).toBe(Number(day.civilDate!.slice(5, 7)) === month + 1);
      });
    }
  });

  it.each(DISPLAY_ZONES)("display %s: the availability dot and the selection follow the label", (display) => {
    const days = generateCalendarDays(new Date(2027, 8, 1), new Date(2027, 8, 2), { "2027-09-02": true }, display);
    const labelled = (label: number) => days.find((day) => day.isCurrentMonth && day.day === label)!;
    expect(days.filter((day) => day.hasSlots)).toEqual([labelled(2)]);
    expect(days.filter((day) => day.isSelected)).toEqual([labelled(2)]);
    expect(labelled(1)).toMatchObject({ hasSlots: false, isSelected: false }); // CONTROL
  });

  it.each(DISPLAY_ZONES)("display %s: exactly one cell is today in the display zone, and it is enabled", (display) => {
    const days = generateCalendarDays(new Date(2027, 8, 1), null, {}, display);
    const today = days.filter((day) => day.isToday);
    expect(today.map((day) => day.civilDate)).toEqual([TODAY[display]]);
    expect(today[0]).toMatchObject({ isPast: false, disabled: false });
    expect(today[0].day).toBe(Number(TODAY[display].slice(8)));
    for (const day of days) {
      expect(day.isPast).toBe(day.civilDate! < TODAY[display]);
    }
    // 1 September is past only where it is already 2 September
    expect(days.find((day) => day.civilDate === "2027-09-01")!.disabled).toBe(TODAY[display] === "2027-09-02");
  });
});
