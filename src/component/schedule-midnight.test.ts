/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  book,
  daySlotsArgs,
  getEffectiveSlots,
  listDaySlots,
  range,
  seedResourceWithSchedule,
  setup,
  zoned,
} from "./setup.test.js";

const MONDAY = "2027-03-08";
const TUESDAY = "2027-03-09";
const MIDNIGHT_WINDOWS = range(1, 6).flatMap((dayOfWeek) => [
  { dayOfWeek, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek, startTime: "22:00", endTime: "24:00" },
]);

describe("schedules ending at midnight", () => {
  test.each(["UTC", "Europe/Berlin"])(
    "%s: the last 23:30–00:00 booking is available without opening the gap",
    async (timezone) => {
      const { t } = setup();
      const seed = await seedResourceWithSchedule(t, {
        timezone,
        date: MONDAY,
        lengthInMinutes: 30,
        slotInterval: 30,
        weeklyHours: MIDNIGHT_WINDOWS,
      });
      expect(seed.availableSlots).toEqual([...range(36, 68), ...range(88, 96)]);

      const expectedStarts = [...range(18, 34), ...range(44, 48)].map(
        (halfHour) => {
          const time = `${String(Math.floor(halfHour / 2)).padStart(2, "0")}:${halfHour % 2 ? "30" : "00"}`;
          return new Date(zoned(MONDAY, time, timezone)).toISOString();
        },
      );
      expect(await listDaySlots(t, seed)).toEqual(expectedStarts);

      const start = zoned(MONDAY, "23:30", timezone);
      await book(t, seed, start, zoned(TUESDAY, "00:00", timezone));
      expect(await listDaySlots(t, seed)).toEqual(expectedStarts.slice(0, -1));
      expect(await getEffectiveSlots(t, seed.scheduleId, "2027-03-12")).toEqual(
        [...range(36, 68), ...range(88, 96)],
      );
      expect(await listDaySlots(t, seed, "2027-03-13")).toEqual([]);
    },
  );

  test("an existing weekly schedule can extend its end to 24:00", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, { date: MONDAY });
    await t.mutation(api.schedules.updateSchedule, {
      id: seed.scheduleId,
      weeklyHours: MIDNIGHT_WINDOWS,
    });
    expect(await getEffectiveSlots(t, seed.scheduleId, MONDAY)).toEqual([
      ...range(36, 68),
      ...range(88, 96),
    ]);
  });

  test("00:00–24:00 covers all 96 slots of its own day", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, {
      date: MONDAY,
      weeklyHours: [{ dayOfWeek: 1, startTime: "00:00", endTime: "24:00" }],
    });
    expect(seed.availableSlots).toEqual(range(0, 96));
    expect(await getEffectiveSlots(t, seed.scheduleId, TUESDAY)).toEqual([]);
  });

  test("date overrides can create and update midnight windows", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t, {
      date: MONDAY,
      lengthInMinutes: 15,
      slotInterval: 15,
    });
    const overrideId = await t.mutation(api.schedules.createDateOverride, {
      scheduleId: seed.scheduleDocId,
      date: MONDAY,
      type: "custom",
      customHours: [{ startTime: "23:30", endTime: "24:00" }],
    });
    const availableSlots = await getEffectiveSlots(t, seed.scheduleId, MONDAY);
    expect(availableSlots).toEqual([94, 95]);
    const slots = await t.query(
      api.public.getDaySlots,
      daySlotsArgs(seed, MONDAY, availableSlots),
    );
    expect(slots.map((slot) => slot.time)).toEqual(
      ["23:30", "23:45"].map((time) =>
        new Date(zoned(MONDAY, time, seed.timezone)).toISOString(),
      ),
    );

    await t.mutation(api.schedules.updateDateOverride, {
      overrideId,
      customHours: [{ startTime: "23:45", endTime: "24:00" }],
    });
    expect(await getEffectiveSlots(t, seed.scheduleId, MONDAY)).toEqual([95]);
    expect(await getEffectiveSlots(t, seed.scheduleId, TUESDAY)).toEqual(
      range(36, 68),
    );
  });
});

describe("midnight boundary validation", () => {
  test.each([
    { startTime: "24:00", endTime: "24:00", error: 'startTime "24:00"' },
    { startTime: "22:00", endTime: "24:15", error: 'endTime "24:15"' },
    { startTime: "23:45", endTime: "00:00", error: "must be before" },
  ])(
    "invalid $startTime–$endTime leaves weekly hours and overrides unchanged",
    async ({ startTime, endTime, error }) => {
      const { t } = setup();
      const seed = await seedResourceWithSchedule(t, {
        date: MONDAY,
        weeklyHours: MIDNIGHT_WINDOWS,
      });
      const customHours = [{ startTime, endTime }];
      const weeklyHours = [{ dayOfWeek: 1, startTime, endTime }];
      const baseline = seed.availableSlots;

      await expect(
        t.mutation(api.schedules.createSchedule, {
          id: "invalid-schedule",
          organizationId: seed.organizationId,
          name: "Invalid",
          timezone: seed.timezone,
          weeklyHours,
        }),
      ).rejects.toThrow(error);
      expect(
        await t.query(api.schedules.getSchedule, { id: "invalid-schedule" }),
      ).toBeNull();

      await expect(
        t.mutation(api.schedules.updateSchedule, {
          id: seed.scheduleId,
          weeklyHours,
        }),
      ).rejects.toThrow(error);
      expect(await getEffectiveSlots(t, seed.scheduleId, MONDAY)).toEqual(
        baseline,
      );

      await expect(
        t.mutation(api.schedules.createDateOverride, {
          scheduleId: seed.scheduleDocId,
          date: MONDAY,
          type: "custom",
          customHours,
        }),
      ).rejects.toThrow(error);
      expect(
        await t.query(api.schedules.listDateOverrides, {
          scheduleId: seed.scheduleDocId,
        }),
      ).toEqual([]);

      const overrideId = await t.mutation(api.schedules.createDateOverride, {
        scheduleId: seed.scheduleDocId,
        date: MONDAY,
        type: "custom",
        customHours: [{ startTime: "22:00", endTime: "24:00" }],
      });
      await expect(
        t.mutation(api.schedules.updateDateOverride, {
          overrideId,
          customHours,
        }),
      ).rejects.toThrow(error);
      expect(await getEffectiveSlots(t, seed.scheduleId, MONDAY)).toEqual(
        range(88, 96),
      );
    },
  );

  test("an end at 24:00 does not permit overlapping windows", async () => {
    const { t } = setup();
    await expect(
      seedResourceWithSchedule(t, {
        weeklyHours: [
          { dayOfWeek: 1, startTime: "23:00", endTime: "23:30" },
          { dayOfWeek: 1, startTime: "22:00", endTime: "24:00" },
        ],
      }),
    ).rejects.toThrow(
      "Overlapping weeklyHours (dayOfWeek 1) windows: 22:00–24:00 and 23:00–23:30",
    );
  });
});

describe("rows stored before window validation (0.3.0) that end past 24:00", () => {
  const WEDNESDAY = "2027-03-10";
  const EVENING = [{ dayOfWeek: 2, startTime: "20:00", endTime: "24:00" }];

  test("month and day views keep working and offer the starts inside the day", async () => {
    const { t } = setup();
    // CONTROL: the same hours ending at 24:00, stored through the API.
    const valid = await seedResourceWithSchedule(t, {
      scheduleId: "sch-valid",
      resourceId: "res-valid",
      eventTypeId: "et-valid",
      weeklyHours: EVENING,
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: valid.scheduleDocId,
      date: WEDNESDAY,
      type: "custom",
      customHours: [{ startTime: "22:00", endTime: "24:00" }],
    });
    // Legacy rows: a weekly window and an override ending at "25:00".
    const legacy = await seedResourceWithSchedule(t, {
      scheduleId: "sch-legacy",
      resourceId: "res-legacy",
      eventTypeId: "et-legacy",
      weeklyHours: EVENING,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(legacy.scheduleDocId, {
        weeklyHours: [{ dayOfWeek: 2, startTime: "20:00", endTime: "25:00" }],
      });
      await ctx.db.insert("date_overrides", {
        scheduleId: legacy.scheduleDocId,
        date: WEDNESDAY,
        type: "custom",
        customHours: [{ startTime: "22:00", endTime: "25:00" }],
      });
    });

    // The quarter hours past 24:00 are dropped.
    expect(await getEffectiveSlots(t, legacy.scheduleId, TUESDAY)).toEqual(range(80, 96));
    expect(await getEffectiveSlots(t, legacy.scheduleId, WEDNESDAY)).toEqual(range(88, 96));

    const views = async (seed: typeof valid) => {
      const month = await t.query(api.public.getMonthAvailability, {
        resourceId: seed.resourceId,
        dateFrom: TUESDAY,
        dateTo: "2027-03-11",
        eventLength: 60,
        slotInterval: 60,
        scheduleId: seed.scheduleId,
      });
      const days: Record<string, string[]> = {};
      for (const date of [TUESDAY, WEDNESDAY]) {
        const byId = await t.query(api.public.getDaySlots, {
          resourceId: seed.resourceId,
          date,
          eventLength: 60,
          slotInterval: 60,
          scheduleId: seed.scheduleId,
        });
        // The Booker's flow: effective hours, then the complete day query.
        const host = await t.query(
          api.public.getDaySlots,
          daySlotsArgs(seed, date, await getEffectiveSlots(t, seed.scheduleId, date)),
        );
        expect(byId, date).toEqual(host);
        days[date] = host.map((slot) => slot.time);
      }
      return { month, days };
    };

    const expected = await views(valid);
    expect(expected).toEqual({
      month: { [TUESDAY]: true, [WEDNESDAY]: true, "2027-03-11": false },
      days: {
        [TUESDAY]: ["20:00", "21:00", "22:00", "23:00"].map((time) =>
          new Date(zoned(TUESDAY, time, valid.timezone)).toISOString(),
        ),
        [WEDNESDAY]: ["22:00", "23:00"].map((time) =>
          new Date(zoned(WEDNESDAY, time, valid.timezone)).toISOString(),
        ),
      },
    });
    // Without the clamp, the 0–95 index check failed these reads with
    // "Invalid availableSlots index 96".
    expect(await views(legacy)).toEqual(expected);
  });
});
