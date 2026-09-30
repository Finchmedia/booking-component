import { describe, expect, test } from "vitest";
import { parseCivilDate, weekdayOf, type CivilDate } from "./time.js";
import { PROCESS_TIME_ZONES, withProcessTimeZones } from "../testing/process-time-zone.js";

describe("parseCivilDate", () => {
  test.each([
    ["2027-03-09", "2027-03-09"],
    ["2027-3-9", "2027-03-09"], // unpadded month and day are normalized
    ["2027-12-31", "2027-12-31"],
    ["2028-02-29", "2028-02-29"], // leap year
    ["2000-02-29", "2000-02-29"], // divisible by 400
    ["0099-01-01", "0099-01-01"], // years below 100 are not shifted to 19xx
  ])("accepts %s as %s", (input, canonical) => {
    expect(parseCivilDate(input)).toBe(canonical);
  });

  test.each([
    "2027-02-30", // Date parsing rolls this over to March 2
    "2027-02-29", // not a leap year
    "1900-02-29", // divisible by 100, not by 400
    "2027-13-01",
    "2027-00-10",
    "2027-04-31",
    "2027-03-00",
    "",
    "garbage",
    "27-03-09",
    "2027-03-09T00:00",
    " 2027-03-09",
    "2027/03/09",
    "2027-003-09",
  ])("rejects %j", (input) => {
    expect(() => parseCivilDate(input)).toThrow(
      `Invalid date "${input}": expected a calendar date as YYYY-MM-DD`
    );
  });
});

describe("weekdayOf", () => {
  test("is the calendar day's own weekday in every process time zone", async () => {
    await withProcessTimeZones(PROCESS_TIME_ZONES, () => {
      expect(weekdayOf("2027-03-07" as CivilDate)).toBe(0); // Sunday
      expect(weekdayOf("2027-03-09" as CivilDate)).toBe(2); // Tuesday
      expect(weekdayOf("2027-03-13" as CivilDate)).toBe(6); // Saturday
      expect(weekdayOf("2028-02-29" as CivilDate)).toBe(2);
      expect(weekdayOf("0099-01-01" as CivilDate)).toBe(4);
      // Oracle: the weekday a UTC calendar reports for the same day.
      for (let day = 1; day <= 31; day++) {
        const date = parseCivilDate(`2027-1-${day}`);
        expect(weekdayOf(date)).toBe(new Date(`${date}T00:00:00.000Z`).getUTCDay());
      }
    });
  });
});
