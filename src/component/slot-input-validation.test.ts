/// <reference types="vite/client" />
/**
 * Structural input validation of the availability queries (F16, query side).
 *
 * Inputs without a meaning are rejected with an "Invalid …" error at every
 * entry point, before any early return; unpadded dates are read as the same
 * day. getAvailability stops at the first busy UTC date.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import {
  TUESDAY,
  berlin,
  book,
  getBusySlots,
  modules,
  range,
  seedFungibleResource,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

/** Every availability entry point that takes an event length, for one resource. */
function lengthEntryPoints(t: T, resourceId: string, scheduleId: string) {
  return {
    "getDaySlots (legacy)": (eventLength: number) =>
      t.query(api.public.getDaySlots, { resourceId, date: TUESDAY, eventLength }),
    "getDaySlots (schedule)": (eventLength: number) =>
      t.query(api.public.getDaySlots, {
        resourceId,
        date: TUESDAY,
        eventLength,
        resourceTimezone: "Europe/Berlin",
        availableSlots: range(36, 68),
      }),
    "getMonthAvailability (legacy)": (eventLength: number) =>
      t.query(api.public.getMonthAvailability, { resourceId, dateFrom: TUESDAY, dateTo: TUESDAY, eventLength }),
    "getMonthAvailability (schedule)": (eventLength: number) =>
      t.query(api.public.getMonthAvailability, {
        resourceId,
        dateFrom: TUESDAY,
        dateTo: TUESDAY,
        eventLength,
        resourceTimezone: "Europe/Berlin",
        scheduleId,
      }),
  };
}

describe("event length", () => {
  test.each([0, -15, -900, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "%s minutes is rejected at every entry point",
    async (eventLength) => {
      const { t } = setup();
      const seed = await seedResourceWithSchedule(t);
      for (const [name, query] of Object.entries(lengthEntryPoints(t, seed.resourceId, seed.scheduleId))) {
        await expect(query(eventLength), name).rejects.toThrow(
          `Invalid eventLength ${eventLength}: expected a positive number of minutes`
        );
        // CONTROL: 15 and 60 minutes are answered.
        await expect(query(15), name).resolves.toBeTruthy();
        await expect(query(60), name).resolves.toBeTruthy();
      }
    }
  );

  test("the check runs before the pooled-resource early return", async () => {
    const { t } = setup();
    const pool = await seedFungibleResource(t);
    for (const [name, query] of Object.entries(lengthEntryPoints(t, pool.resourceId, "sch-none"))) {
      await expect(query(0), name).rejects.toThrow("Invalid eventLength");
    }
    // CONTROL: a valid length still takes the early return.
    expect(await t.query(api.public.getDaySlots, { resourceId: pool.resourceId, date: TUESDAY, eventLength: 60 })).toEqual([]);
  });

  test("a negative length no longer escapes a booked window", async () => {
    const { t } = setup();
    // Tuesday-only 09:00–10:00 Berlin, and that hour is booked.
    const seed = await seedResourceWithSchedule(t, {
      weeklyHours: [{ dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }],
    });
    await book(t, seed, berlin(TUESDAY, "09:00"), berlin(TUESDAY, "10:00"));
    const args = { ...seed.daySlotsArgs, slotInterval: 15 };
    // CONTROL: the occupied window offers nothing for a real length.
    expect(await t.query(api.public.getDaySlots, { ...args, eventLength: 60 })).toEqual([]);
    expect(await t.query(api.public.getDaySlots, { ...args, eventLength: 15 })).toEqual([]);
    // Until 0.4.2 -900 offered 60 starts up to 23:45 local, the booked hour included.
    await expect(t.query(api.public.getDaySlots, { ...args, eventLength: -900 })).rejects.toThrow(
      "Invalid eventLength -900"
    );
  });

  test("a huge finite length fits nowhere and stays within the transaction limits", async () => {
    setup(); // fake timers and the frozen clock
    const t: T = convexTest({ schema, modules, transactionLimits: true });
    const seed = await seedResourceWithSchedule(t);
    for (const eventLength of [1e9, Number.MAX_VALUE]) {
      expect(await t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, eventLength })).toEqual([]);
      const month = await t.query(api.public.getMonthAvailability, {
        resourceId: seed.resourceId,
        dateFrom: "2027-03-01",
        dateTo: "2027-03-31",
        eventLength,
        resourceTimezone: seed.timezone,
        scheduleId: seed.scheduleId,
      });
      expect(Object.values(month)).toHaveLength(31);
      expect(Object.values(month).some(Boolean)).toBe(false);
    }
  });

  test("lengths are still rounded up to the 15-minute grid", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    const slots = (eventLength: number, slotInterval: number) =>
      t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, eventLength, slotInterval });
    expect(await slots(50, 60)).toEqual(await slots(60, 60));
    // Interval 20 steps by 30 minutes.
    expect(await slots(60, 20)).toEqual(await slots(60, 30));
    // A non-positive interval is clamped to one slot, not rejected.
    for (const interval of [0, -15, Number.NaN]) {
      expect(await slots(60, interval)).toEqual(await slots(60, 15));
    }
  });
});

describe("slot indices", () => {
  test.each([-1, 96, 36.5, Number.NaN])("availableSlots containing %s is rejected", async (index) => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await expect(
      t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, availableSlots: [36, index] })
    ).rejects.toThrow(`Invalid availableSlots index ${index}: expected integers from 0 to 95`);
    // CONTROL: the edges 0 and 95 and a plain window are accepted.
    await expect(t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, availableSlots: [0, 95] })).resolves.toEqual([]);
    expect(await t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, availableSlots: range(36, 40) })).toEqual([
      { time: "2027-03-09T08:00:00.000Z" },
    ]);
  });
});

describe("calendar dates", () => {
  const IMPOSSIBLE = ["2027-02-30", "2027-13-01", "garbage", ""];

  test.each(IMPOSSIBLE)("%j is rejected at every date entry point", async (date) => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    const message = `Invalid date "${date}"`;
    const month = { resourceId: seed.resourceId, eventLength: 60, resourceTimezone: seed.timezone, scheduleId: seed.scheduleId };
    await expect(t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, date })).rejects.toThrow(message);
    await expect(t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date, eventLength: 60 })).rejects.toThrow(message);
    await expect(t.query(api.public.getMonthAvailability, { ...month, dateFrom: date, dateTo: TUESDAY })).rejects.toThrow(message);
    await expect(t.query(api.public.getMonthAvailability, { ...month, dateFrom: TUESDAY, dateTo: date })).rejects.toThrow(message);
    await expect(t.query(api.schedules.getEffectiveAvailability, { scheduleId: seed.scheduleId, date })).rejects.toThrow(message);
    await expect(t.query(api.schedules.getDateOverride, { scheduleId: seed.scheduleDocId, date })).rejects.toThrow(message);
    await expect(t.query(api.schedules.listDateOverrides, { scheduleId: seed.scheduleDocId, dateFrom: date })).rejects.toThrow(message);
    await expect(t.query(api.schedules.listDateOverrides, { scheduleId: seed.scheduleDocId, dateTo: date })).rejects.toThrow(message);
    await expect(
      t.mutation(api.schedules.createDateOverride, { scheduleId: seed.scheduleDocId, date, type: "unavailable" })
    ).rejects.toThrow(message);
    // Nothing was stored.
    expect(await t.query(api.schedules.listDateOverrides, { scheduleId: seed.scheduleDocId })).toEqual([]);
  });

  test("'2027-02-30' no longer answers with March 2", async () => {
    const { t } = setup();
    await seedResource(t);
    // CONTROL: March 2 itself has the legacy window.
    expect(
      await t.query(api.public.getDaySlots, { resourceId: "res-1", date: "2027-03-02", eventLength: 60, slotInterval: 60 })
    ).toHaveLength(8);
    await expect(
      t.query(api.public.getDaySlots, { resourceId: "res-1", date: "2027-02-30", eventLength: 60, slotInterval: 60 })
    ).rejects.toThrow('Invalid date "2027-02-30"');
  });

  test("an inverted range is rejected; a single day is fine", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await expect(
      t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: "2027-03-10", dateTo: TUESDAY, eventLength: 60 })
    ).rejects.toThrow("Invalid date range: dateFrom 2027-03-10 is after dateTo 2027-03-09");
    await expect(
      t.query(api.schedules.listDateOverrides, { scheduleId: seed.scheduleDocId, dateFrom: "2027-03-10", dateTo: TUESDAY })
    ).rejects.toThrow("Invalid date range");
    // CONTROL
    expect(
      await t.query(api.public.getMonthAvailability, { resourceId: seed.resourceId, dateFrom: TUESDAY, dateTo: TUESDAY, eventLength: 60 })
    ).toEqual({ [TUESDAY]: true });
  });

  test("an unpadded date means the same day at every entry point", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    // Stored through the unpadded form; kept canonical.
    const overrideId = await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: "2027-3-10",
      type: "custom",
      customHours: [{ startTime: "13:00", endTime: "14:00" }],
    });
    const stored = await t.query(api.schedules.getDateOverride, { scheduleId: seed.scheduleDocId, date: "2027-03-10" });
    expect(stored?._id).toBe(overrideId);
    expect(stored?.date).toBe("2027-03-10");
    // Upserting through the padded form hits the same row.
    expect(
      await t.mutation(api.schedules.createDateOverride, {
        scheduleId: seed.scheduleDocId,
        date: "2027-03-10",
        type: "custom",
        customHours: [{ startTime: "13:00", endTime: "15:00" }],
      })
    ).toBe(overrideId);

    for (const [unpadded, padded] of [
      ["2027-3-9", "2027-03-09"],
      ["2027-3-10", "2027-03-10"],
    ]) {
      const same = async <R>(run: (date: string) => Promise<R>) => {
        const expected = await run(padded);
        expect(await run(unpadded)).toEqual(expected);
        return expected;
      };
      const effective = await same((date) =>
        t.query(api.schedules.getEffectiveAvailability, { scheduleId: seed.scheduleId, date })
      );
      expect(effective.availableSlots.length).toBeGreaterThan(0);
      const slots = await same((date) =>
        t.query(api.public.getDaySlots, { ...seed.daySlotsArgs, date, availableSlots: effective.availableSlots })
      );
      expect(slots.length).toBeGreaterThan(0);
      await same((date) => t.query(api.public.getDaySlots, { resourceId: seed.resourceId, date, eventLength: 60 }));
      const month = await same((date) =>
        t.query(api.public.getMonthAvailability, {
          resourceId: seed.resourceId,
          dateFrom: date,
          dateTo: date,
          eventLength: 60,
          resourceTimezone: seed.timezone,
          scheduleId: seed.scheduleId,
        })
      );
      expect(Object.keys(month)).toEqual([padded]); // keys are canonical
      await same((date) => t.query(api.schedules.getDateOverride, { scheduleId: seed.scheduleDocId, date }));
      await same((date) => t.query(api.schedules.listDateOverrides, { scheduleId: seed.scheduleDocId, dateFrom: date, dateTo: date }));
    }
    // The override applies: 13:00–15:00 Berlin on Wednesday.
    expect(await t.query(api.schedules.getEffectiveAvailability, { scheduleId: seed.scheduleId, date: "2027-3-10" })).toEqual({
      availableSlots: range(52, 60),
    });
  });
});

describe("getAvailability range", () => {
  test("a range whose first hour is busy returns false after two document reads, however long", async () => {
    setup();
    // documentsRead: 2 = the resource row and the first day's occupancy row.
    // The limit applies to every call, so the fixture is inserted directly.
    const t: T = convexTest({ schema, modules, transactionLimits: { documentsRead: 2 } });
    const resourceId = "res-1";
    const occupy = (date: string, busySlots: number[]) =>
      t.run(async (ctx) => {
        await ctx.db.insert("daily_availability", { resourceId, date, busySlots });
      });
    await t.run(async (ctx) => {
      await ctx.db.insert("resources", {
        id: resourceId,
        organizationId: "org-1",
        name: "Room",
        type: "room",
        timezone: "Europe/Berlin",
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      });
    });
    await occupy(TUESDAY, range(36, 40)); // 09:00–10:00Z busy
    const start = utc(TUESDAY, "09:00");
    // Until 0.4.2 the whole range's slot list was built before the first
    // read: about a second for 30 years, far beyond the test timeout for 1000.
    expect(await t.query(api.public.getAvailability, { resourceId, start, end: start + 1000 * YEAR_MS })).toBe(false);
    expect(await t.query(api.public.getAvailability, { resourceId, start, end: start + 30 * YEAR_MS })).toBe(false);
    // CONTROL: the hour after is free.
    expect(await t.query(api.public.getAvailability, { resourceId, start: start + 60 * 60 * 1000, end: start + 2 * 60 * 60 * 1000 })).toBe(true);

    // CONTROL: the limit is enforced — a free range across three stored
    // (empty) days reads four rows.
    for (const day of ["2027-03-10", "2027-03-11", "2027-03-12"]) await occupy(day, []);
    await expect(
      t.query(api.public.getAvailability, { resourceId, start: utc("2027-03-10", "09:00"), end: utc("2027-03-12", "10:00") })
    ).rejects.toThrow("Scanned too many documents");
    expect(
      await t.query(api.public.getAvailability, { resourceId, start: utc("2027-03-10", "09:00"), end: utc("2027-03-10", "10:00") })
    ).toBe(true);
  });

  test("a free range reads one day per UTC date: 4,095 dates fit Convex's index-range limit", async () => {
    setup();
    const t: T = convexTest({ schema, modules, transactionLimits: true });
    const seed = await seedResource(t);
    const start = utc("2027-01-01", "00:00");
    // One index range for the resource, one per UTC date.
    expect(await t.query(api.public.getAvailability, { resourceId: seed.resourceId, start, end: start + YEAR_MS })).toBe(true);
    expect(await t.query(api.public.getAvailability, { resourceId: seed.resourceId, start, end: start + 4095 * DAY_MS })).toBe(true);
    await expect(
      t.query(api.public.getAvailability, { resourceId: seed.resourceId, start, end: start + 4096 * DAY_MS })
    ).rejects.toThrow("Too many index ranges");
  }, 30_000);

  test("instants a Date cannot hold are an invalid range, and nothing is written", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const MAX = 8.64e15;
    const message = "Invalid time range: start and end must be representable dates";
    await expect(book(t, seed, MAX - 60 * 60 * 1000, MAX + 1)).rejects.toThrow(message);
    await expect(book(t, seed, -MAX - 1, -MAX + 60 * 60 * 1000)).rejects.toThrow(message);
    await expect(
      t.query(api.public.getAvailability, { resourceId: seed.resourceId, start: MAX - 1000, end: MAX + 1000 })
    ).rejects.toThrow(message);
    expect(await t.query(api.public.listBookings, {})).toEqual([]);
    // CONTROL: the last representable hour itself is a valid range.
    const last = await book(t, seed, MAX - 60 * 60 * 1000, MAX);
    expect(last.status).toBe("confirmed");
    expect(await getBusySlots(t, seed.resourceId, "+275760-09-12")).toEqual(range(92, 96));
  });
});
