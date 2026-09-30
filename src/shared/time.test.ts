import { describe, expect, test } from "vitest";
import { parseCivilDate } from "./time.js";

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

