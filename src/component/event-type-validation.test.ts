/// <reference types="vite/client" />
/**
 * Event-type writes validate their settings (F16 writes, D29(c); plan
 * PR-54 with Codex R5) and updateEventType clears optional settings with
 * null (N25, PR-59).
 *
 * - Lengths, length options and the slot interval are whole minutes greater
 *   than 0; buffers and notice are finite and 0 or more; the horizon is
 *   finite and greater than 0. Lengths are still rounded up to the 15-minute
 *   grid when slots are generated, so 20 stays valid.
 * - The length is one of the options when there are any. The rule is checked
 *   on the configuration a write leaves behind (given fields over stored
 *   ones), and only by writes that give the length or the options, so a row
 *   stored before 0.5.0 that breaks it can still change other settings.
 * - A rejected write changes nothing. Invalid stored rows are seeded with raw
 *   inserts, since the component's writes reject them now.
 */
import { describe, expect, test } from "vitest";
import type { WithoutSystemFields } from "convex/server";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { ORG, setup, type T } from "./setup.test.js";

type CreateArgs = (typeof api.public.createEventType)["_args"];

const BASE: CreateArgs = {
  id: "et-1",
  slug: "et-1",
  title: "Consultation",
  lengthInMinutes: 60,
  timezone: "Europe/Berlin",
  lockTimeZoneToggle: false,
  locations: [],
  organizationId: ORG,
};

const create = (t: T, extra: Partial<CreateArgs> = {}) => t.mutation(api.public.createEventType, { ...BASE, ...extra });
const update = (t: T, fields: Omit<(typeof api.public.updateEventType)["_args"], "id">) =>
  t.mutation(api.public.updateEventType, { id: BASE.id, ...fields });
const stored = (t: T) => t.run(async (ctx) => await ctx.db.query("event_types").collect());

/** The settings of the stored row, without system fields and timestamps. */
async function settings(t: T) {
  const [row] = await stored(t);
  const { _id, _creationTime, createdAt, updatedAt, ...rest } = row;
  void [_id, _creationTime, createdAt, updatedAt];
  return rest;
}

/** Stores an event type as a release before 0.5.0 could, past the write checks. */
async function insertLegacy(t: T, fields: Partial<WithoutSystemFields<Doc<"event_types">>>) {
  await t.run(async (ctx) => {
    const { organizationId: _org, ...base } = BASE;
    await ctx.db.insert("event_types", { ...base, organizationId: ORG, isActive: true, ...fields });
  });
}

const WHOLE = "expected a whole number of minutes greater than 0";

/** Invalid values per numeric setting, with the error each one gets. */
const INVALID: Array<[string, Partial<CreateArgs>, string]> = [
  ...[0, -15, 22.5, Number.NaN, Number.POSITIVE_INFINITY].map(
    (value): [string, Partial<CreateArgs>, string] => [
      `lengthInMinutes ${value}`,
      { lengthInMinutes: value },
      `Invalid lengthInMinutes ${value}: ${WHOLE}`,
    ]
  ),
  ...[0, 30.5, Number.NaN].map((value): [string, Partial<CreateArgs>, string] => [
    `lengthInMinutesOptions [60, ${value}]`,
    { lengthInMinutesOptions: [60, value] },
    `Invalid lengthInMinutesOptions entry ${value}: ${WHOLE}`,
  ]),
  ...[0, -15, 7.5, Number.NaN].map((value): [string, Partial<CreateArgs>, string] => [
    `slotInterval ${value}`,
    { slotInterval: value },
    `Invalid slotInterval ${value}: ${WHOLE}`,
  ]),
  ...(["bufferBefore", "bufferAfter", "minNoticeMinutes"] as const).flatMap((key) =>
    [-1, Number.NaN, Number.POSITIVE_INFINITY].map((value): [string, Partial<CreateArgs>, string] => [
      `${key} ${value}`,
      { [key]: value },
      `Invalid ${key} ${value}: expected a number of minutes of 0 or more`,
    ])
  ),
  ...[0, -1, Number.NaN, Number.POSITIVE_INFINITY].map((value): [string, Partial<CreateArgs>, string] => [
    `maxFutureMinutes ${value}`,
    { maxFutureMinutes: value },
    `Invalid maxFutureMinutes ${value}: expected a number of minutes greater than 0`,
  ]),
];

describe("numeric settings", () => {
  test.each(INVALID)("createEventType rejects %s and stores nothing", async (_name, fields, message) => {
    const { t } = setup();
    await expect(create(t, fields)).rejects.toThrow(message);
    expect(await stored(t)).toEqual([]);
  });

  test.each(INVALID)("updateEventType rejects %s and changes nothing", async (_name, fields, message) => {
    const { t } = setup();
    await create(t, { lengthInMinutesOptions: [60] });
    const before = await stored(t);
    await expect(update(t, fields)).rejects.toThrow(message);
    expect(await stored(t)).toEqual(before);
  });

  test("the boundaries of each rule round-trip unchanged", async () => {
    const { t } = setup();
    const valid: Partial<CreateArgs> = {
      lengthInMinutes: 20, // not a multiple of 15: still valid, rounded up to 30 for slots
      lengthInMinutesOptions: [20, 45, 1440, 2880], // multi-day lengths are allowed
      slotInterval: 1,
      bufferBefore: 0,
      bufferAfter: 2.5,
      minNoticeMinutes: 0,
      maxFutureMinutes: 0.5,
    };
    await create(t, valid);
    expect(await settings(t)).toEqual({ ...BASE, ...valid, isActive: true });
    await update(t, { lengthInMinutes: 2880, slotInterval: 15, bufferBefore: 1, maxFutureMinutes: 525_600 });
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 2880, slotInterval: 15, bufferBefore: 1, maxFutureMinutes: 525_600 });
  });
});

describe("the length is one of its options (D29(c))", () => {
  test("createEventType: a length outside non-empty options is rejected", async () => {
    const { t } = setup();
    // B2/B3: { 30, [60, 90] } offered durations the event type does not have.
    await expect(create(t, { lengthInMinutes: 30, lengthInMinutesOptions: [60, 90] })).rejects.toThrow(
      "Invalid lengthInMinutes 30: expected one of lengthInMinutesOptions (60, 90)"
    );
    expect(await stored(t)).toEqual([]);
    // CONTROLS: in the options, empty options, no options.
    for (const [id, lengthInMinutesOptions] of [["in", [30, 60]], ["empty", []], ["none", undefined]] as const) {
      await create(t, { id, slug: id, lengthInMinutes: 30, lengthInMinutesOptions: lengthInMinutesOptions && [...lengthInMinutesOptions] });
    }
    expect((await stored(t)).map((row) => row.id)).toEqual(["in", "empty", "none"]);
  });

  test("updateEventType checks the merged configuration (R5)", async () => {
    const { t } = setup();
    await create(t, { lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] });
    const rejects = (fields: Parameters<typeof update>[1], length: number, options: string) =>
      expect(update(t, fields)).rejects.toThrow(`Invalid lengthInMinutes ${length}: expected one of lengthInMinutesOptions (${options})`);

    // Length only: checked against the stored options.
    await rejects({ lengthInMinutes: 90 }, 90, "30, 60");
    // Options only: checked against the stored length.
    await rejects({ lengthInMinutesOptions: [60, 90] }, 30, "60, 90");
    // Both.
    await rejects({ lengthInMinutes: 45, lengthInMinutesOptions: [60, 90] }, 45, "60, 90");
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] });

    // CONTROLS: each shape with a result that keeps the rule.
    await update(t, { lengthInMinutes: 60 });
    await update(t, { lengthInMinutesOptions: [60, 90] });
    await update(t, { lengthInMinutes: 90, lengthInMinutesOptions: [90, 120] });
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 90, lengthInMinutesOptions: [90, 120] });
    await update(t, { lengthInMinutesOptions: [] });
    await update(t, { lengthInMinutes: 45 }); // no options: any length
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 45, lengthInMinutesOptions: [] });
  });

  test("a row stored before 0.5.0 that breaks the rules can still change other settings", async () => {
    const { t } = setup();
    await insertLegacy(t, { lengthInMinutes: 30, lengthInMinutesOptions: [60, 90], bufferBefore: -5, slotInterval: 0 });
    // Unrelated fields: accepted, the invalid stored values stay.
    await update(t, { title: "Renamed", bufferAfter: 10, requiresConfirmation: true });
    expect(await settings(t)).toMatchObject({
      title: "Renamed", bufferAfter: 10, lengthInMinutes: 30, lengthInMinutesOptions: [60, 90], bufferBefore: -5, slotInterval: 0,
    });
    // A change of the length or options must leave a valid pair.
    await expect(update(t, { lengthInMinutes: 45 })).rejects.toThrow("Invalid lengthInMinutes 45");
    await expect(update(t, { lengthInMinutesOptions: [45, 60] })).rejects.toThrow("Invalid lengthInMinutes 30");
    // Repairs: the length alone, then the other settings.
    await update(t, { lengthInMinutes: 60 });
    await update(t, { bufferBefore: 0, slotInterval: 15 });
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 60, lengthInMinutesOptions: [60, 90], bufferBefore: 0, slotInterval: 15 });
  });

  test("createEventType on an existing id checks the length against the options it keeps", async () => {
    const { t } = setup();
    await create(t, { lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] });
    // The upsert keeps the stored options when it omits them.
    await expect(create(t, { lengthInMinutes: 90 })).rejects.toThrow(
      "Invalid lengthInMinutes 90: expected one of lengthInMinutesOptions (30, 60)"
    );
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] });
    // CONTROLS: a kept option, and new options with the length.
    await create(t, { lengthInMinutes: 60 });
    await create(t, { lengthInMinutes: 90, lengthInMinutesOptions: [90] });
    expect(await settings(t)).toMatchObject({ lengthInMinutes: 90, lengthInMinutesOptions: [90] });
  });
});

describe("updateEventType: null clears a setting (N25)", () => {
  const CLEARABLE = ["description", "scheduleId", "bufferBefore", "bufferAfter", "minNoticeMinutes", "maxFutureMinutes"] as const;

  async function seedFull(t: T) {
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-1", organizationId: ORG, name: "Hours", timezone: "Europe/Berlin", weeklyHours: [],
    });
    await create(t, {
      description: "Talk", scheduleId: "sch-1", bufferBefore: 5, bufferAfter: 10, minNoticeMinutes: 60, maxFutureMinutes: 1440,
    });
  }

  test("null removes each of the six settings; the others stay", async () => {
    const { t } = setup();
    await seedFull(t);
    await update(t, {
      description: null, scheduleId: null, bufferBefore: null, bufferAfter: null, minNoticeMinutes: null, maxFutureMinutes: null,
    });
    const row = await settings(t);
    for (const key of CLEARABLE) expect(row, key).not.toHaveProperty(key);
    expect(row).toEqual({ ...BASE, isActive: true });
    expect(await t.query(api.public.getEventType, { eventTypeId: BASE.id })).not.toHaveProperty("scheduleId");
  });

  test.each(CLEARABLE)("null clears %s alone", async (key) => {
    const { t } = setup();
    await seedFull(t);
    const before = await settings(t);
    await update(t, { [key]: null });
    const { [key]: _cleared, ...rest } = before;
    expect(await settings(t)).toEqual(rest);
  });

  test("CONTROL: an omitted setting is unchanged", async () => {
    const { t } = setup();
    await seedFull(t);
    const before = await settings(t);
    await update(t, { title: "Renamed" });
    expect(await settings(t)).toEqual({ ...before, title: "Renamed" });
  });

  test("clearing scheduleId releases the schedule for deleteSchedule", async () => {
    const { t } = setup();
    await seedFull(t);
    await expect(t.mutation(api.schedules.deleteSchedule, { id: "sch-1" })).rejects.toThrow('Cannot delete schedule "sch-1"');
    await update(t, { scheduleId: null });
    await expect(t.mutation(api.schedules.deleteSchedule, { id: "sch-1" })).resolves.toEqual({ success: true });
  });

  test("null is only accepted where absence has a meaning", async () => {
    const { t } = setup();
    await seedFull(t);
    for (const key of ["title", "lengthInMinutes", "lengthInMinutesOptions", "slotInterval", "timezone", "isActive"]) {
      await expect(update(t, { [key]: null }), key).rejects.toThrow("Validator error");
    }
  });
});
