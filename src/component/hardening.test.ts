/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema.js";
import { api, internal } from "./_generated/api.js";
import { generateDaySlotsWithTimezone } from "./utils.js";

// The component is tested as the root app: its own schema + modules.
const modules = import.meta.glob("./**/*.ts");

type T = TestConvex<typeof schema>;

const ORG = "org-1";
const RESOURCE = "res-1";
const EVENT = "et-1";
const SCHEDULE = "sch-1";
const TZ = "Europe/Berlin";

const booker = { name: "Ada", email: "ada@example.com" };
const location = { type: "address", value: "Room 1" };

// 2027-03-09 is a Tuesday; Europe/Berlin is UTC+1 (DST starts 2027-03-28).
const utc = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h, min);

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

async function seed(t: T, opts: { requiresConfirmation?: boolean } = {}) {
  await t.mutation(api.resources.createResource, {
    id: RESOURCE,
    organizationId: ORG,
    name: "Room",
    type: "room",
    timezone: TZ,
  });
  await t.mutation(api.public.createEventType, {
    id: EVENT,
    slug: EVENT,
    title: "Consultation",
    lengthInMinutes: 60,
    timezone: TZ,
    lockTimeZoneToggle: false,
    locations: [],
    organizationId: ORG,
    requiresConfirmation: opts.requiresConfirmation,
  });
  await t.mutation(api.resource_event_types.linkResourceToEventType, {
    resourceId: RESOURCE,
    eventTypeId: EVENT,
  });
}

function book(t: T, start: number, end: number) {
  return t.mutation(api.public.createBooking, {
    eventTypeId: EVENT,
    resourceId: RESOURCE,
    start,
    end,
    timezone: TZ,
    booker,
    location,
  });
}

function busy(t: T, date: string, resourceId = RESOURCE) {
  return t.query(api.maintenance.getDailyAvailability, { resourceId, date });
}

let t: T;

beforeEach(() => {
  // Scheduled hooks (booking.created → emails) run on timers; keep them
  // deterministic and drain them at the end of every test.
  vi.useFakeTimers();
  t = convexTest(schema, modules);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

// ============================================
// createBooking / createProvisionalBooking
// ============================================

describe("createBooking slot bookkeeping", () => {
  test("a range across UTC midnight reserves slots on both days", async () => {
    await seed(t);
    await book(t, utc(2027, 3, 9, 23, 30), utc(2027, 3, 10, 0, 30));

    expect(await busy(t, "2027-03-09")).toEqual([94, 95]);
    expect(await busy(t, "2027-03-10")).toEqual([0, 1]);

    await expect(
      book(t, utc(2027, 3, 10, 0, 0), utc(2027, 3, 10, 1, 0))
    ).rejects.toThrow("Time slot no longer available");
  });

  test("rejects inverted or empty ranges", async () => {
    await seed(t);
    await expect(
      book(t, utc(2027, 3, 9, 10), utc(2027, 3, 9, 9))
    ).rejects.toThrow("Invalid time range");
    await expect(
      book(t, utc(2027, 3, 9, 10), utc(2027, 3, 9, 10))
    ).rejects.toThrow("Invalid time range");
    expect(await busy(t, "2027-03-09")).toBeNull();
  });

  test("createProvisionalBooking uses the same per-day bookkeeping", async () => {
    await seed(t);
    const provisional = await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: EVENT,
      resourceId: RESOURCE,
      start: utc(2027, 3, 9, 23, 30),
      end: utc(2027, 3, 10, 0, 30),
      timezone: TZ,
      booker,
      location,
    });
    expect(provisional?.status).toBe("provisional");
    expect(await busy(t, "2027-03-09")).toEqual([94, 95]);
    expect(await busy(t, "2027-03-10")).toEqual([0, 1]);

    await expect(
      t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: EVENT,
        resourceId: RESOURCE,
        start: utc(2027, 3, 9, 10),
        end: utc(2027, 3, 9, 10),
        timezone: TZ,
        booker,
        location,
      })
    ).rejects.toThrow("Invalid time range");

    await t.mutation(api.public.expireProvisionalBooking, {
      bookingId: provisional!._id,
    });
    expect(await busy(t, "2027-03-09")).toEqual([]);
    expect(await busy(t, "2027-03-10")).toEqual([]);
  });
});

// ============================================
// Month / day availability (timezone-aware)
// ============================================

describe("schedule-aware availability", () => {
  test("month view and day view agree for a non-UTC schedule", async () => {
    await seed(t);
    await t.mutation(api.schedules.createSchedule, {
      id: SCHEDULE,
      organizationId: ORG,
      name: "Office",
      timezone: TZ,
      weeklyHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "09:00",
        endTime: "11:00",
      })),
    });

    // Tue 09:00–11:00 Berlin == 08:00–10:00 UTC → the whole window is taken.
    await book(t, utc(2027, 3, 9, 8), utc(2027, 3, 9, 10));

    const month = await t.query(api.public.getMonthAvailability, {
      resourceId: RESOURCE,
      dateFrom: "2027-03-08",
      dateTo: "2027-03-14",
      eventLength: 60,
      slotInterval: 60,
      resourceTimezone: TZ,
      scheduleId: SCHEDULE,
    });
    expect(month).toEqual({
      "2027-03-08": true,
      "2027-03-09": false, // fully booked (would read as free without the UTC conversion)
      "2027-03-10": true,
      "2027-03-11": true,
      "2027-03-12": true,
      "2027-03-13": false, // weekend: empty window, no legacy 9–17 fall-through
      "2027-03-14": false,
    });

    const tue = await t.query(api.schedules.getEffectiveAvailability, {
      scheduleId: SCHEDULE,
      date: "2027-03-09",
    });
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: RESOURCE,
        date: "2027-03-09",
        eventLength: 60,
        slotInterval: 60,
        resourceTimezone: TZ,
        availableSlots: tue.availableSlots,
      })
    ).toEqual([]);

    const wed = await t.query(api.schedules.getEffectiveAvailability, {
      scheduleId: SCHEDULE,
      date: "2027-03-10",
    });
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: RESOURCE,
        date: "2027-03-10",
        eventLength: 60,
        slotInterval: 60,
        resourceTimezone: TZ,
        availableSlots: wed.availableSlots,
      })
    ).toEqual([
      { time: "2027-03-10T08:00:00.000Z" },
      { time: "2027-03-10T09:00:00.000Z" },
    ]);

    // Explicitly empty window → no slots, not the legacy business hours.
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: RESOURCE,
        date: "2027-03-13",
        eventLength: 60,
        slotInterval: 60,
        resourceTimezone: TZ,
        availableSlots: [],
      })
    ).toEqual([]);
  });

  test("candidate starts are anchored per availability window (split shifts)", () => {
    // 08:00–12:00 + 14:00–17:30, 120-minute event on a 150-minute grid.
    const slots = [...range(32, 48), ...range(56, 70)];
    const starts = generateDaySlotsWithTimezone("2027-03-09", 120, 150, slots, "UTC").map(
      (s) => s.start
    );
    expect(starts).toEqual([
      "2027-03-09T08:00:00.000Z",
      "2027-03-09T14:00:00.000Z", // lost with a single global grid (would be 15:30)
    ]);

    // Single contiguous window: unchanged behaviour.
    const single = generateDaySlotsWithTimezone("2027-03-09", 60, 60, range(36, 68), "UTC");
    expect(single.map((s) => s.start)).toEqual(
      range(9, 17).map((h) => `2027-03-09T${String(h).padStart(2, "0")}:00:00.000Z`)
    );
  });
});

// ============================================
// Schedule / override validation
// ============================================

describe("schedule time window validation", () => {
  const mk = (
    weeklyHours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
    id = "s"
  ) =>
    t.mutation(api.schedules.createSchedule, {
      id,
      organizationId: ORG,
      name: "x",
      timezone: "UTC",
      weeklyHours,
    });

  test("rejects malformed, off-grid, inverted, out-of-range and overlapping windows", async () => {
    await expect(mk([{ dayOfWeek: 1, startTime: "9:00", endTime: "17:00" }])).rejects.toThrow(
      'expected "HH:MM"'
    );
    await expect(mk([{ dayOfWeek: 1, startTime: "09:10", endTime: "17:00" }])).rejects.toThrow(
      "15-minute grid"
    );
    await expect(mk([{ dayOfWeek: 1, startTime: "17:00", endTime: "09:00" }])).rejects.toThrow(
      "must be before"
    );
    await expect(mk([{ dayOfWeek: 7, startTime: "09:00", endTime: "17:00" }])).rejects.toThrow(
      "dayOfWeek"
    );
    await expect(
      mk([
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "11:00", endTime: "14:00" },
      ])
    ).rejects.toThrow("Overlapping");
  });

  test("accepts adjacent windows and only validates fields present in a patch", async () => {
    const scheduleId = await mk(
      [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "12:00", endTime: "14:00" },
        { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
      ],
      "adjacent"
    );

    await t.mutation(api.schedules.updateSchedule, { id: "adjacent", name: "renamed" });
    await expect(
      t.mutation(api.schedules.updateSchedule, {
        id: "adjacent",
        weeklyHours: [{ dayOfWeek: 1, startTime: "garbage", endTime: "12:00" }],
      })
    ).rejects.toThrow('expected "HH:MM"');

    await expect(
      t.mutation(api.schedules.createDateOverride, {
        scheduleId,
        date: "2027-03-09",
        type: "custom",
        customHours: [{ startTime: "10:00", endTime: "09:00" }],
      })
    ).rejects.toThrow("must be before");

    const overrideId = await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: "2027-03-09",
      type: "custom",
      customHours: [{ startTime: "10:00", endTime: "12:00" }],
    });
    await t.mutation(api.schedules.updateDateOverride, { overrideId, type: "unavailable" });
    await expect(
      t.mutation(api.schedules.updateDateOverride, {
        overrideId,
        customHours: [
          { startTime: "10:00", endTime: "12:00" },
          { startTime: "11:00", endTime: "13:00" },
        ],
      })
    ).rejects.toThrow("Overlapping");
  });
});

// ============================================
// excludeBookingUid + reschedule
// ============================================

describe("reschedule flow", () => {
  test("excludeBookingUid frees only the booking's own slots in day and month view", async () => {
    await seed(t);
    const own = await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));
    await book(t, utc(2027, 3, 9, 10), utc(2027, 3, 9, 11)); // someone else

    const dayArgs = {
      resourceId: RESOURCE,
      date: "2027-03-09",
      eventLength: 60,
      slotInterval: 30,
    };
    const without = (await t.query(api.public.getDaySlots, dayArgs)).map((s) => s.time);
    expect(without).not.toContain("2027-03-09T09:00:00.000Z");
    expect(without).not.toContain("2027-03-09T09:30:00.000Z");

    const withExclude = (
      await t.query(api.public.getDaySlots, { ...dayArgs, excludeBookingUid: own!.uid })
    ).map((s) => s.time);
    expect(withExclude).toContain("2027-03-09T09:00:00.000Z");
    expect(withExclude).not.toContain("2027-03-09T09:30:00.000Z"); // overlaps the other booking
    expect(withExclude).not.toContain("2027-03-09T10:00:00.000Z");

    // Month view: the legacy 9–17 window with an 8-hour event has exactly one
    // candidate, which the own booking blocks unless excluded.
    const monthArgs = {
      resourceId: RESOURCE,
      dateFrom: "2027-03-10",
      dateTo: "2027-03-10",
      eventLength: 480,
    };
    await book(t, utc(2027, 3, 10, 9), utc(2027, 3, 10, 10));
    const blocker = await t.query(api.public.getBookingByUid, {
      uid: (await t.query(api.public.listBookings, { resourceId: RESOURCE }))
        .find((b) => b.start === utc(2027, 3, 10, 9))!.uid,
    });
    expect(await t.query(api.public.getMonthAvailability, monthArgs)).toEqual({
      "2027-03-10": false,
    });
    expect(
      await t.query(api.public.getMonthAvailability, {
        ...monthArgs,
        excludeBookingUid: blocker!.uid,
      })
    ).toEqual({ "2027-03-10": true });

    // A cancelled booking no longer holds slots, so it must not be excluded.
    await t.mutation(api.public.cancelBookingByToken, {
      uid: blocker!.uid,
      token: blocker!.managementToken!,
    });
    await book(t, utc(2027, 3, 10, 9), utc(2027, 3, 10, 10)); // new holder of the same slots
    expect(
      await t.query(api.public.getMonthAvailability, {
        ...monthArgs,
        excludeBookingUid: blocker!.uid,
      })
    ).toEqual({ "2027-03-10": false });
  });

  test("moving a booking to an overlapping time is allowed (token and id paths)", async () => {
    await seed(t);
    const original = await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));
    await book(t, utc(2027, 3, 9, 10, 30), utc(2027, 3, 9, 11, 30)); // 42..45 foreign

    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: original!.uid,
      token: original!.managementToken!,
      newStart: utc(2027, 3, 9, 9, 30),
      newEnd: utc(2027, 3, 9, 10, 30),
    });
    expect(moved?.start).toBe(utc(2027, 3, 9, 9, 30));
    expect(await busy(t, "2027-03-09")).toEqual([38, 39, 40, 41, 42, 43, 44, 45]);

    // Foreign slots still block.
    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: moved!.uid,
        token: moved!.managementToken!,
        newStart: utc(2027, 3, 9, 10),
        newEnd: utc(2027, 3, 9, 11),
      })
    ).rejects.toThrow("not available");
    expect(await busy(t, "2027-03-09")).toEqual([38, 39, 40, 41, 42, 43, 44, 45]);

    const movedAgain = await t.mutation(api.public.rescheduleBooking, {
      bookingId: moved!._id,
      newStart: utc(2027, 3, 9, 9),
      newEnd: utc(2027, 3, 9, 10),
    });
    expect(movedAgain?.rescheduleUid).toBe(moved!.uid);
    expect(await busy(t, "2027-03-09")).toEqual([36, 37, 38, 39, 42, 43, 44, 45]);
  });
});

// ============================================
// State machine: cancel / decline release slots
// ============================================

describe("transitionBookingState", () => {
  test("declined and cancelled release the booking's slots", async () => {
    await seed(t, { requiresConfirmation: true });
    const pending = await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));
    expect(pending?.status).toBe("pending");
    expect(await busy(t, "2027-03-09")).toEqual([36, 37, 38, 39]);

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: pending!._id,
      toStatus: "declined",
      reason: "double booked",
    });
    const declined = await t.query(api.public.getBooking, { bookingId: pending!._id });
    expect(declined?.status).toBe("declined");
    expect(declined?.cancelledAt).toBeDefined();
    expect(declined?.cancellationReason).toBe("double booked");
    expect(await busy(t, "2027-03-09")).toEqual([]);

    const again = await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: again!._id,
      toStatus: "cancelled",
    });
    expect(await busy(t, "2027-03-09")).toEqual([]);

    // completed keeps its slots (nothing to give back).
    const done = await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: done!._id,
      toStatus: "confirmed",
    });
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: done!._id,
      toStatus: "completed",
    });
    expect(await busy(t, "2027-03-09")).toEqual([36, 37, 38, 39]);
  });

  test("multi-resource bookings release pooled quantity and bitmap slots alike", async () => {
    await seed(t);
    await t.mutation(api.resources.createResource, {
      id: "pool",
      organizationId: ORG,
      name: "Chairs",
      type: "equipment",
      timezone: "UTC",
      quantity: 3,
      isFungible: true,
    });

    const multi = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: EVENT,
      resources: [{ resourceId: RESOURCE }, { resourceId: "pool", quantity: 2 }],
      start: utc(2027, 3, 9, 9),
      end: utc(2027, 3, 9, 10),
      timezone: "UTC",
      booker,
    });
    const check = () =>
      t.query(api.multi_resource.checkMultiResourceAvailability, {
        resources: [{ resourceId: RESOURCE }, { resourceId: "pool", quantity: 2 }],
        start: utc(2027, 3, 9, 9),
        end: utc(2027, 3, 9, 10),
      });

    expect(await busy(t, "2027-03-09")).toEqual([36, 37, 38, 39]);
    expect((await check()).resources.map((r) => r.availableQuantity)).toEqual([0, 1]);

    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: multi!._id,
      toStatus: "cancelled",
      reason: "changed plans",
    });

    expect(await busy(t, "2027-03-09")).toEqual([]);
    const after = await check();
    expect(after.available).toBe(true);
    expect(after.resources.map((r) => r.availableQuantity)).toEqual([1, 3]);
    // Items are kept as the record of what was booked.
    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: multi!._id,
    });
    expect(withItems?.items).toHaveLength(2);
  });
});

// ============================================
// Resources metadata / link index
// ============================================

describe("resources", () => {
  test("metadata is stored, replaced as a whole and kept on unrelated updates", async () => {
    await t.mutation(api.resources.createResource, {
      id: RESOURCE,
      organizationId: ORG,
      name: "Room",
      type: "room",
      timezone: TZ,
      metadata: { role: "rep", email: "rep@example.com" },
    });
    expect((await t.query(api.resources.getResource, { id: RESOURCE }))?.metadata).toEqual({
      role: "rep",
      email: "rep@example.com",
    });

    await t.mutation(api.resources.updateResource, { id: RESOURCE, name: "Room A" });
    expect((await t.query(api.resources.getResource, { id: RESOURCE }))?.metadata).toEqual({
      role: "rep",
      email: "rep@example.com",
    });

    await t.mutation(api.resources.updateResource, { id: RESOURCE, metadata: { role: "lead" } });
    expect((await t.query(api.resources.getResource, { id: RESOURCE }))?.metadata).toEqual({
      role: "lead",
    });
  });

  test("resource ↔ event type link lookups use the compound index", async () => {
    await seed(t);
    const linkArgs = { resourceId: RESOURCE, eventTypeId: EVENT };
    expect(await t.query(api.resource_event_types.hasResourceEventTypeLink, linkArgs)).toBe(true);
    expect(
      await t.query(api.resource_event_types.hasResourceEventTypeLink, {
        resourceId: RESOURCE,
        eventTypeId: "other",
      })
    ).toBe(false);
    // Re-linking is idempotent.
    await t.mutation(api.resource_event_types.linkResourceToEventType, linkArgs);
    expect(await t.query(api.resource_event_types.getEventTypeIdsForResource, { resourceId: RESOURCE })).toEqual([EVENT]);

    expect(await t.mutation(api.resource_event_types.unlinkResourceFromEventType, linkArgs)).toEqual({
      success: true,
      existed: true,
    });
    await expect(book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10))).rejects.toThrow(
      "not available for this event type"
    );
  });
});

// ============================================
// Maintenance
// ============================================

describe("maintenance", () => {
  test("wipeAllBookingData keeps the setup, wipeAllData clears it", async () => {
    await seed(t);
    const scheduleId = await t.mutation(api.schedules.createSchedule, {
      id: SCHEDULE,
      organizationId: ORG,
      name: "Office",
      timezone: TZ,
      weeklyHours: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
    });
    await t.mutation(api.schedules.createDateOverride, {
      scheduleId,
      date: "2027-12-24",
      type: "unavailable",
    });
    await t.mutation(api.hooks.registerHook, {
      eventType: "booking.created",
      functionHandle: "function://placeholder",
    });
    await book(t, utc(2027, 3, 9, 9), utc(2027, 3, 9, 10));

    expect(await t.mutation(api.maintenance.wipeAllBookingData, {})).toEqual({
      bookings: 1,
      bookingHistory: 1,
      bookingItems: 0,
      dailyAvailability: 1,
      quantityAvailability: 0,
    });
    expect(await busy(t, "2027-03-09")).toBeNull();
    expect(await t.query(api.resources.getResource, { id: RESOURCE })).not.toBeNull();
    expect(await t.query(api.public.listBookings, {})).toEqual([]);

    expect(await t.mutation(api.maintenance.wipeAllData, {})).toEqual({
      bookings: 0,
      bookingHistory: 0,
      bookingItems: 0,
      dailyAvailability: 0,
      quantityAvailability: 0,
      resources: 1,
      schedules: 1,
      dateOverrides: 1,
      eventTypes: 1,
      resourceEventTypes: 1,
      hooks: 1,
    });
    expect(await t.query(api.resources.getResource, { id: RESOURCE })).toBeNull();
    expect(await t.query(api.schedules.getSchedule, { id: SCHEDULE })).toBeNull();
    expect(await t.query(api.public.listEventTypes, {})).toEqual([]);
    expect(await t.query(api.hooks.listHooks, {})).toEqual([]);
  });
});

// ============================================
// Email mutations return shape
// ============================================

describe("email mutations", () => {
  test("return the declared { success, emailId?, error? } shape without an API key", async () => {
    const base = {
      to: "ada@example.com",
      bookerName: "Ada",
      eventTitle: "Consultation",
      start: utc(2027, 3, 9, 9),
      end: utc(2027, 3, 9, 10),
      timezone: TZ,
    };
    const expected = { success: false, error: "No API key provided" };
    expect(await t.mutation(internal.emails.sendBookingConfirmation, base)).toEqual(expected);
    expect(await t.mutation(internal.emails.sendBookingPending, base)).toEqual(expected);
    expect(await t.mutation(internal.emails.sendBookingApproved, base)).toEqual(expected);
    expect(await t.mutation(internal.emails.sendBookingDeclined, base)).toEqual(expected);
    expect(await t.mutation(internal.emails.sendBookingCancellation, base)).toEqual(expected);
    const { start, end, ...rescheduledBase } = base;
    expect(
      await t.mutation(internal.emails.sendBookingRescheduled, {
        ...rescheduledBase,
        oldStart: start,
        oldEnd: end,
        newStart: start + 3_600_000,
        newEnd: end + 3_600_000,
      })
    ).toEqual(expected);
  });
});
