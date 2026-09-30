// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  civilDateIn,
  fromLocalFields,
  isCivilDate,
  monthGrid,
  toLocalMidnight,
  todayIn,
} from "./civil-date";

// Vitest runs in Node, but the package's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Results must not depend on the process zone: each block runs in several.
// America/Santiago and Asia/Beirut change DST at local midnight.
const PROCESS_ZONES = [
  "UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland", "America/Denver",
  "Europe/London", "America/Santiago", "Asia/Beirut",
];
const ORIGINAL_TZ = process.env.TZ;

function restoreZone() {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}

const DAY_MS = 86_400_000;
const utcDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

describe("civil date values", () => {
  it("isCivilDate accepts only existing YYYY-MM-DD dates", () => {
    for (const valid of ["2027-09-01", "2024-02-29", "2027-12-31", "2000-01-01"]) {
      expect(isCivilDate(valid)).toBe(true);
    }
    for (const invalid of ["", "2027-02-29", "2027-13-01", "2027-00-10", "2027-09-31", "2027-9-1", "2027-09-01T00:00", " 2027-09-01"]) {
      expect(isCivilDate(invalid)).toBe(false);
    }
  });

  it("addDays crosses months, years and leap days, and rejects invalid input", () => {
    expect(addDays("2027-08-31", 1)).toBe("2027-09-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2027-03-27", 2)).toBe("2027-03-29"); // across Europe's DST start
    expect(() => addDays("2027-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2027-03-01", 0.5)).toThrow(RangeError);
  });

  it("monthGrid lists 42 consecutive days from the Monday on or before the 1st", () => {
    const cases: Array<[number, number, string]> = [
      [2027, 9, "2027-08-30"], // 1 September 2027 is a Wednesday
      [2027, 2, "2027-02-01"], // starts on a Monday
      [2027, 8, "2027-07-26"], // starts on a Sunday
      [2028, 1, "2027-12-27"], // across a year
    ];
    for (const [year, month, first] of cases) {
      const days = monthGrid(year, month);
      expect(days).toHaveLength(42);
      expect(days[0]).toBe(first);
      expect(new Date(`${days[0]}T00:00:00Z`).getUTCDay()).toBe(1);
      days.forEach((day, i) => expect(utcDay(day) - utcDay(first)).toBe(i));
    }
    expect(() => monthGrid(2027, 13)).toThrow(RangeError);
    expect(() => monthGrid(2027, 0)).toThrow(RangeError);
  });

  it("civilDateIn names the date of an instant in each zone", () => {
    const instant = new Date("2027-09-01T23:30:00Z");
    expect(Object.fromEntries(
      ["Pacific/Honolulu", "America/Los_Angeles", "UTC", "Europe/Berlin", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]
        .map((zone) => [zone, civilDateIn(instant, zone)]),
    )).toEqual({
      "Pacific/Honolulu": "2027-09-01",
      "America/Los_Angeles": "2027-09-01",
      UTC: "2027-09-01",
      "Europe/Berlin": "2027-09-02",
      "Asia/Tokyo": "2027-09-02",
      "Pacific/Auckland": "2027-09-02",
      "Pacific/Kiritimati": "2027-09-02",
    });
  });
});

describe.each(PROCESS_ZONES)("civil dates in process TZ %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });
  afterEach(() => {
    restoreZone();
    vi.useRealTimers();
  });

  it("CONTROL: the process zone is in effect", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it("a local-midnight carrier round-trips every day of 2027", () => {
    for (let day = "2027-01-01"; day <= "2027-12-31"; day = addDays(day, 1)) {
      const carrier = toLocalMidnight(day);
      expect(fromLocalFields(carrier)).toBe(day);
      expect(carrier.getDate()).toBe(Number(day.slice(8)));
    }
    expect(() => toLocalMidnight("2027-02-29")).toThrow(RangeError);
  });

  it("todayIn uses the given zone, not the process zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-09-02T00:30:00Z"));
    expect(todayIn("Europe/Berlin")).toBe("2027-09-02");
    expect(todayIn("America/New_York")).toBe("2027-09-01");
    expect(todayIn("UTC")).toBe("2027-09-02");
  });
});
