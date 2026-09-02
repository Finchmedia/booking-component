/// <reference types="vite/client" />
// Availability across timezones: the month view (getMonthAvailability) and the
// day view (getDaySlots) must always answer the same question about a day.
//
// Port review #1: getMonthAvailability used to compare a schedule's LOCAL
// wall-clock slot indices against the UTC busySlots bitmap (via isDayAvailable),
// skipping the wall-clock→UTC conversion generateDaySlotsWithTimezone performs.
// For any non-UTC resource that made days read as bookable regardless of
// bookings. Port review #10: an EMPTY effective window (weekend, "unavailable"
// override) must mean "closed" in both views instead of falling through to the
// legacy hardcoded 09:00–17:00 UTC branch.
//
// Fixtures: Europe/Berlin, Mon–Fri 09:00–17:00, 60-minute event on a 60-minute
// grid. The March week is CET (UTC+1), the June day is CEST (UTC+2), and
// 2027-03-28 is the DST switch.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  TUESDAY,
  TZ,
  berlin,
  book,
  daySlotsArgs,
  getBusySlots,
  getEffectiveSlots,
  range,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  zoned,
  type SeededSchedule,
  type T,
} from "./setup.test.js";

const HOUR = 60 * 60 * 1000;

// The fixture week: Mon 2027-03-08 … Sun 2027-03-14 (Europe/Berlin = UTC+1).
const MONDAY = "2027-03-08";
const WEDNESDAY = "2027-03-10";
const THURSDAY = "2027-03-11";
const FRIDAY = "2027-03-12";
const SATURDAY = "2027-03-13";
const SUNDAY = "2027-03-14";
// DST: Europe/Berlin switches to CEST (UTC+2) on Sunday 2027-03-28.
const FRIDAY_CET = "2027-03-26";
const SATURDAY_CET = "2027-03-27";
const SUNDAY_DST = "2027-03-28";
const MONDAY_CEST = "2027-03-29";
// Summer: Tuesday 2027-06-08, Europe/Berlin = UTC+2.
const SUMMER_TUESDAY = "2027-06-08";

/** `at(TUESDAY, 16)` → ms of 16:00 local (Europe/Berlin) on that date. */
function at(date: string, hour: number): number {
  return berlin(date, `${String(hour).padStart(2, "0")}:00`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Legacy (UTC) ISO start of a full hour, e.g. `utcHour(TUESDAY, 9)`. */
function utcHour(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/** Schedule-aware day view for `date` — effective window is re-read every time. */
async function dayStarts(t: T, seed: SeededSchedule, date: string): Promise<string[]> {
  const availableSlots = await getEffectiveSlots(t, seed.scheduleId, date);
  const slots = await t.query(api.public.getDaySlots, daySlotsArgs(seed, date, availableSlots));
  return slots.map((slot) => slot.time);
}

/** Schedule-aware month view for a date range. */
function monthMap(
  t: T,
  seed: SeededSchedule,
  dateFrom: string,
  dateTo: string
): Promise<Record<string, boolean>> {
  return t.query(api.public.getMonthAvailability, {
    resourceId: seed.resourceId,
    dateFrom,
    dateTo,
    eventLength: seed.lengthInMinutes,
    slotInterval: seed.slotInterval,
    resourceTimezone: seed.timezone,
    scheduleId: seed.scheduleId,
  });
}

/**
 * Queries BOTH views for every day of the range and asserts they agree:
 * `month[date] === (day[date].length > 0)`. Returns both for further assertions.
 */
async function agreeing(
  t: T,
  seed: SeededSchedule,
  dateFrom: string,
  dateTo: string
): Promise<{ month: Record<string, boolean>; day: Record<string, string[]> }> {
  const month = await monthMap(t, seed, dateFrom, dateTo);
  const day: Record<string, string[]> = {};
  for (const date of Object.keys(month)) {
    day[date] = await dayStarts(t, seed, date);
  }
  const dayHasSlots = Object.fromEntries(
    Object.entries(day).map(([date, starts]) => [date, starts.length > 0])
  );
  // Same object shape on both sides → a mismatch names the offending day.
  expect(dayHasSlots).toEqual(month);
  return { month, day };
}

describe("month view ↔ day view agreement (Europe/Berlin schedule)", () => {
  test("a single booking is subtracted in both views (UTC-converted busy slots)", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    const start = at(TUESDAY, 10);
    await book(t, seed, start, start + HOUR);

    // 10:00–11:00 Berlin = 09:00–10:00 UTC → UTC slots 36..39. The LOCAL slot
    // index of 10:00 is 40: the bitmap must not hold local indices.
    const busy = await getBusySlots(t, seed.resourceId, TUESDAY);
    expect(busy).toEqual(range(36, 40));
    expect(busy).not.toContain(40);

    const { month, day } = await agreeing(t, seed, MONDAY, SUNDAY);
    expect(month).toEqual({
      [MONDAY]: true,
      [TUESDAY]: true, // one hour gone, seven left — still bookable
      [WEDNESDAY]: true,
      [THURSDAY]: true,
      [FRIDAY]: true,
      [SATURDAY]: false,
      [SUNDAY]: false,
    });
    expect(day[TUESDAY]).toHaveLength(7);
    expect(day[TUESDAY]).not.toContain(iso(start));
    expect(day[TUESDAY][0]).toBe(utcHour(TUESDAY, 8)); // 09:00 Berlin
    expect(day[WEDNESDAY]).toHaveLength(8);
  });

  test("booking every candidate closes the day while the neighbour stays open", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    const bookings = [];
    for (const hour of range(9, 17)) {
      const start = at(TUESDAY, hour);
      bookings.push(await book(t, seed, start, start + HOUR));
    }
    expect(bookings).toHaveLength(8);

    // 09:00–17:00 Berlin = 08:00–16:00 UTC → UTC slots 32..63.
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual(range(32, 64));

    const full = await agreeing(t, seed, MONDAY, SUNDAY);
    expect(full.month[TUESDAY]).toBe(false);
    expect(full.day[TUESDAY]).toEqual([]);
    expect(full.month[WEDNESDAY]).toBe(true);
    expect(full.day[WEDNESDAY]).toHaveLength(8);

    // Freeing one candidate reopens the day in BOTH views.
    const afternoon = bookings.find((booking) => booking?.start === at(TUESDAY, 13));
    expect(afternoon).toBeDefined();
    await t.mutation(api.public.cancelBookingByToken, {
      uid: afternoon!.uid,
      token: afternoon!.managementToken!,
    });

    const reopened = await agreeing(t, seed, MONDAY, SUNDAY);
    expect(reopened.month[TUESDAY]).toBe(true);
    expect(reopened.day[TUESDAY]).toEqual([utcHour(TUESDAY, 12)]); // 13:00 Berlin
  });

  test("a day without weekly hours is closed in both views (no legacy fall-through)", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    expect(await getEffectiveSlots(t, seed.scheduleId, SATURDAY)).toEqual([]);
    const weekend = await agreeing(t, seed, SATURDAY, SUNDAY);
    expect(weekend.month).toEqual({ [SATURDAY]: false, [SUNDAY]: false });
    expect(weekend.day[SATURDAY]).toEqual([]);
    expect(weekend.day[SUNDAY]).toEqual([]);

    // The empty window is what closes the day — the schedule-less LEGACY path
    // (no resourceTimezone / no availableSlots) still offers the hardcoded
    // 09:00–17:00 UTC window on the very same days, in both views alike.
    expect(
      await t.query(api.public.getMonthAvailability, {
        resourceId: seed.resourceId,
        dateFrom: SATURDAY,
        dateTo: SUNDAY,
        eventLength: seed.lengthInMinutes,
        slotInterval: seed.slotInterval,
      })
    ).toEqual({ [SATURDAY]: true, [SUNDAY]: true });
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: seed.resourceId,
        date: SATURDAY,
        eventLength: seed.lengthInMinutes,
        slotInterval: seed.slotInterval,
      })
    ).toHaveLength(8);
  });

  test("date overrides close a weekday and reopen a weekend in both views", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    // (d) "unavailable" override on a normal working Wednesday.
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: WEDNESDAY,
      type: "unavailable",
    });
    const closed = await agreeing(t, seed, MONDAY, SUNDAY);
    expect(closed.month[WEDNESDAY]).toBe(false);
    expect(closed.day[WEDNESDAY]).toEqual([]);
    expect(closed.month[THURSDAY]).toBe(true); // neighbouring weekdays untouched
    expect(closed.day[THURSDAY]).toHaveLength(8);

    // Custom hours reopen a Saturday: 13:00–15:00 Berlin = 12:00–14:00 UTC.
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: SATURDAY,
      type: "custom",
      customHours: [{ startTime: "13:00", endTime: "15:00" }],
    });
    const reopened = await agreeing(t, seed, MONDAY, SUNDAY);
    expect(reopened.month[SATURDAY]).toBe(true);
    expect(reopened.day[SATURDAY]).toEqual([utcHour(SATURDAY, 12), utcHour(SATURDAY, 13)]);
    expect(reopened.month[SUNDAY]).toBe(false); // still no window

    // Bookings inside the custom window narrow it, then close the day again.
    await book(t, seed, at(SATURDAY, 13), at(SATURDAY, 14));
    expect(await getBusySlots(t, seed.resourceId, SATURDAY)).toEqual(range(48, 52));
    const half = await agreeing(t, seed, SATURDAY, SATURDAY);
    expect(half.month[SATURDAY]).toBe(true);
    expect(half.day[SATURDAY]).toEqual([utcHour(SATURDAY, 13)]);

    await book(t, seed, at(SATURDAY, 14), at(SATURDAY, 15));
    const done = await agreeing(t, seed, SATURDAY, SATURDAY);
    expect(done.month[SATURDAY]).toBe(false);
    expect(done.day[SATURDAY]).toEqual([]);
  });

  test("a window shorter than the event has no candidates in either view", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    // Non-empty window (so the `length === 0` short-circuit does NOT apply),
    // but too short for a 60-minute event: 09:00–09:30 Berlin.
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: THURSDAY,
      type: "custom",
      customHours: [{ startTime: "09:00", endTime: "09:30" }],
    });
    const window = await getEffectiveSlots(t, seed.scheduleId, THURSDAY);
    expect(window).toEqual([36, 37]);

    const tooShort = await agreeing(t, seed, THURSDAY, THURSDAY);
    expect(tooShort.month).toEqual({ [THURSDAY]: false });
    expect(tooShort.day[THURSDAY]).toEqual([]);

    // The same window fits a 30-minute event — again in both views.
    expect(
      await t.query(api.public.getMonthAvailability, {
        resourceId: seed.resourceId,
        dateFrom: THURSDAY,
        dateTo: THURSDAY,
        eventLength: 30,
        slotInterval: 30,
        resourceTimezone: seed.timezone,
        scheduleId: seed.scheduleId,
      })
    ).toEqual({ [THURSDAY]: true });
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: seed.resourceId,
        date: THURSDAY,
        eventLength: 30,
        slotInterval: 30,
        resourceTimezone: seed.timezone,
        availableSlots: window,
      })
    ).toEqual([{ time: utcHour(THURSDAY, 8) }]);
  });
});

describe("legacy path (no resourceTimezone)", () => {
  test("keeps the hardcoded 09:00–17:00 UTC window and subtracts UTC bookings", async () => {
    const { t } = setup();
    // No schedule at all: the availability queries fall back to 09:00–17:00 UTC.
    const seed = await seedResource(t);
    const legacyArgs = {
      resourceId: seed.resourceId,
      date: TUESDAY,
      eventLength: seed.lengthInMinutes,
      slotInterval: seed.slotInterval,
    };

    const before = (await t.query(api.public.getDaySlots, legacyArgs)).map((slot) => slot.time);
    expect(before).toEqual(range(9, 17).map((hour) => utcHour(TUESDAY, hour)));

    // A booking at 10:00 UTC (not 10:00 Berlin) removes the 10:00 UTC start.
    await book(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"));
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual(range(40, 44));

    const after = (await t.query(api.public.getDaySlots, legacyArgs)).map((slot) => slot.time);
    expect(after).toEqual(before.filter((time) => time !== utcHour(TUESDAY, 10)));
    expect(after).toHaveLength(7);

    // The schedule-aware path needs BOTH resourceTimezone and availableSlots:
    // with only one of them the legacy UTC grid is used and a Berlin window
    // (local slots 36..67 = 09:00–17:00 Berlin) is ignored.
    expect(
      (
        await t.query(api.public.getDaySlots, { ...legacyArgs, availableSlots: range(36, 68) })
      ).map((slot) => slot.time)
    ).toEqual(after);
    expect(
      (await t.query(api.public.getDaySlots, { ...legacyArgs, resourceTimezone: TZ })).map(
        (slot) => slot.time
      )
    ).toEqual(after);

    // Month view on the same legacy window agrees: 60 minutes still fit around
    // the booking, a full 8-hour event no longer does.
    const monthArgs = {
      resourceId: seed.resourceId,
      dateFrom: TUESDAY,
      dateTo: WEDNESDAY,
      slotInterval: seed.slotInterval,
    };
    expect(
      await t.query(api.public.getMonthAvailability, { ...monthArgs, eventLength: 60 })
    ).toEqual({ [TUESDAY]: true, [WEDNESDAY]: true });
    expect(
      await t.query(api.public.getMonthAvailability, { ...monthArgs, eventLength: 480 })
    ).toEqual({ [TUESDAY]: false, [WEDNESDAY]: true });
  });
});

describe("DST-aware conversion of the schedule window", () => {
  test("a summer booking drops exactly its own local candidate", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { date: SUMMER_TUESDAY });
    expect(seed.availableSlots).toEqual(range(36, 68)); // LOCAL 09:00–17:00

    // CEST (UTC+2): 09:00–16:00 Berlin = 07:00–14:00 UTC.
    const before = await dayStarts(t, seed, SUMMER_TUESDAY);
    expect(before).toEqual(range(7, 15).map((hour) => utcHour(SUMMER_TUESDAY, hour)));

    const start = at(SUMMER_TUESDAY, 16);
    expect(start).toBe(utc(SUMMER_TUESDAY, "14:00")); // 16:00 Berlin = 14:00 UTC in summer
    await book(t, seed, start, start + HOUR);

    // UTC slots 56..59 — the LOCAL index of 16:00 would be 64.
    const busy = await getBusySlots(t, seed.resourceId, SUMMER_TUESDAY);
    expect(busy).toEqual(range(56, 60));
    expect(busy).not.toContain(64);

    const after = await dayStarts(t, seed, SUMMER_TUESDAY);
    expect(after).toEqual(before.filter((time) => time !== iso(start)));
    expect(after).not.toContain(utcHour(SUMMER_TUESDAY, 14)); // 16:00 Berlin is gone
    expect(after).toContain(utcHour(SUMMER_TUESDAY, 13)); // 15:00 Berlin still offered
    expect(after).toHaveLength(7);

    const week = await agreeing(t, seed, "2027-06-07", "2027-06-13");
    expect(week.month).toEqual({
      "2027-06-07": true,
      "2027-06-08": true,
      "2027-06-09": true,
      "2027-06-10": true,
      "2027-06-11": true,
      "2027-06-12": false,
      "2027-06-13": false,
    });
  });

  test("the same weekly window converts per date across the DST switch", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);

    // Friday before the switch is CET, Monday after it is CEST.
    const friday = await dayStarts(t, seed, FRIDAY_CET);
    const monday = await dayStarts(t, seed, MONDAY_CEST);
    expect(friday).toEqual(range(8, 16).map((hour) => utcHour(FRIDAY_CET, hour)));
    expect(monday).toEqual(range(7, 15).map((hour) => utcHour(MONDAY_CEST, hour)));

    // 09:00 Berlin on the CEST Monday = 07:00 UTC → UTC slots 28..31.
    await book(t, seed, at(MONDAY_CEST, 9), at(MONDAY_CEST, 9) + HOUR);
    expect(await getBusySlots(t, seed.resourceId, MONDAY_CEST)).toEqual(range(28, 32));

    const across = await agreeing(t, seed, FRIDAY_CET, MONDAY_CEST);
    expect(across.month).toEqual({
      [FRIDAY_CET]: true,
      [SATURDAY_CET]: false,
      [SUNDAY_DST]: false, // the switch day is a Sunday: no weekly hours
      [MONDAY_CEST]: true,
    });
    expect(across.day[MONDAY_CEST]).toEqual(monday.slice(1)); // only 09:00 local is gone
    expect(across.day[FRIDAY_CET]).toEqual(friday); // the earlier week is untouched
  });
});

describe("resource timezones whose business day crosses UTC midnight", () => {
  // BUG(port-review): getDaySlots reads only the daily_availability row of the LOCAL date, while generateDaySlotsWithTimezone throws away the UTC date of a converted slot — for UTC+12 the morning candidates live on the PREVIOUS UTC row and therefore always read as free.
  //
  // Pacific/Auckland (UTC+12 in June), Mon–Fri 09:00–17:00 local: the local day
  // 2027-06-08 09:00–17:00 is 2027-06-07T21:00Z … 2027-06-08T05:00Z, so
  // createBooking (correctly, via getRequiredSlots) stores busy slots on TWO
  // UTC rows: "2027-06-07" → [84..95] and "2027-06-08" → [0..19].
  // getDaySlots("2027-06-08") only loads the "2027-06-08" row, so the three
  // candidates that convert to UTC slots 84/88/92 are compared against the
  // wrong day's bitmap.
  // Observed with the whole local day booked:
  //   getDaySlots  → ["2027-06-07T21:00:00.000Z", "…T22:00:00.000Z", "…T23:00:00.000Z"]
  //                  (expected [])
  //   getMonthAvailability["2027-06-08"] → true (expected false)
  // Re-booking one of those offered starts throws "Time slot no longer
  // available", i.e. the day view advertises slots the booking mutation
  // rejects. Fix belongs in public.ts (load the neighbouring UTC day's
  // busySlots, or key the check by the slot's own UTC date) — utils.ts
  // generateDaySlotsWithTimezone already computes that date and discards it.
  test.skip("a fully booked local day is closed in both views (UTC+12)", async () => {
    const { t } = setup();
    const AUCKLAND = "Pacific/Auckland";
    const date = "2027-06-08"; // Tuesday; Pacific/Auckland = UTC+12 (NZST)
    const seed = await seedResourceWithSchedule(t, { timezone: AUCKLAND, date });
    expect(seed.availableSlots).toEqual(range(36, 68)); // LOCAL 09:00–17:00

    // The local window starts on the PREVIOUS UTC day.
    const open = zoned(date, "09:00", AUCKLAND);
    const close = zoned(date, "17:00", AUCKLAND);
    expect(iso(open)).toBe("2027-06-07T21:00:00.000Z");
    expect(await dayStarts(t, seed, date)).toHaveLength(8);

    await book(t, seed, open, close);
    // Slot bookkeeping itself is correct: two UTC rows.
    expect(await getBusySlots(t, seed.resourceId, "2027-06-07")).toEqual(range(84, 96));
    expect(await getBusySlots(t, seed.resourceId, date)).toEqual(range(0, 20));

    // Nothing is left to book on that local day.
    expect(await dayStarts(t, seed, date)).toEqual([]);
    expect(await monthMap(t, seed, date, date)).toEqual({ [date]: false });

    // …and what the day view offers must be bookable.
    await expect(book(t, seed, open, open + HOUR)).rejects.toThrow(
      "Time slot no longer available"
    );
  });
});
