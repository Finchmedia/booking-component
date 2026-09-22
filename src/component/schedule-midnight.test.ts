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
