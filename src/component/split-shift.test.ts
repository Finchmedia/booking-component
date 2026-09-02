/// <reference types="vite/client" />
/**
 * Slot-math unit tests for utils.ts — split shifts (change #6) and friends.
 *
 * These are PURE function tests: utils.ts is imported directly, no backend is
 * started. The harness is used only for its time helpers (`berlin`, `zoned`,
 * `utc`, `range`, `utcSlot`), so the expected UTC instants come from an
 * independent implementation (date-fns-tz) rather than from the code under
 * test.
 */
import { describe, expect, test } from "vitest";
import {
  BUSINESS_HOURS_END,
  BUSINESS_HOURS_START,
  SLOTS_PER_DAY,
  SLOT_DURATION_MS,
  areSlotsAvailable,
  generateDaySlots,
  generateDaySlotsWithTimezone,
  getRequiredSlots,
  isCandidateAvailable,
  isDayAvailable,
  localSlotToUTCSlot,
  slotIndexToTime,
  slotToTimestamp,
  timeToSlotIndex,
  timestampToSlot,
  wallClockToUTC,
} from "./utils.js";
import { TUESDAY, TZ, berlin, range, utc, utcSlot, zoned } from "./setup.test.js";

// ============================================
// LOCAL HELPERS / FIXTURES
// ============================================

type Candidate = { start: string; slots: number[]; slotsByDate: Map<string, number[]> };

const startsOf = (candidates: Candidate[]): string[] => candidates.map((c) => c.start);
/** A candidate whose slots all lie on the UTC date of `start`. */
const sameDayCandidate = (start: string, slots: number[]): Candidate => ({
  start,
  slots,
  slotsByDate: new Map([[start.slice(0, 10), slots]]),
});
const iso = (ms: number): string => new Date(ms).toISOString();
const hh = (hour: number): string => String(hour).padStart(2, "0");
/** Local slot indices covering the wall-clock window [from, to): `slotWindow("09:00","17:00")` → 36…67. */
const slotWindow = (from: string, to: string): number[] =>
  range(timeToSlotIndex(from), timeToSlotIndex(to));
const HOUR_MS = 60 * 60 * 1000;

/** Europe/Berlin: 02:00 CET → 03:00 CEST (the transition instant is 01:00 UTC). */
const SPRING_FORWARD = "2026-03-29";
/** Europe/Berlin: 03:00 CEST → 02:00 CET (the transition instant is 01:00 UTC). */
const FALL_BACK = "2026-10-25";
/** UTC+12 in June — local business hours start on the PREVIOUS UTC day. */
const AUCKLAND = "Pacific/Auckland";
const NZ_DAY = "2026-06-10";
const NZ_UTC_DAY_BEFORE = "2026-06-09";

// ============================================
// (a) Single contiguous window
// ============================================

describe("generateDaySlotsWithTimezone: one contiguous window", () => {
  const window9to17 = slotWindow("09:00", "17:00"); // local slots 36…67

  test("offers a start every interval from the window start up to the last one that fits", () => {
    const candidates = generateDaySlotsWithTimezone(TUESDAY, 60, 30, window9to17, TZ);

    // 09:00 … 16:00 local inclusive, every 30 minutes → 15 candidates.
    expect(candidates).toHaveLength(15);
    expect(startsOf(candidates)).toEqual(
      range(0, 15).map((k) => iso(berlin(TUESDAY, "09:00") + k * 30 * 60 * 1000))
    );
    // Europe/Berlin is UTC+1 on 2027-03-09, so the day view starts an hour earlier in UTC.
    expect(candidates[0].start).toBe("2027-03-09T08:00:00.000Z");
    expect(candidates[14].start).toBe(iso(berlin(TUESDAY, "16:00")));
    // 16:30 would run past the 17:00 window end.
    expect(startsOf(candidates)).not.toContain(iso(berlin(TUESDAY, "16:30")));
  });

  test("each candidate carries exactly the UTC slot indices its booking would occupy", () => {
    const candidates = generateDaySlotsWithTimezone(TUESDAY, 60, 30, window9to17, TZ);

    for (const [k, candidate] of candidates.entries()) {
      const startMs = Date.parse(candidate.start);
      // 09:00 local = UTC slot 32; every step of 30 minutes advances 2 slots.
      expect(candidate.slots).toEqual(range(32 + 2 * k, 36 + 2 * k));
      expect(candidate.slots).toEqual(range(utcSlot(startMs), utcSlot(startMs) + 4));
      // …and they match what createBooking would actually reserve.
      expect(getRequiredSlots(startMs, startMs + HOUR_MS).get(TUESDAY)).toEqual(candidate.slots);
    }
  });

  test("in UTC it is byte-for-byte the legacy business-hours generator", () => {
    expect(
      generateDaySlotsWithTimezone(
        TUESDAY,
        60,
        30,
        range(BUSINESS_HOURS_START, BUSINESS_HOURS_END),
        "UTC"
      )
    ).toEqual(generateDaySlots(TUESDAY, 60, 30));
  });

  test("event length and interval are rounded UP to whole 15-minute slots", () => {
    // 50 min → 4 slots (60 min); a 20-min interval → a 30-min step.
    const rounded = generateDaySlotsWithTimezone(TUESDAY, 50, 20, slotWindow("09:00", "11:00"), "UTC");
    expect(startsOf(rounded)).toEqual([
      `${TUESDAY}T09:00:00.000Z`,
      `${TUESDAY}T09:30:00.000Z`,
      `${TUESDAY}T10:00:00.000Z`,
    ]);
    expect(rounded[0].slots).toEqual([36, 37, 38, 39]);
  });
});

// ============================================
// (b) Split shifts — candidate starts per window
// ============================================

describe("generateDaySlotsWithTimezone: split shifts", () => {
  test("every window is anchored at its own start, and short windows contribute nothing", () => {
    const morning = slotWindow("08:00", "12:00"); // 32…47
    const afternoon = slotWindow("14:00", "17:30"); // 56…69
    const evening = slotWindow("19:00", "20:00"); // 76…79 — too short for a 120-min event

    const candidates = generateDaySlotsWithTimezone(
      TUESDAY,
      120,
      150,
      [...morning, ...afternoon, ...evening],
      TZ
    );

    // 08:00 local = 07:00Z = slot 28; 14:00 local = 13:00Z = slot 52 (UTC+1).
    expect(candidates).toEqual([
      sameDayCandidate(iso(berlin(TUESDAY, "08:00")), range(28, 36)),
      sameDayCandidate(iso(berlin(TUESDAY, "14:00")), range(52, 60)),
    ]);
  });

  test("the afternoon window is reachable although the gap is not a multiple of the interval", () => {
    const candidates = generateDaySlotsWithTimezone(
      TUESDAY,
      120,
      150,
      [...slotWindow("08:00", "12:00"), ...slotWindow("14:00", "17:30")],
      TZ
    );
    const starts = startsOf(candidates);

    // One global grid anchored at slot 32 with a 150-min step lands on 08:00,
    // 10:30, 13:00, 15:30, 18:00 — of those only 08:00 and 15:30 fit inside a
    // window, so 14:00 (the actual start of the afternoon shift) was lost.
    expect(starts).toContain(iso(berlin(TUESDAY, "14:00")));
    expect(starts).not.toContain(iso(berlin(TUESDAY, "15:30")));
    expect(starts).not.toContain(iso(berlin(TUESDAY, "10:30"))); // inside the morning gap
  });

  test("a gap that IS a multiple of the interval yields the same starts either way", () => {
    const candidates = generateDaySlotsWithTimezone(
      TUESDAY,
      60,
      60,
      [...slotWindow("08:00", "10:00"), ...slotWindow("11:00", "13:00")],
      "UTC"
    );
    expect(startsOf(candidates)).toEqual(
      ["08:00", "09:00", "11:00", "12:00"].map((time) => `${TUESDAY}T${time}:00.000Z`)
    );
  });

  test("adjacent windows merge into one run, so the grid keeps counting across the seam", () => {
    // Schedules accept adjacent windows (09:00–12:00 + 12:00–14:00); their slot
    // indices are contiguous, so this must behave as a single 09:00–14:00 run.
    const candidates = generateDaySlotsWithTimezone(
      TUESDAY,
      60,
      90,
      [...slotWindow("09:00", "12:00"), ...slotWindow("12:00", "14:00")],
      "UTC"
    );
    expect(startsOf(candidates)).toEqual(
      ["09:00", "10:30", "12:00"].map((time) => `${TUESDAY}T${time}:00.000Z`)
    );
    expect(candidates).toEqual(
      generateDaySlotsWithTimezone(TUESDAY, 60, 90, slotWindow("09:00", "14:00"), "UTC")
    );
  });

  test("a window shorter than the event produces no candidates at all", () => {
    expect(generateDaySlotsWithTimezone(TUESDAY, 120, 15, slotWindow("09:00", "10:00"), "UTC")).toEqual(
      []
    );
    // …and an event that exactly fills the window produces exactly one.
    expect(
      generateDaySlotsWithTimezone(TUESDAY, 60, 15, slotWindow("09:00", "10:00"), "UTC")
    ).toEqual([sameDayCandidate(`${TUESDAY}T09:00:00.000Z`, [36, 37, 38, 39])]);
  });
});

// ============================================
// (c) / (d) Degenerate input
// ============================================

describe("generateDaySlotsWithTimezone: degenerate availableSlots", () => {
  test("duplicate and unsorted indices are normalised before the runs are built", () => {
    const messy = [40, 36, 38, 36, 37, 39, 38, 40];
    const clean = [36, 37, 38, 39, 40];

    expect(generateDaySlotsWithTimezone(TUESDAY, 60, 15, messy, TZ)).toEqual(
      generateDaySlotsWithTimezone(TUESDAY, 60, 15, clean, TZ)
    );
    expect(startsOf(generateDaySlotsWithTimezone(TUESDAY, 60, 15, messy, TZ))).toEqual([
      iso(berlin(TUESDAY, "09:00")),
      iso(berlin(TUESDAY, "09:15")),
    ]);
  });

  test("a repeated index does not split a run into phantom one-slot windows", () => {
    expect(generateDaySlotsWithTimezone(TUESDAY, 15, 15, [36, 36, 36], "UTC")).toEqual([
      sameDayCandidate(`${TUESDAY}T09:00:00.000Z`, [36]),
    ]);
    expect(
      startsOf(generateDaySlotsWithTimezone(TUESDAY, 30, 15, [36, 37, 37, 38, 38, 38], "UTC"))
    ).toEqual([`${TUESDAY}T09:00:00.000Z`, `${TUESDAY}T09:15:00.000Z`]);
  });

  test("an empty window short-circuits before any timezone work", () => {
    expect(generateDaySlotsWithTimezone(TUESDAY, 60, 60, [], TZ)).toEqual([]);
    // The early return happens before Intl is touched, so even a bogus zone is safe.
    expect(generateDaySlotsWithTimezone(TUESDAY, 60, 60, [], "Not/AZone")).toEqual([]);
  });
});

// ============================================
// (e) DST transition days
// ============================================

describe("generateDaySlotsWithTimezone: DST transition days (Europe/Berlin)", () => {
  test("a business window on either transition day yields strictly increasing UTC starts", () => {
    for (const date of [SPRING_FORWARD, FALL_BACK]) {
      const candidates = generateDaySlotsWithTimezone(date, 60, 60, slotWindow("09:00", "17:00"), TZ);
      expect(candidates).toHaveLength(8);

      const instants = startsOf(candidates).map((start) => Date.parse(start));
      expect(instants.every(Number.isFinite)).toBe(true);
      for (let i = 1; i < instants.length; i++) {
        expect(instants[i]).toBeGreaterThan(instants[i - 1]);
      }
      // date-fns-tz as an independent oracle for the wall-clock → UTC mapping.
      expect(startsOf(candidates)).toEqual(
        range(9, 17).map((hour) => iso(zoned(date, `${hh(hour)}:00`, TZ)))
      );
      for (const candidate of candidates) {
        const slot = utcSlot(Date.parse(candidate.start));
        expect(candidate.slots).toEqual(range(slot, slot + 4));
      }
    }
  });

  test("the offset in force AFTER the change is used on both days", () => {
    // 2026-03-29 is CEST (UTC+2) from 03:00 local on; 2026-10-25 is CET (UTC+1).
    expect(
      generateDaySlotsWithTimezone(SPRING_FORWARD, 60, 60, slotWindow("09:00", "10:00"), TZ)
    ).toEqual([sameDayCandidate("2026-03-29T07:00:00.000Z", [28, 29, 30, 31])]);
    expect(
      generateDaySlotsWithTimezone(FALL_BACK, 60, 60, slotWindow("09:00", "10:00"), TZ)
    ).toEqual([sameDayCandidate("2026-10-25T08:00:00.000Z", [32, 33, 34, 35])]);
    // A day-long window still stays inside the day and never repeats an instant.
    const allDay = generateDaySlotsWithTimezone(SPRING_FORWARD, 60, 60, range(6, 96), TZ);
    expect(new Set(startsOf(allDay)).size).toBe(allDay.length);
  });

  // wallClockToUTC() re-reads the zone offset at the guessed instant (two-pass,
  // like date-fns-tz). Reading it at the NAIVE instant only — the previous
  // behaviour — converted the hour before a DST change with the post-change
  // offset: 01:00 CET on the spring day came back as 2026-03-28T23:00Z (the
  // instant of 00:00 CET), 01:00 CEST on the fall day as 2026-10-25T00:00Z
  // (= 02:00 local).
  test("the hour before a DST change maps to the right UTC instant", () => {
    // Spring forward: 01:00 CET is 2026-03-29T00:00Z.
    expect(wallClockToUTC(SPRING_FORWARD, "01:00", TZ)).toBe(zoned(SPRING_FORWARD, "01:00", TZ));
    const spring = startsOf(
      generateDaySlotsWithTimezone(SPRING_FORWARD, 60, 60, slotWindow("00:00", "06:00"), TZ)
    );
    // 02:00 does not exist on this day (the clock jumps 02:00 → 03:00). It is
    // SKIPPED rather than folded onto the instant of another candidate, so the
    // six-hour local window yields five distinct instants.
    expect(spring).toEqual([
      "2026-03-28T23:00:00.000Z", // 00:00 CET
      "2026-03-29T00:00:00.000Z", // 01:00 CET
      "2026-03-29T01:00:00.000Z", // 03:00 CEST
      "2026-03-29T02:00:00.000Z", // 04:00 CEST
      "2026-03-29T03:00:00.000Z", // 05:00 CEST
    ]);
    expect(spring[1]).toBe(iso(zoned(SPRING_FORWARD, "01:00", TZ)));

    // Fall back: 01:00 CEST is 2026-10-24T23:00Z. The ambiguous 02:00 (it occurs
    // twice) resolves to its LATER occurrence (02:00 CET = 01:00Z), as in
    // date-fns-tz; the first occurrence (00:00Z) is never offered.
    expect(wallClockToUTC(FALL_BACK, "01:00", TZ)).toBe(zoned(FALL_BACK, "01:00", TZ));
    expect(wallClockToUTC(FALL_BACK, "02:00", TZ)).toBe(zoned(FALL_BACK, "02:00", TZ));
    const fall = startsOf(
      generateDaySlotsWithTimezone(FALL_BACK, 60, 60, slotWindow("00:00", "06:00"), TZ)
    );
    expect(fall).toEqual([
      "2026-10-24T22:00:00.000Z", // 00:00 CEST
      "2026-10-24T23:00:00.000Z", // 01:00 CEST
      "2026-10-25T01:00:00.000Z", // 02:00 CET (second occurrence)
      "2026-10-25T02:00:00.000Z", // 03:00 CET
      "2026-10-25T03:00:00.000Z", // 04:00 CET
      "2026-10-25T04:00:00.000Z", // 05:00 CET
    ]);
    expect(fall).toEqual(
      ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00"].map((time) =>
        iso(zoned(FALL_BACK, time, TZ))
      )
    );
  });
});

// ============================================
// (f) Windows that cross the UTC date boundary
// ============================================

describe("generateDaySlotsWithTimezone: local day vs UTC day (Pacific/Auckland)", () => {
  const nzCandidates = () =>
    generateDaySlotsWithTimezone(NZ_DAY, 60, 60, slotWindow("09:00", "17:00"), AUCKLAND);

  test("the ISO start carries the real UTC date, which may be the previous day", () => {
    const candidates = nzCandidates();
    expect(candidates).toHaveLength(8);
    expect(startsOf(candidates)).toEqual(
      range(9, 17).map((hour) => iso(zoned(NZ_DAY, `${hh(hour)}:00`, AUCKLAND)))
    );
    // 09:00–12:00 local (UTC+12) is 21:00–00:00 UTC on the PREVIOUS calendar day.
    expect(candidates[0].start).toBe(`${NZ_UTC_DAY_BEFORE}T21:00:00.000Z`);
    expect(candidates[3].start).toBe(`${NZ_DAY}T00:00:00.000Z`);
    expect(startsOf(candidates).filter((s) => s.startsWith(NZ_UTC_DAY_BEFORE))).toHaveLength(3);
  });

  test("slot indices are relative to each candidate's own UTC day, so they wrap at midnight", () => {
    const candidates = nzCandidates();
    // 21:00Z, 22:00Z, 23:00Z on 06-09, then 00:00Z … 04:00Z on 06-10.
    expect(candidates.map((c) => c.slots[0])).toEqual([84, 88, 92, 0, 4, 8, 12, 16]);
    for (const candidate of candidates) {
      expect(candidate.slots).toEqual(range(candidate.slots[0], candidate.slots[0] + 4));
      expect(candidate.slots[0]).toBe(utcSlot(Date.parse(candidate.start)));
    }

    // A candidate keeps the UTC DATE next to its indices (`slotsByDate`, the
    // same map getRequiredSlots produces when daily_availability is written),
    // so slot 84 of the 09:00 candidate is known to belong to the PREVIOUS day.
    expect(localSlotToUTCSlot(NZ_DAY, timeToSlotIndex("09:00"), AUCKLAND)).toEqual({
      utcDate: NZ_UTC_DAY_BEFORE,
      utcSlot: 84,
    });
    const firstStart = Date.parse(candidates[0].start);
    expect(getRequiredSlots(firstStart, firstStart + HOUR_MS)).toEqual(
      new Map([[NZ_UTC_DAY_BEFORE, [84, 85, 86, 87]]])
    );
    expect(candidates[0].slotsByDate).toEqual(new Map([[NZ_UTC_DAY_BEFORE, [84, 85, 86, 87]]]));
    expect(candidates[3].slotsByDate).toEqual(new Map([[NZ_DAY, [0, 1, 2, 3]]]));
    for (const candidate of candidates) {
      expect([...candidate.slotsByDate.values()].flat()).toEqual(candidate.slots);
    }
  });

  // The 11:30-local candidate (2026-06-09T23:30Z) crosses UTC midnight: its slots
  // are [94, 95] on 06-09 and [0, 1] on 06-10. (Before, `utcStartSlot + i` was
  // never wrapped and produced [94, 95, 96, 97] — indices no row could match.)
  test("a candidate that straddles UTC midnight stays inside the 0–95 slot space", () => {
    const half = generateDaySlotsWithTimezone(NZ_DAY, 60, 30, slotWindow("09:00", "17:00"), AUCKLAND);
    const straddling = half.find((c) => c.start === `${NZ_UTC_DAY_BEFORE}T23:30:00.000Z`);
    expect(straddling).toBeDefined();
    expect(straddling!.slots.every((slot) => slot >= 0 && slot < SLOTS_PER_DAY)).toBe(true);
    expect(straddling!.slots).toEqual([94, 95, 0, 1]);
    // getRequiredSlots splits the very same booking across two UTC days.
    const split = new Map([
      [NZ_UTC_DAY_BEFORE, [94, 95]],
      [NZ_DAY, [0, 1]],
    ]);
    expect(straddling!.slotsByDate).toEqual(split);
    expect(getRequiredSlots(Date.parse(straddling!.start), Date.parse(straddling!.start) + HOUR_MS)).toEqual(
      split
    );
    // …and the availability check honours both days: busy [0, 1] on 06-10 blocks
    // it, busy [0, 1] on 06-09 does not.
    expect(isCandidateAvailable(straddling!, new Map([[NZ_DAY, [0, 1]]]))).toBe(false);
    expect(isCandidateAvailable(straddling!, new Map([[NZ_UTC_DAY_BEFORE, [0, 1]]]))).toBe(true);
    expect(isCandidateAvailable(straddling!, new Map([[NZ_UTC_DAY_BEFORE, [95]]]))).toBe(false);
    expect(isCandidateAvailable(straddling!, new Map())).toBe(true);
  });
});

// ============================================
// Legacy generator (hardcoded 09:00–17:00 UTC)
// ============================================

describe("generateDaySlots (legacy business hours)", () => {
  test("the window is the hardcoded UTC 09:00–17:00 and the starts are always UTC on `date`", () => {
    expect([BUSINESS_HOURS_START, BUSINESS_HOURS_END]).toEqual([36, 68]);

    const hourly = generateDaySlots(TUESDAY, 60, 60);
    expect(startsOf(hourly)).toEqual(
      range(9, 17).map((hour) => `${TUESDAY}T${hh(hour)}:00:00.000Z`)
    );
    expect(hourly[0].slots).toEqual([36, 37, 38, 39]);
    expect(hourly[7].slots).toEqual([64, 65, 66, 67]);
    expect(startsOf(hourly).every((start) => start.startsWith(TUESDAY))).toBe(true);
  });

  test("the interval defaults to 15 minutes", () => {
    const quarterly = generateDaySlots(TUESDAY, 60);
    expect(quarterly).toHaveLength(29); // 09:00 … 16:00 every 15 minutes
    expect(quarterly[1].start).toBe(`${TUESDAY}T09:15:00.000Z`);
    expect(quarterly[28].start).toBe(`${TUESDAY}T16:00:00.000Z`);
  });

  test("events are rounded up and must fit inside the window", () => {
    const fullDay = generateDaySlots(TUESDAY, 480, 15);
    expect(fullDay).toHaveLength(1);
    expect(fullDay[0].slots).toEqual(range(36, 68));
    expect(generateDaySlots(TUESDAY, 495, 15)).toEqual([]); // 8h15 does not fit
    expect(generateDaySlots(TUESDAY, 50, 60)).toEqual(generateDaySlots(TUESDAY, 60, 60));
  });
});

// ============================================
// isDayAvailable
// ============================================

describe("isDayAvailable", () => {
  test("the legacy branch scans the hardcoded 09:00–17:00 UTC window", () => {
    expect(isDayAvailable(60, [])).toBe(true);
    expect(isDayAvailable(60, range(0, 36))).toBe(true); // busy before 09:00 is irrelevant
    expect(isDayAvailable(60, range(36, 68))).toBe(false); // window fully booked
    expect(isDayAvailable(60, range(36, 64), 15)).toBe(true); // 16:00–17:00 is still free
    expect(isDayAvailable(480, [67])).toBe(false); // the single 8-hour block is blocked
    expect(isDayAvailable(480, [68])).toBe(true); // 17:00 is outside the window
    expect(isDayAvailable(495, [])).toBe(false); // never fits
  });

  test("the interval decides which starts are even considered", () => {
    // On a 240-minute grid only 09:00 and 13:00 are candidates, and both are taken.
    expect(isDayAvailable(60, [36, 52], 240)).toBe(false);
    expect(isDayAvailable(60, [36, 52], 60)).toBe(true); // 10:00 works on an hourly grid
  });

  test("an explicit window is honoured, gaps between shifts included", () => {
    const split = [...slotWindow("08:00", "10:00"), ...slotWindow("14:00", "16:00")]; // 32…39, 56…63

    expect(isDayAvailable(120, [], 60, split)).toBe(true);
    expect(isDayAvailable(120, range(32, 40), 60, split)).toBe(true); // afternoon still free
    expect(isDayAvailable(120, [35, 60], 60, split)).toBe(false); // one blocker per shift
    // min…max spans 8 hours but no single shift can hold a 4-hour event.
    expect(isDayAvailable(240, [], 60, split)).toBe(false);
  });

  test("an EMPTY window falls through to the legacy business hours", () => {
    // `availableSlots && availableSlots.length > 0` reads [] as "no schedule",
    // which is exactly why getMonthAvailability guards `scheduleSlots.length === 0`
    // before it ever reaches this function.
    expect(isDayAvailable(60, [], 15, [])).toBe(true);
    expect(isDayAvailable(60, range(36, 68), 15, [])).toBe(false); // …legacy window, fully booked
  });

  test("it does NO timezone conversion — local window vs UTC busy slots reads free", () => {
    // Europe/Berlin 09:00–17:00 local is UTC slots 32…63 on 2027-03-09.
    const localWindow = slotWindow("09:00", "17:00"); // 36…67, wall clock
    const bookedAllDay = range(32, 64); // UTC — the whole shift is gone

    // Documented false positive (see the WARNING on isDayAvailable): slot 64…67
    // is inside the LOCAL window and free in UTC coordinates, so the day reads
    // as bookable.
    expect(isDayAvailable(60, bookedAllDay, 60, localWindow)).toBe(true);

    // The path getMonthAvailability/getDaySlots actually take gets it right.
    const candidates = generateDaySlotsWithTimezone(TUESDAY, 60, 60, localWindow, TZ);
    expect(candidates.some((c) => areSlotsAvailable(c.slots, bookedAllDay))).toBe(false);
  });

  test("a zero-length event is unguarded and always fits", () => {
    expect(isDayAvailable(0, range(0, SLOTS_PER_DAY))).toBe(true);
    expect(
      generateDaySlotsWithTimezone(TUESDAY, 0, 60, slotWindow("09:00", "10:00"), "UTC").map(
        (c) => c.slots
      )
    ).toEqual([[], []]);
  });

  // The step is clamped to >= 1 slot: intervalMinutes <= 0 (or NaN) would make
  // `step` 0 / negative / NaN and the candidate loops would never advance.
  test("a non-positive interval must not hang the generators", () => {
    const reference = generateDaySlotsWithTimezone(TUESDAY, 60, 15, slotWindow("09:00", "17:00"), "UTC");
    for (const interval of [0, -15, NaN]) {
      expect(generateDaySlotsWithTimezone(TUESDAY, 60, interval, slotWindow("09:00", "17:00"), "UTC")).toEqual(
        reference
      );
      expect(generateDaySlots(TUESDAY, 60, interval)).toEqual(generateDaySlots(TUESDAY, 60, 15));
      expect(isDayAvailable(60, [], interval)).toBe(true);
      expect(isDayAvailable(60, [36], interval, slotWindow("09:00", "17:00"))).toBe(true);
      expect(isDayAvailable(60, range(36, 68), interval)).toBe(false);
    }
  });
});

// ============================================
// areSlotsAvailable / getRequiredSlots
// ============================================

describe("areSlotsAvailable", () => {
  test("any overlap blocks, empty sets are free, adjacency is not overlap", () => {
    expect(areSlotsAvailable([], range(0, SLOTS_PER_DAY))).toBe(true); // nothing required
    expect(areSlotsAvailable([36, 37, 38, 39], [])).toBe(true);
    expect(areSlotsAvailable([36, 37, 38, 39], [36])).toBe(false); // first slot
    expect(areSlotsAvailable([36, 37, 38, 39], [39])).toBe(false); // last slot
    expect(areSlotsAvailable([36, 37, 38, 39], [38])).toBe(false); // middle slot
    expect(areSlotsAvailable([36, 37, 38, 39], [35, 40])).toBe(true); // touching, not overlapping
    // Out-of-range indices (see the UTC-midnight case above) can never match a
    // stored busySlots row, which is why they are dangerous rather than harmless.
    expect(areSlotsAvailable([94, 95, 96, 97], [0, 1])).toBe(true);
  });
});

describe("getRequiredSlots", () => {
  test("maps a range onto per-UTC-day slot indices", () => {
    const start = utc(TUESDAY, "09:00");
    expect(getRequiredSlots(start, start + HOUR_MS)).toEqual(new Map([[TUESDAY, [36, 37, 38, 39]]]));
    expect(getRequiredSlots(start, start + SLOT_DURATION_MS)).toEqual(new Map([[TUESDAY, [36]]]));
  });

  test("an empty or inverted range requires nothing", () => {
    const start = utc(TUESDAY, "09:00");
    expect(getRequiredSlots(start, start).size).toBe(0);
    expect(getRequiredSlots(start, start - HOUR_MS).size).toBe(0);
  });

  test("unaligned edges are widened to the containing slots", () => {
    // 14:05–14:50 occupies 14:00, 14:15, 14:30 and 14:45.
    expect(getRequiredSlots(utc(TUESDAY, "14:05"), utc(TUESDAY, "14:50")).get(TUESDAY)).toEqual([
      56, 57, 58, 59,
    ]);
    // A single minute still claims the whole containing slot.
    expect(getRequiredSlots(utc(TUESDAY, "14:05"), utc(TUESDAY, "14:06")).get(TUESDAY)).toEqual([56]);
    // The walk re-aligns to the grid instead of drifting by the initial offset.
    expect(getRequiredSlots(utc(TUESDAY, "09:01"), utc(TUESDAY, "10:00")).get(TUESDAY)).toEqual([
      36, 37, 38, 39,
    ]);
  });

  test("spans across UTC midnight are split per day", () => {
    expect(getRequiredSlots(utc(TUESDAY, "23:30"), utc("2027-03-10", "00:30"))).toEqual(
      new Map([
        [TUESDAY, [94, 95]],
        ["2027-03-10", [0, 1]],
      ])
    );

    const long = getRequiredSlots(utc(TUESDAY, "22:00"), utc("2027-03-11", "02:00"));
    expect([...long.keys()]).toEqual([TUESDAY, "2027-03-10", "2027-03-11"]);
    expect(long.get(TUESDAY)).toEqual(range(88, 96));
    expect(long.get("2027-03-10")).toEqual(range(0, SLOTS_PER_DAY)); // a full day
    expect(long.get("2027-03-11")).toEqual(range(0, 8));
  });

  test("the keys are UTC days, never the resource's local days", () => {
    // 09:00–10:00 Pacific/Auckland on 2026-06-10 is 21:00–22:00 UTC the day before.
    const start = zoned(NZ_DAY, "09:00", AUCKLAND);
    expect([...getRequiredSlots(start, start + HOUR_MS).keys()]).toEqual([NZ_UTC_DAY_BEFORE]);
  });
});

describe("slot index helpers", () => {
  test("time <-> slot conversions floor to the containing slot and round-trip", () => {
    expect(timeToSlotIndex("00:00")).toBe(0);
    expect(timeToSlotIndex("09:00")).toBe(BUSINESS_HOURS_START);
    expect(timeToSlotIndex("09:14")).toBe(36);
    expect(timeToSlotIndex("17:00")).toBe(BUSINESS_HOURS_END);
    expect(timeToSlotIndex("23:45")).toBe(95);
    expect(slotIndexToTime(0)).toBe("00:00");
    expect(slotIndexToTime(95)).toBe("23:45");
    for (const index of range(0, SLOTS_PER_DAY)) {
      expect(timeToSlotIndex(slotIndexToTime(index))).toBe(index);
    }
  });

  test("timestampToSlot / slotToTimestamp work in UTC", () => {
    expect(slotToTimestamp(TUESDAY, 36)).toBe(`${TUESDAY}T09:00:00.000Z`);
    expect(timestampToSlot(utc(TUESDAY, "09:07"))).toEqual({ date: TUESDAY, slot: 36 });
    expect(timestampToSlot(utc(TUESDAY, "00:00"))).toEqual({ date: TUESDAY, slot: 0 });
    expect(timestampToSlot(utc(TUESDAY, "23:59"))).toEqual({ date: TUESDAY, slot: 95 });
    // Berlin wall clock → UTC: 09:00 local on 2027-03-09 is slot 32, not 36.
    expect(timestampToSlot(wallClockToUTC(TUESDAY, "09:00", TZ))).toEqual({
      date: TUESDAY,
      slot: 32,
    });
  });
});
