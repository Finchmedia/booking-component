/// <reference types="vite/client" />
/**
 * Configuration writes reject time zones that Intl does not accept (PR-54a).
 *
 * Every schedule-aware availability read that uses such a zone throws.
 * Patches check the zone only when they carry one, and rows stored before
 * 0.4.3 stay readable and editable (availability reads of such a schedule:
 * schedule-arguments.test.ts).
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { ORG, setup, type T } from "./setup.test.js";

const INVALID = ["Mars/Olympus_Mons", "", "UTC+2", " Europe/Berlin", "Not/AZone"];
const VALID = ["UTC", "Etc/GMT-12", "Europe/Berlin", "America/New_York", "Pacific/Chatham"];
const message = (zone: string) => `Invalid time zone "${zone}"`;

let seq = 0;

const writers = {
  schedule: {
    create: async (t: T, timezone: string) => {
      const id = `sch-${++seq}`;
      const docId = await t.mutation(api.schedules.createSchedule, {
        id,
        organizationId: ORG,
        name: "Office",
        timezone,
        weeklyHours: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
      });
      return { id, docId: docId as string };
    },
    update: (t: T, id: string, patch: { timezone?: string; name?: string }) =>
      t.mutation(api.schedules.updateSchedule, { id, ...patch }),
    read: async (t: T, id: string) => (await t.query(api.schedules.getSchedule, { id }))?.timezone,
    list: async (t: T) => (await t.query(api.schedules.listSchedules, { organizationId: ORG })).length,
  },
  resource: {
    create: async (t: T, timezone: string) => {
      const id = `res-${++seq}`;
      const docId = await t.mutation(api.resources.createResource, {
        id,
        organizationId: ORG,
        name: "Room",
        type: "room",
        timezone,
      });
      return { id, docId: docId as string };
    },
    update: (t: T, id: string, patch: { timezone?: string; name?: string }) =>
      t.mutation(api.resources.updateResource, { id, ...patch }),
    read: async (t: T, id: string) => (await t.query(api.resources.getResource, { id }))?.timezone,
    list: async (t: T) => (await t.query(api.resources.listResources, { organizationId: ORG })).length,
  },
  eventType: {
    create: async (t: T, timezone: string) => {
      const id = `et-${++seq}`;
      const docId = await t.mutation(api.public.createEventType, {
        id,
        slug: id,
        title: "Consultation",
        lengthInMinutes: 60,
        timezone,
        lockTimeZoneToggle: false,
        locations: [],
        organizationId: ORG,
      });
      return { id, docId: docId as string };
    },
    update: (t: T, id: string, patch: { timezone?: string; name?: string }) =>
      t.mutation(api.public.updateEventType, {
        id,
        timezone: patch.timezone,
        ...(patch.name !== undefined ? { title: patch.name } : {}),
      }),
    read: async (t: T, id: string) => (await t.query(api.public.getEventType, { eventTypeId: id })).timezone,
    list: async (t: T) => (await t.query(api.public.listEventTypes, { organizationId: ORG })).length,
  },
};

describe.each(Object.entries(writers))("%s writes", (_name, writer) => {
  test("create rejects zones Intl does not accept and writes nothing", async () => {
    const { t } = setup();
    for (const zone of INVALID) {
      await expect(writer.create(t, zone), JSON.stringify(zone)).rejects.toThrow(message(zone));
    }
    expect(await writer.list(t)).toBe(0);
  });

  test("valid zones round-trip on create and update", async () => {
    const { t } = setup();
    for (const zone of VALID) {
      const { id } = await writer.create(t, zone);
      expect(await writer.read(t, id)).toBe(zone);
      await writer.update(t, id, { timezone: "Pacific/Kiritimati" });
      expect(await writer.read(t, id)).toBe("Pacific/Kiritimati");
    }
  });

  test("update rejects an invalid zone and keeps the stored one", async () => {
    const { t } = setup();
    const { id } = await writer.create(t, "Europe/Berlin");
    for (const zone of INVALID) {
      await expect(writer.update(t, id, { timezone: zone }), JSON.stringify(zone)).rejects.toThrow(message(zone));
    }
    expect(await writer.read(t, id)).toBe("Europe/Berlin");
  });

  test("a row stored with an invalid zone stays readable, and a patch without a zone succeeds", async () => {
    const { t } = setup();
    const { id, docId } = await writer.create(t, "Europe/Berlin");
    // A legacy row written before 0.4.3.
    await t.run(async (ctx) => {
      await ctx.db.patch(docId as never, { timezone: "Mars/Olympus_Mons" } as never);
    });
    expect(await writer.read(t, id)).toBe("Mars/Olympus_Mons");
    expect(await writer.list(t)).toBe(1);
    await writer.update(t, id, { name: "Renamed" });
    expect(await writer.read(t, id)).toBe("Mars/Olympus_Mons");
    // …and a patch that carries a valid zone repairs it.
    await writer.update(t, id, { timezone: "Europe/Berlin" });
    expect(await writer.read(t, id)).toBe("Europe/Berlin");
  });
});
