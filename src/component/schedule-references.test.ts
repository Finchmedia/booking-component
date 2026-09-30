/**
 * N15 (plan PR-53, decision D8): schedule references stay valid.
 *
 * - createEventType / updateEventType reject a scheduleId that names no
 *   schedule (SCHEDULE_NOT_FOUND); "" still means no schedule.
 * - deleteSchedule refuses while an event type references the schedule
 *   (SCHEDULE_IN_USE), through the event_types by_scheduleId index, since
 *   event types may have no organization.
 * - The availability reads and getEffectiveAvailability reject an unknown
 *   scheduleId instead of serving 09:00–17:00 every day (pinned in
 *   schedule-arguments.test.ts).
 *
 * Converted from the verification probes gb/zz-cv-gb-n4-dangling-schedule
 * and gb-skeptic/zz-cv-gbs-c4-schedule-refs, which pinned the fail-open
 * 0.4.x behaviour.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { ORG, TUESDAY, TZ, getEffectiveSlots, seedResourceWithSchedule, setup } from "./setup.test.js";

const SUNDAY = "2027-03-07"; // WEEKDAYS_9_TO_17 has no Sunday entry

const eventType = (id: string, over: Record<string, unknown> = {}) => ({
  id, slug: id, title: id, lengthInMinutes: 60, timezone: TZ, lockTimeZoneToggle: false, locations: [],
  organizationId: ORG, ...over,
});

describe("event-type writes name existing schedules", () => {
  test("createEventType and updateEventType reject an unknown scheduleId and write nothing", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    const unknown = (id: string) => ({ data: { code: "SCHEDULE_NOT_FOUND", message: `Schedule "${id}" not found` } });

    await expect(t.mutation(api.public.updateEventType, { id: seed.eventTypeId, scheduleId: "sch-typo", title: "x" }))
      .rejects.toMatchObject(unknown("sch-typo"));
    expect(await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId })).toMatchObject({
      scheduleId: seed.scheduleId, title: "Consultation",
    });
    await expect(t.mutation(api.public.createEventType, eventType("et-2", { scheduleId: "never-created" })))
      .rejects.toMatchObject(unknown("never-created"));
    expect(await t.query(api.public.getEventType, { eventTypeId: "et-2" })).toBeNull();
    // An upsert of an existing id is checked too.
    await expect(t.mutation(api.public.createEventType, eventType(seed.eventTypeId, { scheduleId: "sch-typo" })))
      .rejects.toMatchObject(unknown("sch-typo"));
  });

  test("existing schedules, \"\" and an omitted scheduleId are accepted (controls)", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-2", organizationId: ORG, name: "Two", timezone: TZ, weeklyHours: [],
    });
    await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, scheduleId: "sch-2" });
    await t.mutation(api.public.createEventType, eventType("et-2", { scheduleId: "" }));
    await t.mutation(api.public.createEventType, eventType("et-3"));
    const read = async (id: string) => (await t.query(api.public.getEventType, { eventTypeId: id }))?.scheduleId;
    expect([await read(seed.eventTypeId), await read("et-2"), await read("et-3")]).toEqual(["sch-2", "", undefined]);
  });
});

describe("deleteSchedule while event types use the schedule", () => {
  test("is refused and keeps the schedule, its overrides and the closed days", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t); // sch-1, Mon–Fri 09–17 Europe/Berlin, et-1 -> sch-1
    await t.mutation(api.schedules.createDateOverride, { scheduleId: seed.scheduleDocId, date: TUESDAY, type: "unavailable" });
    const month = () =>
      t.query(api.public.getMonthAvailability, {
        resourceId: seed.resourceId, dateFrom: SUNDAY, dateTo: TUESDAY, eventLength: 60, slotInterval: 60,
        scheduleId: seed.scheduleId,
      });
    expect(await month()).toEqual({ [SUNDAY]: false, "2027-03-08": true, [TUESDAY]: false });

    await expect(t.mutation(api.schedules.deleteSchedule, { id: seed.scheduleId })).rejects.toMatchObject({
      data: {
        code: "SCHEDULE_IN_USE",
        message: 'Cannot delete schedule "sch-1": event type "et-1" uses it. Give its event types another schedule first.',
      },
    });
    expect(await t.query(api.schedules.getSchedule, { id: seed.scheduleId })).not.toBeNull();
    expect(await getEffectiveSlots(t, seed.scheduleId, TUESDAY)).toEqual([]); // the override survived
    expect(await month()).toEqual({ [SUNDAY]: false, "2027-03-08": true, [TUESDAY]: false });
  });

  test("an inactive or organization-less event type counts; after moving them the delete succeeds", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await t.mutation(api.public.createEventType, eventType("et-global", { organizationId: undefined, scheduleId: seed.scheduleId }));
    await t.mutation(api.public.toggleEventTypeActive, { id: seed.eventTypeId, isActive: false });

    await expect(t.mutation(api.schedules.deleteSchedule, { id: seed.scheduleId })).rejects.toMatchObject({
      data: { code: "SCHEDULE_IN_USE", message: expect.stringContaining('event type "et-1" uses it') },
    });
    await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, scheduleId: "" });
    await expect(t.mutation(api.schedules.deleteSchedule, { id: seed.scheduleId })).rejects.toMatchObject({
      data: { code: "SCHEDULE_IN_USE", message: expect.stringContaining('event type "et-global" uses it') },
    });
    await t.mutation(api.public.updateEventType, { id: "et-global", scheduleId: "" });
    // CONTROL: no event type names it any more.
    expect(await t.mutation(api.schedules.deleteSchedule, { id: seed.scheduleId })).toEqual({ success: true });
    expect(await t.query(api.schedules.getSchedule, { id: seed.scheduleId })).toBeNull();
  });

  test("an unused schedule is deleted as before", async () => {
    const { t } = setup();
    await t.mutation(api.schedules.createSchedule, {
      id: "sch-free", organizationId: ORG, name: "Free", timezone: TZ, weeklyHours: [], isDefault: true,
    });
    expect(await t.mutation(api.schedules.deleteSchedule, { id: "sch-free" })).toEqual({ success: true });
  });
});
