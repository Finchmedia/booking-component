import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import { makeBookingAPI } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

// The wrappers are exported so convex-test can address them as the app module
// "index.test" (this file) — the same trick the component scaffold uses.
export const {
  createSchedule,
  createResource,
  createEventType,
  linkResourceToEventType,
  hasResourceEventTypeLink,
  getEffectiveAvailability,
  getDaySlots,
  createBooking,
  getDailyAvailability,
} = makeBookingAPI(components.booking);

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      createSchedule: typeof createSchedule;
      createResource: typeof createResource;
      createEventType: typeof createEventType;
      linkResourceToEventType: typeof linkResourceToEventType;
      hasResourceEventTypeLink: typeof hasResourceEventTypeLink;
      getEffectiveAvailability: typeof getEffectiveAvailability;
      getDaySlots: typeof getDaySlots;
      createBooking: typeof createBooking;
      getDailyAvailability: typeof getDailyAvailability;
    };
  }>
)["index.test"];

const ORG = "org-1";
const TZ = "Europe/Berlin";
const RESOURCE = "res-1";
const EVENT = "et-1";
const SCHEDULE = "sch-1";
// Tuesday; Europe/Berlin is UTC+1 (DST starts 2027-03-28).
const DATE = "2027-03-09";
const TEN_BERLIN = Date.UTC(2027, 2, 9, 9); // 10:00 Berlin = 09:00Z
const ELEVEN_BERLIN = Date.UTC(2027, 2, 9, 10);

type Client = ReturnType<typeof initConvexTest>;

async function seedThroughWrappers(t: Client) {
  await t.mutation(testApi.createSchedule, {
    id: SCHEDULE,
    organizationId: ORG,
    name: "Office",
    timezone: TZ,
    weeklyHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: "09:00",
      endTime: "17:00",
    })),
  });
  await t.mutation(testApi.createResource, {
    id: RESOURCE,
    organizationId: ORG,
    name: "Room",
    type: "room",
    timezone: TZ,
  });
  await t.mutation(testApi.createEventType, {
    id: EVENT,
    slug: EVENT,
    title: "Consultation",
    lengthInMinutes: 60,
    slotInterval: 60,
    timezone: TZ,
    lockTimeZoneToggle: false,
    locations: [],
    organizationId: ORG,
    scheduleId: SCHEDULE,
  });
  await t.mutation(testApi.linkResourceToEventType, { resourceId: RESOURCE, eventTypeId: EVENT });
}

/** Schedule-aware day view through the wrappers, as ISO start times. */
// ComponentApi return types are `any` (no `returns` validators), so annotate here.
async function daySlots(t: Client): Promise<string[]> {
  const { availableSlots } = await t.query(testApi.getEffectiveAvailability, {
    scheduleId: SCHEDULE,
    date: DATE,
  });
  const slots: Array<{ time: string }> = await t.query(testApi.getDaySlots, {
    resourceId: RESOURCE,
    date: DATE,
    eventLength: 60,
    slotInterval: 60,
    resourceTimezone: TZ,
    availableSlots,
  });
  return slots.map((slot) => slot.time);
}

function bookTenToEleven(t: Client) {
  return t.mutation(testApi.createBooking, {
    eventTypeId: EVENT,
    resourceId: RESOURCE,
    start: TEN_BERLIN,
    end: ELEVEN_BERLIN,
    timezone: TZ,
    booker: { name: "Ada", email: "ada@example.com" },
    location: { type: "address", value: "Room 1" },
  });
}

describe("client wrappers (makeBookingAPI)", () => {
  let t: Client;

  beforeEach(() => {
    // booking.created schedules hooks/e-mails; keep them deterministic and drain them.
    vi.useFakeTimers();
    t = initConvexTest();
  });
  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("creates schedule, resource, event type and link through the wrappers", async () => {
    await seedThroughWrappers(t);

    expect(
      await t.query(testApi.hasResourceEventTypeLink, { resourceId: RESOURCE, eventTypeId: EVENT })
    ).toBe(true);
    const { availableSlots } = await t.query(testApi.getEffectiveAvailability, {
      scheduleId: SCHEDULE,
      date: DATE,
    });
    // 09:00–17:00 local = local slots 36..67
    expect(availableSlots).toEqual(Array.from({ length: 32 }, (_, i) => 36 + i));
  });

  test("schedule-aware getDaySlots and createBooking through the wrappers", async () => {
    await seedThroughWrappers(t);

    const before = await daySlots(t);
    // 09:00…16:00 Berlin = 08:00…15:00 UTC
    expect(before).toHaveLength(8);
    expect(before[0]).toBe("2027-03-09T08:00:00.000Z");
    expect(before[7]).toBe("2027-03-09T15:00:00.000Z");

    const booking = await bookTenToEleven(t);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.start).toBe(TEN_BERLIN);

    const after = await daySlots(t);
    expect(after).toEqual(before.filter((time) => time !== "2027-03-09T09:00:00.000Z"));
  });

  test("getDailyAvailability via the maintenance wrapper", async () => {
    await seedThroughWrappers(t);
    expect(await t.query(testApi.getDailyAvailability, { resourceId: RESOURCE, date: DATE })).toBeNull();

    await bookTenToEleven(t);
    // 09:00–10:00 UTC = slot indices 36..39
    expect(await t.query(testApi.getDailyAvailability, { resourceId: RESOURCE, date: DATE })).toEqual([
      36, 37, 38, 39,
    ]);
  });
});
