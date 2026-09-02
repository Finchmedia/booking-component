/// <reference types="vite/client" />
// Hardening #7 — time-window validation in src/component/schedules.ts.
//
// `timeToSlot("garbage")` yields NaN and a day silently reads as an empty
// window, so createSchedule / updateSchedule / createDateOverride /
// updateDateOverride validate at the component boundary
// (parseTimeStrict → assertNonOverlappingWindows → assertValidWeeklyHours /
// assertValidCustomHours). This file pins the guards, their exact error
// strings, the order in which they fire relative to the other checks in each
// mutation, and the fact that a rejected write leaves the database untouched.
//
// hardening.test.ts already covers one representative of each guard; here we
// go through every branch, both labels ("weeklyHours (dayOfWeek N)" and
// "customHours"), both fields (startTime and endTime) and both code paths
// (create and update / patch).
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { ORG, range, setup, type T, type WeeklyHours } from "./setup.test.js";

/** UTC schedules keep dayOfWeek arithmetic free of timezone shifts. */
const UTC_TZ = "UTC";
const MONDAY = 1;
/** 2027-03-08 is a Monday, 2027-03-09 a Tuesday. */
const MONDAY_DATE = "2027-03-08";

let t: T;
let seq = 0;

beforeEach(() => {
  ({ t } = setup());
  seq = 0;
});

// ============================================
// LOCAL HELPERS
// ============================================

/** `api.schedules.createSchedule` with a fresh external id; returns the document id. */
function createSchedule(
  weeklyHours: WeeklyHours,
  id = `sch-${++seq}`
): Promise<Id<"schedules">> {
  return t.mutation(api.schedules.createSchedule, {
    id,
    organizationId: ORG,
    name: `Schedule ${id}`,
    timezone: UTC_TZ,
    weeklyHours,
  });
}

/** A single Monday window — the shortest path into parseTimeStrict. */
const monday = (startTime: string, endTime: string): WeeklyHours => [
  { dayOfWeek: MONDAY, startTime, endTime },
];

/** Several windows on Monday. */
const mondays = (...windows: Array<[string, string]>): WeeklyHours =>
  windows.map(([startTime, endTime]) => ({ dayOfWeek: MONDAY, startTime, endTime }));

/** Awaits a rejection and returns its message (fails the test if it resolves). */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the mutation to reject, but it resolved");
}

/** Every schedule of the fixture org (to assert a rejected write persisted nothing). */
const listSchedules = () => t.query(api.schedules.listSchedules, { organizationId: ORG });

const getSchedule = (id: string) => t.query(api.schedules.getSchedule, { id });

const listOverrides = (scheduleId: Id<"schedules">) =>
  t.query(api.schedules.listDateOverrides, { scheduleId });

const effectiveSlots = async (scheduleId: string, date: string) =>
  (await t.query(api.schedules.getEffectiveAvailability, { scheduleId, date })).availableSlots;

/** Malformed "HH:MM" inputs: everything the TIME_RE `^([01]\d|2[0-3]):([0-5]\d)$` rejects. */
const MALFORMED_TIMES = [
  "garbage",
  "9:00", // hours not zero-padded
  "24:00", // hour out of range (the classic "end of day" spelling)
  "09:60", // minutes out of range — NOT the 15-minute-grid branch
  "", // empty string
  "0900", // separator missing
  "09:00:00", // seconds appended
  " 09:00", // leading whitespace
  "09:00 ", // trailing whitespace
  "9:0",
  "99:99",
  "09:AM",
  "-1:00",
];

// ============================================
// (a) MALFORMED TIME STRINGS
// ============================================

describe("createSchedule: malformed time strings", () => {
  test.each(MALFORMED_TIMES)('startTime "%s" is rejected', async (value) => {
    const message = await rejectionMessage(createSchedule(monday(value, "17:00")));
    expect(message).toContain(
      `Invalid weeklyHours (dayOfWeek 1) startTime "${value}": expected "HH:MM" between 00:00 and 23:59`
    );
    // A malformed string never reaches the grid check.
    expect(message).not.toContain("15-minute grid");
  });

  test.each(MALFORMED_TIMES)('endTime "%s" is rejected', async (value) => {
    const message = await rejectionMessage(createSchedule(monday("09:00", value)));
    expect(message).toContain(
      `Invalid weeklyHours (dayOfWeek 1) endTime "${value}": expected "HH:MM" between 00:00 and 23:59`
    );
    expect(message).not.toContain("15-minute grid");
  });

  test("a rejected createSchedule persists nothing", async () => {
    await expect(createSchedule(monday("garbage", "17:00"), "ghost")).rejects.toThrow(
      'expected "HH:MM"'
    );
    expect(await getSchedule("ghost")).toBeNull();
    expect(await listSchedules()).toEqual([]);
  });

  test("boundary times 00:00 and 23:45 are accepted", async () => {
    await createSchedule(monday("00:00", "23:45"), "edges");
    expect(await effectiveSlots("edges", MONDAY_DATE)).toEqual(range(0, 95));
  });

  test("the first malformed window wins over a later inverted one", async () => {
    // parseTimeStrict runs over every window before start >= end is checked,
    // so the malformed string in window #2 is reported first.
    const message = await rejectionMessage(
      createSchedule(mondays(["12:00", "09:00"], ["nope", "17:00"]))
    );
    expect(message).toContain('startTime "nope": expected "HH:MM"');
    expect(message).not.toContain("must be before");
  });
});

// ============================================
// (b) 15-MINUTE GRID
// ============================================

describe("createSchedule: 15-minute grid", () => {
  test.each(["09:01", "09:05", "09:10", "09:14", "09:16", "09:29", "09:59", "00:07"])(
    'startTime "%s" is off the grid',
    async (value) => {
      const message = await rejectionMessage(createSchedule(monday(value, "17:00")));
      expect(message).toContain(
        `Invalid weeklyHours (dayOfWeek 1) startTime "${value}": minutes must be on the 15-minute grid (00, 15, 30, 45)`
      );
      // A well-formed but off-grid string is not an "HH:MM" complaint.
      expect(message).not.toContain('expected "HH:MM"');
    }
  );

  test("an off-grid endTime is rejected as well", async () => {
    const message = await rejectionMessage(createSchedule(monday("09:00", "17:20")));
    expect(message).toContain(
      'Invalid weeklyHours (dayOfWeek 1) endTime "17:20": minutes must be on the 15-minute grid'
    );
  });

  test("all four grid minutes are accepted", async () => {
    await createSchedule(
      mondays(["09:00", "09:15"], ["09:15", "09:30"], ["09:30", "09:45"], ["09:45", "10:00"]),
      "grid"
    );
    expect(await effectiveSlots("grid", MONDAY_DATE)).toEqual([36, 37, 38, 39]);
  });
});

// ============================================
// (c) INVERTED / EMPTY WINDOWS
// ============================================

describe("createSchedule: startTime must be before endTime", () => {
  test.each([
    ["17:00", "09:00"], // fully inverted
    ["09:15", "09:00"], // inverted by one slot
    ["09:00", "09:00"], // zero-length window
    ["23:45", "00:00"], // no wrap-around across midnight
  ])('"%s"–"%s" is rejected', async (startTime, endTime) => {
    const message = await rejectionMessage(createSchedule(monday(startTime, endTime)));
    expect(message).toContain(
      `Invalid weeklyHours (dayOfWeek 1) window: startTime "${startTime}" must be before endTime "${endTime}"`
    );
  });

  test("the shortest legal window is one slot", async () => {
    await createSchedule(monday("09:00", "09:15"), "one-slot");
    expect(await effectiveSlots("one-slot", MONDAY_DATE)).toEqual([36]);
  });
});

// ============================================
// (d) OVERLAPPING VS. ADJACENT WINDOWS
// ============================================

describe("createSchedule: overlapping windows per day", () => {
  test("a partial overlap names both windows in sorted order", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "12:00"], ["11:00", "14:00"]))
    );
    expect(message).toContain(
      "Overlapping weeklyHours (dayOfWeek 1) windows: 09:00–12:00 and 11:00–14:00"
    );
  });

  test("input order does not change the reported pair", async () => {
    // Windows are sorted by start before the scan, so the earlier one is `a`.
    const message = await rejectionMessage(
      createSchedule(mondays(["11:00", "14:00"], ["09:00", "12:00"]))
    );
    expect(message).toContain(
      "Overlapping weeklyHours (dayOfWeek 1) windows: 09:00–12:00 and 11:00–14:00"
    );
  });

  test("a contained window is an overlap", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "17:00"], ["10:00", "11:00"]))
    );
    expect(message).toContain(
      "Overlapping weeklyHours (dayOfWeek 1) windows: 09:00–17:00 and 10:00–11:00"
    );
  });

  test("an exact duplicate window is an overlap", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "12:00"], ["09:00", "12:00"]))
    );
    expect(message).toContain("Overlapping weeklyHours (dayOfWeek 1) windows:");
  });

  test("windows sharing a start but not an end overlap", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "10:00"], ["09:00", "12:00"]))
    );
    expect(message).toContain("Overlapping weeklyHours (dayOfWeek 1) windows:");
  });

  test("a non-adjacent overlap among three windows is caught", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "10:00"], ["14:00", "15:00"], ["09:30", "11:00"]))
    );
    expect(message).toContain(
      "Overlapping weeklyHours (dayOfWeek 1) windows: 09:00–10:00 and 09:30–11:00"
    );
  });

  test("a long window swallowing two later ones is caught", async () => {
    const message = await rejectionMessage(
      createSchedule(mondays(["09:00", "18:00"], ["10:00", "11:00"], ["12:00", "13:00"]))
    );
    expect(message).toContain("Overlapping weeklyHours (dayOfWeek 1) windows:");
  });

  test("adjacent windows sharing a boundary are accepted and merge into one range", async () => {
    await createSchedule(mondays(["09:00", "12:00"], ["12:00", "17:00"]), "adjacent-pair");
    // 09:00–12:00 → slots 36..47, 12:00–17:00 → slots 48..67: contiguous, sorted, no duplicates.
    expect(await effectiveSlots("adjacent-pair", MONDAY_DATE)).toEqual(range(36, 68));
  });

  test("three adjacent windows are accepted", async () => {
    await createSchedule(
      mondays(["08:00", "12:00"], ["12:00", "13:00"], ["13:00", "17:00"]),
      "adjacent-three"
    );
    expect(await effectiveSlots("adjacent-three", MONDAY_DATE)).toEqual(range(32, 68));
  });

  test("overlap is scoped per day: the same window on two days is fine", async () => {
    await createSchedule(
      [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 2, startTime: "18:00", endTime: "20:00" },
      ],
      "per-day"
    );
    expect(await effectiveSlots("per-day", MONDAY_DATE)).toEqual(range(36, 68));
    expect(await effectiveSlots("per-day", "2027-03-09")).toEqual([
      ...range(36, 68),
      ...range(72, 80),
    ]);
  });

  test("an overlap on the second day is still caught", async () => {
    const message = await rejectionMessage(
      createSchedule([
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 4, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 4, startTime: "10:00", endTime: "13:00" },
      ])
    );
    expect(message).toContain("Overlapping weeklyHours (dayOfWeek 4) windows:");
  });
});

// ============================================
// (e) dayOfWeek RANGE
// ============================================

describe("createSchedule: dayOfWeek", () => {
  test.each([-1, 7, 1.5, -0.5, 6.5, 12, 100])("dayOfWeek %s is rejected", async (dayOfWeek) => {
    const message = await rejectionMessage(
      createSchedule([{ dayOfWeek, startTime: "09:00", endTime: "17:00" }])
    );
    expect(message).toContain(
      `Invalid weeklyHours dayOfWeek ${dayOfWeek}: expected an integer between 0 (Sunday) and 6 (Saturday)`
    );
  });

  test("0 (Sunday) and 6 (Saturday) are accepted", async () => {
    await createSchedule(
      [
        { dayOfWeek: 0, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 6, startTime: "10:00", endTime: "12:00" },
      ],
      "weekend"
    );
    expect(await effectiveSlots("weekend", "2027-03-14")).toEqual(range(36, 68)); // Sunday
    expect(await effectiveSlots("weekend", "2027-03-13")).toEqual(range(40, 48)); // Saturday
    expect(await effectiveSlots("weekend", MONDAY_DATE)).toEqual([]); // no entry
  });

  test("dayOfWeek is checked before the window strings", async () => {
    const message = await rejectionMessage(
      createSchedule([{ dayOfWeek: 9, startTime: "garbage", endTime: "" }])
    );
    expect(message).toContain("Invalid weeklyHours dayOfWeek 9:");
    expect(message).not.toContain('expected "HH:MM"');
  });
});

// ============================================
// createSchedule: guard ordering vs. the other checks
// ============================================

describe("createSchedule: validation runs before the id and default handling", () => {
  test("an invalid duplicate reports the window, not the duplicate id", async () => {
    await createSchedule(monday("09:00", "17:00"), "dup");
    const message = await rejectionMessage(createSchedule(monday("09:10", "17:00"), "dup"));
    expect(message).toContain("15-minute grid");
    expect(message).not.toContain("already exists");
    // The stored schedule is untouched.
    expect((await getSchedule("dup"))?.weeklyHours).toEqual(monday("09:00", "17:00"));
  });

  test("a rejected isDefault schedule does not steal the existing default", async () => {
    await t.mutation(api.schedules.createSchedule, {
      id: "default-a",
      organizationId: ORG,
      name: "A",
      timezone: UTC_TZ,
      isDefault: true,
      weeklyHours: monday("09:00", "17:00"),
    });
    await expect(
      t.mutation(api.schedules.createSchedule, {
        id: "default-b",
        organizationId: ORG,
        name: "B",
        timezone: UTC_TZ,
        isDefault: true,
        weeklyHours: monday("17:00", "09:00"),
      })
    ).rejects.toThrow("must be before");

    expect(await getSchedule("default-b")).toBeNull();
    expect((await getSchedule("default-a"))?.isDefault).toBe(true);
    expect(
      (await t.query(api.schedules.getDefaultSchedule, { organizationId: ORG }))?.id
    ).toBe("default-a");
  });
});

// ============================================
// (f) updateSchedule: only the fields in the patch are validated
// ============================================

describe("updateSchedule: patch validation", () => {
  test("a patch without weeklyHours never validates the stored (odd) data", async () => {
    const docId = await createSchedule(monday("09:00", "17:00"), "legacy");
    // Simulate a row written before hardening #7 existed: schema-valid, semantically odd.
    await t.run(async (ctx) => {
      await ctx.db.patch(docId, {
        weeklyHours: [
          { dayOfWeek: 9, startTime: "garbage", endTime: "" },
          { dayOfWeek: 9, startTime: "25:99", endTime: "17:10" },
          { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
          { dayOfWeek: 1, startTime: "10:00", endTime: "14:00" },
        ],
      });
    });

    // name / timezone / isDefault patches all go through untouched.
    await t.mutation(api.schedules.updateSchedule, { id: "legacy", name: "renamed" });
    await t.mutation(api.schedules.updateSchedule, { id: "legacy", timezone: "America/New_York" });
    await t.mutation(api.schedules.updateSchedule, { id: "legacy", isDefault: true });

    const stored = await getSchedule("legacy");
    expect(stored?.name).toBe("renamed");
    expect(stored?.timezone).toBe("America/New_York");
    expect(stored?.isDefault).toBe(true);
    // The odd weeklyHours survive verbatim — the guard is a write guard, not a repair.
    expect(stored?.weeklyHours).toHaveLength(4);
    expect(stored?.weeklyHours[0]).toEqual({
      dayOfWeek: 9,
      startTime: "garbage",
      endTime: "",
    });

    // Touching weeklyHours at all re-validates the WHOLE patch.
    await expect(
      t.mutation(api.schedules.updateSchedule, {
        id: "legacy",
        weeklyHours: mondays(["09:00", "12:00"], ["11:00", "13:00"]),
      })
    ).rejects.toThrow("Overlapping");
  });

  test.each([
    ["off-grid", monday("09:10", "17:00"), "15-minute grid"],
    ["malformed", monday("24:00", "17:00"), 'expected "HH:MM"'],
    ["inverted", monday("17:00", "09:00"), "must be before"],
    ["bad dayOfWeek", [{ dayOfWeek: -1, startTime: "09:00", endTime: "17:00" }], "dayOfWeek"],
    ["overlapping", mondays(["09:00", "12:00"], ["11:00", "13:00"]), "Overlapping"],
  ] as Array<[string, WeeklyHours, string]>)(
    "a %s weeklyHours patch is rejected and rolls back",
    async (_label, weeklyHours, needle) => {
      await createSchedule(monday("09:00", "17:00"), "patched");
      await expect(
        t.mutation(api.schedules.updateSchedule, { id: "patched", weeklyHours, name: "new name" })
      ).rejects.toThrow(needle);

      const stored = await getSchedule("patched");
      expect(stored?.weeklyHours).toEqual(monday("09:00", "17:00"));
      expect(stored?.name).toBe("Schedule patched");
    }
  );

  test("weeklyHours is validated before the schedule is looked up", async () => {
    // An invalid patch for a schedule that does not exist reports the window,
    // not the missing schedule.
    const invalid = await rejectionMessage(
      t.mutation(api.schedules.updateSchedule, {
        id: "nope",
        weeklyHours: monday("09:10", "17:00"),
      })
    );
    expect(invalid).toContain("15-minute grid");
    expect(invalid).not.toContain("not found");

    const missing = await rejectionMessage(
      t.mutation(api.schedules.updateSchedule, {
        id: "nope",
        weeklyHours: monday("09:00", "17:00"),
      })
    );
    expect(missing).toContain('Schedule "nope" not found');
  });

  test("an empty weeklyHours array is a value, not an absent field", async () => {
    await createSchedule(monday("09:00", "17:00"), "cleared");
    expect(await effectiveSlots("cleared", MONDAY_DATE)).toEqual(range(36, 68));

    await t.mutation(api.schedules.updateSchedule, { id: "cleared", weeklyHours: [] });
    expect((await getSchedule("cleared"))?.weeklyHours).toEqual([]);
    expect(await effectiveSlots("cleared", MONDAY_DATE)).toEqual([]);
  });

  test("a valid weeklyHours patch replaces the stored windows", async () => {
    await createSchedule(monday("09:00", "17:00"), "replaced");
    await t.mutation(api.schedules.updateSchedule, {
      id: "replaced",
      weeklyHours: mondays(["08:00", "12:00"], ["12:00", "16:00"]),
    });
    expect((await getSchedule("replaced"))?.weeklyHours).toEqual(
      mondays(["08:00", "12:00"], ["12:00", "16:00"])
    );
    expect(await effectiveSlots("replaced", MONDAY_DATE)).toEqual(range(32, 64));
  });
});

// ============================================
// DATE OVERRIDES: customHours
// ============================================

describe("createDateOverride: customHours validation", () => {
  let scheduleId: Id<"schedules">;

  beforeEach(async () => {
    scheduleId = await createSchedule(monday("09:00", "17:00"), "ovr");
  });

  test.each(["garbage", "9:00", "24:00", "09:60", ""])(
    'a malformed startTime "%s" is rejected with the customHours label',
    async (value) => {
      const message = await rejectionMessage(
        t.mutation(api.schedules.createDateOverride, {
          scheduleId,
          date: MONDAY_DATE,
          type: "custom",
          customHours: [{ startTime: value, endTime: "17:00" }],
        })
      );
      expect(message).toContain(
        `Invalid customHours startTime "${value}": expected "HH:MM" between 00:00 and 23:59`
      );
      expect(await listOverrides(scheduleId)).toEqual([]);
    }
  );

  test("an off-grid customHours endTime is rejected", async () => {
    const message = await rejectionMessage(
      t.mutation(api.schedules.createDateOverride, {
        scheduleId,
        date: MONDAY_DATE,
        type: "custom",
        customHours: [{ startTime: "09:00", endTime: "16:45" }, { startTime: "17:00", endTime: "18:10" }],
      })
    );
    expect(message).toContain(
      'Invalid customHours endTime "18:10": minutes must be on the 15-minute grid (00, 15, 30, 45)'
    );
  });

  test("a zero-length customHours window is rejected", async () => {
    const message = await rejectionMessage(
      t.mutation(api.schedules.createDateOverride, {
        scheduleId,
        date: MONDAY_DATE,
        type: "custom",
        customHours: [{ startTime: "12:00", endTime: "12:00" }],
      })
    );
    expect(message).toContain(
      'Invalid customHours window: startTime "12:00" must be before endTime "12:00"'
    );
  });

  test("overlapping customHours name both windows", async () => {
    const message = await rejectionMessage(
      t.mutation(api.schedules.createDateOverride, {
        scheduleId,
        date: MONDAY_DATE,
        type: "custom",
        customHours: [
          { startTime: "13:00", endTime: "15:00" },
          { startTime: "09:00", endTime: "14:00" },
        ],
      })
    );
    expect(message).toContain(
      "Overlapping customHours windows: 09:00–14:00 and 13:00–15:00"
    );
  });

  test("adjacent customHours are accepted and drive availability", async () => {
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: MONDAY_DATE,
      type: "custom",
      customHours: [
        { startTime: "10:00", endTime: "11:00" },
        { startTime: "11:00", endTime: "12:00" },
      ],
    });
    expect(await effectiveSlots("ovr", MONDAY_DATE)).toEqual(range(40, 48));
  });

  test("customHours is optional and an empty array is validated vacuously", async () => {
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: MONDAY_DATE,
      type: "custom",
      customHours: [],
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: "2027-03-09",
      type: "unavailable",
    });

    const overrides = await listOverrides(scheduleId);
    expect(overrides.map((o) => [o.date, o.type, o.customHours])).toEqual([
      [MONDAY_DATE, "custom", []],
      ["2027-03-09", "unavailable", undefined],
    ]);
    // An empty customHours list is accepted and falls through to the weekly
    // hours (Monday 09:00–17:00); "unavailable" needs no customHours at all.
    expect(await effectiveSlots("ovr", MONDAY_DATE)).toEqual(range(36, 68));
    expect(await effectiveSlots("ovr", "2027-03-09")).toEqual([]);
  });

  test("the upsert path validates before patching an existing override", async () => {
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: MONDAY_DATE,
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });

    await expect(
      t.mutation(api.schedules.createDateOverride, {
        scheduleId,
        date: MONDAY_DATE,
        type: "unavailable",
        customHours: [{ startTime: "10:00", endTime: "09:00" }],
      })
    ).rejects.toThrow("must be before");

    const overrides = await listOverrides(scheduleId);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });
  });
});

describe("updateDateOverride: customHours validation", () => {
  let scheduleId: Id<"schedules">;
  let overrideId: Id<"date_overrides">;

  beforeEach(async () => {
    scheduleId = await createSchedule(monday("09:00", "17:00"), "ovr");
    overrideId = await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: MONDAY_DATE,
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });
  });

  test.each([
    ["malformed", [{ startTime: "9:00", endTime: "12:00" }], 'expected "HH:MM"'],
    ["off-grid", [{ startTime: "10:05", endTime: "12:00" }], "15-minute grid"],
    ["inverted", [{ startTime: "12:00", endTime: "10:00" }], "must be before"],
    [
      "overlapping",
      [
        { startTime: "10:00", endTime: "12:00" },
        { startTime: "11:45", endTime: "13:00" },
      ],
      "Overlapping",
    ],
  ] as Array<[string, Array<{ startTime: string; endTime: string }>, string]>)(
    "a %s customHours patch is rejected and rolls back",
    async (_label, customHours, needle) => {
      const message = await rejectionMessage(
        t.mutation(api.schedules.updateDateOverride, {
          overrideId,
          type: "unavailable",
          customHours,
        })
      );
      expect(message).toContain(needle);
      expect(message).toContain("customHours");

      const overrides = await listOverrides(scheduleId);
      expect(overrides[0]).toMatchObject({
        type: "custom",
        customHours: [{ startTime: "10:00", endTime: "12:00" }],
      });
    }
  );

  test("a type-only patch does not touch or validate the stored customHours", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch(overrideId, {
        customHours: [
          { startTime: "garbage", endTime: "12:00" },
          { startTime: "09:00", endTime: "23:99" },
        ],
      });
    });

    await t.mutation(api.schedules.updateDateOverride, { overrideId, type: "unavailable" });

    const overrides = await listOverrides(scheduleId);
    expect(overrides[0].type).toBe("unavailable");
    expect(overrides[0].customHours).toEqual([
      { startTime: "garbage", endTime: "12:00" },
      { startTime: "09:00", endTime: "23:99" },
    ]);
  });

  test("customHours is validated before the override is looked up", async () => {
    await t.mutation(api.schedules.deleteDateOverride, { overrideId });

    const invalid = await rejectionMessage(
      t.mutation(api.schedules.updateDateOverride, {
        overrideId,
        customHours: [{ startTime: "10:07", endTime: "12:00" }],
      })
    );
    expect(invalid).toContain("15-minute grid");
    expect(invalid).not.toContain("not found");

    const missing = await rejectionMessage(
      t.mutation(api.schedules.updateDateOverride, {
        overrideId,
        customHours: [{ startTime: "10:00", endTime: "12:00" }],
      })
    );
    expect(missing).toContain("Date override not found");
  });

  test("a valid customHours patch replaces the window", async () => {
    await t.mutation(api.schedules.updateDateOverride, {
      overrideId,
      customHours: [
        { startTime: "08:00", endTime: "09:00" },
        { startTime: "09:00", endTime: "10:00" },
      ],
    });
    expect(await effectiveSlots("ovr", MONDAY_DATE)).toEqual(range(32, 40));
  });
});

// ============================================
// (g) VALID INPUT ROUND-TRIPS
// ============================================

describe("valid input round-trips", () => {
  test("getSchedule returns the windows exactly as written", async () => {
    const weeklyHours: WeeklyHours = [
      { dayOfWeek: 3, startTime: "13:00", endTime: "17:30" },
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "12:00", endTime: "17:00" },
      { dayOfWeek: 0, startTime: "00:00", endTime: "00:15" },
    ];
    const docId = await createSchedule(weeklyHours, "round-trip");

    const stored = await getSchedule("round-trip");
    expect(stored?._id).toBe(docId);
    expect(stored).toMatchObject({
      id: "round-trip",
      organizationId: ORG,
      name: "Schedule round-trip",
      timezone: UTC_TZ,
      isDefault: false,
      weeklyHours, // order preserved, nothing normalised or merged
    });
    expect(await t.query(api.schedules.getScheduleById, { scheduleId: docId })).toMatchObject({
      id: "round-trip",
    });
  });

  test("listDateOverrides returns the accepted overrides sorted by date", async () => {
    const scheduleId = await createSchedule(monday("09:00", "17:00"), "ovr-list");

    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: "2027-03-15",
      type: "custom",
      customHours: [
        { startTime: "09:00", endTime: "10:00" },
        { startTime: "10:00", endTime: "11:15" },
      ],
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: MONDAY_DATE,
      type: "unavailable",
    });

    const overrides = await listOverrides(scheduleId);
    expect(overrides.map((o) => o.date)).toEqual([MONDAY_DATE, "2027-03-15"]);
    expect(overrides[1].customHours).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "10:00", endTime: "11:15" },
    ]);

    expect(
      await t.query(api.schedules.getDateOverride, { scheduleId, date: "2027-03-15" })
    ).toMatchObject({ type: "custom" });
    expect(
      await t.query(api.schedules.listDateOverrides, {
        scheduleId,
        dateFrom: "2027-03-09",
        dateTo: "2027-03-20",
      })
    ).toHaveLength(1);

    // 09:00–10:00 + 10:00–11:15 → slots 36..44 on the overridden Monday-of-next-week.
    expect(await effectiveSlots("ovr-list", "2027-03-15")).toEqual(range(36, 45));
    expect(await effectiveSlots("ovr-list", MONDAY_DATE)).toEqual([]);
  });
});
