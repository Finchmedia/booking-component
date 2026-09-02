/// <reference types="vite/client" />
// Coverage for src/component/maintenance.ts — the reset / inspection surface
// that demo sandboxes, seed scripts and test fixtures call because the host app
// cannot reach the component's tables through its own ctx.db.
//
// Focus areas:
//  - getDailyAvailability: "no row" (null) vs "row without busy slots" ([]),
//    per-resource/per-day isolation, and the ascending order createBooking
//    writes.
//  - wipeAllBookingData: exact per-table counts with more than one resource and
//    both slot back-ends (daily_availability bitmap + quantity_availability
//    counters), the setup surviving untouched, and the calendar being bookable
//    again afterwards.
//  - wipeAllData: the setup tables on top, plus a full re-seed under the same
//    external ids (which only works if every row is really gone).
//  - Both wipes on an empty backend and called twice (idempotence).
//  - Presence is documented as NOT reset by either wipe.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  ORG,
  TUESDAY,
  TZ,
  berlin,
  book,
  getBusySlots,
  listDaySlots,
  range,
  seedFungibleResource,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type SeededResource,
  type T,
} from "./setup.test.js";

/** The day after TUESDAY (2027-03-09) — used for the UTC-midnight spans. */
const WEDNESDAY = "2027-03-10";

const NO_BOOKING_DATA = {
  bookings: 0,
  bookingHistory: 0,
  bookingItems: 0,
  dailyAvailability: 0,
  quantityAvailability: 0,
};

const NO_SETUP = {
  resources: 0,
  schedules: 0,
  dateOverrides: 0,
  eventTypes: 0,
  resourceEventTypes: 0,
  hooks: 0,
};

const wipeBookingData = (t: T) => t.mutation(api.maintenance.wipeAllBookingData, {});
const wipeAll = (t: T) => t.mutation(api.maintenance.wipeAllData, {});

/** External resource ids of an organization, sorted for stable comparison. */
async function resourceIds(t: T, organizationId = ORG): Promise<string[]> {
  const resources = await t.query(api.resources.listResources, { organizationId });
  return resources.map((r) => r.id).sort();
}

/** `createMultiResourceBooking` with the fixture booker. */
function bookMulti(
  t: T,
  eventTypeId: string,
  resources: Array<{ resourceId: string; quantity?: number }>,
  start: number,
  end: number
) {
  return t.mutation(api.multi_resource.createMultiResourceBooking, {
    eventTypeId,
    organizationId: ORG,
    resources,
    start,
    end,
    timezone: TZ,
    booker: BOOKER,
  });
}

/**
 * Three resources in one org: a scheduled room (res-1 / et-1 / sch-1), a second
 * room (res-2 / et-2) and a fungible pool (pool-1, quantity 3) linked to et-2 —
 * so a wipe has to count more than one row per table and both slot back-ends.
 */
async function seedTwoRoomsAndAPool(t: T) {
  const roomA = await seedResourceWithSchedule(t);
  const roomB = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
  const pool = await seedFungibleResource(t, {
    resourceId: "pool-1",
    quantity: 3,
    eventTypeId: roomB.eventTypeId,
  });
  return { roomA, roomB, pool };
}

describe("maintenance: getDailyAvailability", () => {
  test("null until a bitmap row exists for exactly that resource and day", async () => {
    const { t } = setup();
    const { roomA, roomB, pool } = await seedTwoRoomsAndAPool(t);

    // Nothing booked yet: unknown resource, known-but-unbooked resource and a
    // string that is not even a date all read as "no row".
    expect(await getBusySlots(t, "does-not-exist", TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomA.resourceId, "not-a-date")).toBeNull();
    expect(await getBusySlots(t, "", "")).toBeNull();

    await book(t, roomA, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));

    // 10:00–11:00 Berlin = 09:00–10:00 UTC = slots 36..39.
    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toEqual(range(36, 40));
    // The row is keyed by (resourceId, date) — neighbours stay null.
    expect(await getBusySlots(t, roomA.resourceId, WEDNESDAY)).toBeNull();
    expect(await getBusySlots(t, roomB.resourceId, TUESDAY)).toBeNull();
    // Ids are matched exactly, not by prefix/trim.
    expect(await getBusySlots(t, `${roomA.resourceId} `, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, "res-", TUESDAY)).toBeNull();

    // Contrast with resources.getResourceAvailability, which flattens the
    // missing row to []: only the maintenance query reports "no row at all".
    expect(
      await t.query(api.resources.getResourceAvailability, {
        resourceId: roomA.resourceId,
        date: WEDNESDAY,
      })
    ).toEqual([]);

    // A pooled (fungible) resource is tracked in quantity_availability, so the
    // bitmap query stays null even while the pool is fully booked, whereas the
    // non-fungible room in the SAME multi-resource booking does get a row.
    await bookMulti(
      t,
      roomB.eventTypeId,
      [{ resourceId: roomB.resourceId }, { resourceId: pool.resourceId, quantity: 2 }],
      berlin(TUESDAY, "10:00"),
      berlin(TUESDAY, "11:00")
    );
    expect(await getBusySlots(t, pool.resourceId, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomB.resourceId, TUESDAY)).toEqual(range(36, 40));
    expect(
      await t.query(api.resources.getQuantityAvailability, {
        resourceId: pool.resourceId,
        date: TUESDAY,
      })
    ).toEqual({
      totalQuantity: 3,
      bookedQuantities: { "36": 2, "37": 2, "38": 2, "39": 2 },
    });
  });

  test("busy indices come back ascending per day, and a released row stays as []", async () => {
    const { t } = setup();
    // No schedule needed: createBooking does not consult one.
    const seed = await seedResource(t);

    // Book the LATE range first — createBooking merges and sorts, so the
    // read-back is ascending regardless of the order the slots were taken in.
    await book(t, seed, utc(TUESDAY, "14:00"), utc(TUESDAY, "15:00"));
    const early = await book(t, seed, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));

    const busy = await getBusySlots(t, seed.resourceId, TUESDAY);
    expect(busy).toEqual([...range(36, 40), ...range(56, 60)]);
    expect(busy).toEqual([...busy!].sort((a, b) => a - b));

    // A range across UTC midnight keeps one ascending slice per calendar day.
    await book(t, seed, utc(TUESDAY, "23:30"), utc(WEDNESDAY, "00:30"));
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([
      ...range(36, 40),
      ...range(56, 60),
      94,
      95,
    ]);
    expect(await getBusySlots(t, seed.resourceId, WEDNESDAY)).toEqual([0, 1]);

    // Releasing slots empties the row, it does not delete it: [] ≠ null. Only a
    // wipe removes the row (asserted in the wipe tests below).
    await t.mutation(api.public.cancelBookingByToken, {
      uid: early!.uid,
      token: early!.managementToken!,
    });
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([
      ...range(56, 60),
      94,
      95,
    ]);

    await t.mutation(api.public.cancelBookingByToken, {
      uid: (await t.query(api.public.listBookings, { resourceId: seed.resourceId }))
        .find((b) => b.start === utc(TUESDAY, "23:30"))!.uid,
      token: (await t.query(api.public.listBookings, { resourceId: seed.resourceId }))
        .find((b) => b.start === utc(TUESDAY, "23:30"))!.managementToken!,
    });
    expect(await getBusySlots(t, seed.resourceId, WEDNESDAY)).toEqual([]);
    expect(await getBusySlots(t, seed.resourceId, WEDNESDAY)).not.toBeNull();
  });
});

describe("maintenance: wipeAllBookingData", () => {
  test("counts every booking table and leaves the setup bookable", async () => {
    const { t } = setup();
    const { roomA, roomB, pool } = await seedTwoRoomsAndAPool(t);

    // Setup rows that must SURVIVE a booking-data wipe. The hook uses an event
    // type no booking emits, so draining the scheduler never dereferences the
    // placeholder handle.
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: roomA.scheduleDocId,
      date: "2027-12-24",
      type: "unavailable",
    });
    const hookId = await t.mutation(api.hooks.registerHook, {
      eventType: "presence.timeout",
      functionHandle: "function://noop",
      organizationId: ORG,
    });

    const start = berlin(TUESDAY, "10:00");
    const end = berlin(TUESDAY, "11:00");
    await book(t, roomA, start, end);
    // Multi-resource booking across UTC midnight: 2 items, 2 bitmap days for
    // the room and 2 quantity days for the pool — so every counted table holds
    // more than one row.
    await bookMulti(
      t,
      roomB.eventTypeId,
      [{ resourceId: roomB.resourceId }, { resourceId: pool.resourceId, quantity: 2 }],
      utc(TUESDAY, "23:30"),
      utc(WEDNESDAY, "00:30")
    );

    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toEqual(range(36, 40));
    expect(await getBusySlots(t, roomB.resourceId, TUESDAY)).toEqual([94, 95]);
    expect(await getBusySlots(t, roomB.resourceId, WEDNESDAY)).toEqual([0, 1]);

    expect(await wipeBookingData(t)).toEqual({
      bookings: 2,
      bookingHistory: 2,
      bookingItems: 2,
      dailyAvailability: 3,
      quantityAvailability: 2,
    });

    // Booking data is gone — rows deleted, not emptied.
    expect(await t.query(api.public.listBookings, {})).toEqual([]);
    expect(await t.query(api.public.listBookings, { status: "provisional" })).toEqual([]);
    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomB.resourceId, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomB.resourceId, WEDNESDAY)).toBeNull();
    expect(
      await t.query(api.resources.getQuantityAvailability, {
        resourceId: pool.resourceId,
        date: TUESDAY,
      })
    ).toEqual({ totalQuantity: 3, bookedQuantities: {} });

    // …while the whole setup is untouched.
    expect(await resourceIds(t)).toEqual(["pool-1", "res-1", "res-2"]);
    expect(await t.query(api.resources.getResource, { id: roomA.resourceId })).not.toBeNull();
    expect(
      (await t.query(api.schedules.listSchedules, { organizationId: ORG })).map((s) => s.id)
    ).toEqual([roomA.scheduleId]);
    expect(
      (await t.query(api.public.listEventTypes, {})).map((e) => e.id).sort()
    ).toEqual(["et-1", "et-2"]);
    expect(
      await t.query(api.resource_event_types.getEventTypeIdsForResource, {
        resourceId: roomA.resourceId,
      })
    ).toEqual([roomA.eventTypeId]);
    expect(
      (
        await t.query(api.resource_event_types.getResourceIdsForEventType, {
          eventTypeId: roomB.eventTypeId,
        })
      ).sort()
    ).toEqual(["pool-1", "res-2"]);
    expect(
      (await t.query(api.schedules.listDateOverrides, { scheduleId: roomA.scheduleDocId })).map(
        (o) => o.date
      )
    ).toEqual(["2027-12-24"]);
    expect((await t.query(api.hooks.listHooks, {})).map((h) => h._id)).toEqual([hookId]);

    // The calendar offers the wiped slot again and it can be re-booked.
    expect(await listDaySlots(t, roomA)).toHaveLength(8);
    expect(await book(t, roomA, start, end)).toMatchObject({
      status: "confirmed",
      start,
      end,
      resourceId: roomA.resourceId,
    });
    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toEqual(range(36, 40));
    expect(await listDaySlots(t, roomA)).toHaveLength(7);

    // The pool's quantity is free again too.
    const check = await t.query(api.multi_resource.checkMultiResourceAvailability, {
      resources: [{ resourceId: pool.resourceId, quantity: 3 }],
      start: utc(TUESDAY, "23:30"),
      end: utc(WEDNESDAY, "00:30"),
    });
    expect(check.available).toBe(true);
    expect(check.resources.map((r) => r.availableQuantity)).toEqual([3]);
  });
});

describe("maintenance: wipeAllData", () => {
  test("clears the setup tables too and the sandbox re-seeds under the same ids", async () => {
    const { t } = setup();
    const roomA = await seedResourceWithSchedule(t);
    const roomB = await seedResourceWithSchedule(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
      scheduleId: "sch-2",
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: roomA.scheduleDocId,
      date: "2027-12-24",
      type: "unavailable",
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId: roomB.scheduleDocId,
      date: "2027-12-25",
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });
    await t.mutation(api.hooks.registerHook, {
      eventType: "presence.timeout",
      functionHandle: "function://noop",
    });
    await t.mutation(api.hooks.registerHook, {
      eventType: "presence.timeout",
      functionHandle: "function://noop-2",
      organizationId: ORG,
    });

    const start = berlin(TUESDAY, "10:00");
    const end = berlin(TUESDAY, "11:00");
    await book(t, roomA, start, end);
    await book(t, roomB, start, end);

    expect(await wipeAll(t)).toEqual({
      bookings: 2,
      bookingHistory: 2,
      bookingItems: 0,
      dailyAvailability: 2,
      quantityAvailability: 0,
      resources: 2,
      schedules: 2,
      dateOverrides: 2,
      eventTypes: 2,
      resourceEventTypes: 2,
      hooks: 2,
    });

    expect(await t.query(api.resources.listResources, { organizationId: ORG })).toEqual([]);
    expect(await t.query(api.resources.getResource, { id: roomA.resourceId })).toBeNull();
    expect(await t.query(api.schedules.listSchedules, { organizationId: ORG })).toEqual([]);
    expect(await t.query(api.schedules.getSchedule, { id: roomB.scheduleId })).toBeNull();
    expect(await t.query(api.schedules.getDefaultSchedule, { organizationId: ORG })).toBeNull();
    expect(await t.query(api.public.listEventTypes, {})).toEqual([]);
    await expect(
      t.query(api.public.getEventType, { eventTypeId: roomA.eventTypeId })
    ).rejects.toThrow(`Event type not found: ${roomA.eventTypeId}`);
    expect(await t.query(api.hooks.listHooks, {})).toEqual([]);
    expect(
      await t.query(api.schedules.listDateOverrides, { scheduleId: roomA.scheduleDocId })
    ).toEqual([]);
    expect(
      await t.query(api.resource_event_types.getEventTypeIdsForResource, {
        resourceId: roomA.resourceId,
      })
    ).toEqual([]);
    expect(
      await t.query(api.resource_event_types.getResourceIdsForEventType, {
        eventTypeId: roomB.eventTypeId,
      })
    ).toEqual([]);
    expect(
      await t.query(api.resource_event_types.hasResourceEventTypeLink, {
        resourceId: roomA.resourceId,
        eventTypeId: roomA.eventTypeId,
      })
    ).toBe(false);
    expect(await t.query(api.public.listBookings, {})).toEqual([]);
    expect(await getBusySlots(t, roomA.resourceId, TUESDAY)).toBeNull();
    expect(await getBusySlots(t, roomB.resourceId, TUESDAY)).toBeNull();

    // Re-seed with the SAME external ids: createResource / createSchedule throw
    // "already exists" if a single row had survived the wipe.
    const reseeded = await seedResourceWithSchedule(t);
    expect(await resourceIds(t)).toEqual(["res-1"]);
    expect(await listDaySlots(t, reseeded)).toHaveLength(8);
    expect(await book(t, reseeded, start, end)).toMatchObject({ status: "confirmed", start, end });
    expect(await getBusySlots(t, reseeded.resourceId, TUESDAY)).toEqual(range(36, 40));
    expect(await listDaySlots(t, reseeded)).toHaveLength(7);
  });
});

describe("maintenance: idempotence", () => {
  test("both wipes are no-ops on an empty backend and return zeros on a second call", async () => {
    const { t } = setup();

    // Nothing seeded at all.
    expect(await wipeBookingData(t)).toEqual(NO_BOOKING_DATA);
    expect(await wipeAll(t)).toEqual({ ...NO_BOOKING_DATA, ...NO_SETUP });

    const roomA = await seedResourceWithSchedule(t);
    const roomB: SeededResource = await seedResource(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
    });
    await book(t, roomA, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));
    await book(t, roomB, utc(TUESDAY, "12:00"), utc(TUESDAY, "13:00"));

    expect(await wipeBookingData(t)).toEqual({
      bookings: 2,
      bookingHistory: 2,
      bookingItems: 0,
      dailyAvailability: 2,
      quantityAvailability: 0,
    });
    // Second call has nothing left to delete…
    expect(await wipeBookingData(t)).toEqual(NO_BOOKING_DATA);
    // …and never touched the setup on either call.
    expect(await resourceIds(t)).toEqual(["res-1", "res-2"]);

    expect(await wipeAll(t)).toEqual({
      ...NO_BOOKING_DATA,
      resources: 2,
      schedules: 1,
      dateOverrides: 0,
      eventTypes: 2,
      resourceEventTypes: 2,
      hooks: 0,
    });
    expect(await wipeAll(t)).toEqual({ ...NO_BOOKING_DATA, ...NO_SETUP });
    // The narrower wipe after the full one is a no-op as well.
    expect(await wipeBookingData(t)).toEqual(NO_BOOKING_DATA);
    expect(await resourceIds(t)).toEqual([]);
  });

  test("presence holds are transient state and survive both wipes", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const slot = new Date(utc(TUESDAY, "09:00")).toISOString();
    const presenceArgs = { resourceId: seed.resourceId, slot };

    await t.mutation(api.presence.heartbeat, {
      resourceId: seed.resourceId,
      slots: [slot],
      user: "user-1",
    });
    expect(await t.query(api.presence.list, presenceArgs)).toHaveLength(1);

    await wipeBookingData(t);
    expect(await t.query(api.presence.list, presenceArgs)).toHaveLength(1);

    await wipeAll(t);
    expect(await t.query(api.resources.getResource, { id: seed.resourceId })).toBeNull();
    expect(await t.query(api.presence.list, presenceArgs)).toHaveLength(1);

    // Release the hold so the pending cleanup job finds nothing to reschedule.
    await t.mutation(api.presence.leave, {
      resourceId: seed.resourceId,
      slots: [slot],
      user: "user-1",
    });
    expect(await t.query(api.presence.list, presenceArgs)).toEqual([]);
  });
});
