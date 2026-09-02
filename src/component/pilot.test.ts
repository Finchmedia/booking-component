/// <reference types="vite/client" />
// Pilot for the component harness (setup.test.ts): the smallest end-to-end tour
// of seed → day view → booking → slot bookkeeping. Copy this file to start a
// new test area.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  TUESDAY,
  berlin,
  book,
  getBusySlots,
  listDaySlots,
  range,
  seedFungibleResource,
  seedResourceWithSchedule,
  setup,
  utc,
} from "./setup.test.js";

describe("pilot: harness smoke test", () => {
  test("seed → getDaySlots → createBooking → the slot disappears → busy indices", async () => {
    const { t } = setup();
    // Mon–Fri 09:00–17:00 Europe/Berlin, 60-min event on a 60-min grid.
    const seed = await seedResourceWithSchedule(t);

    // Effective window on the seed date (Tuesday): 09:00–17:00 local = local slots 36..67.
    expect(seed.date).toBe(TUESDAY);
    expect(seed.availableSlots).toEqual(range(36, 68));

    // Schedule-aware day view: 8 hourly starts 09:00…16:00 Berlin = 08:00…15:00 UTC (UTC+1 in March).
    const before = await t.query(api.public.getDaySlots, seed.daySlotsArgs);
    expect(before.map((slot) => slot.time)).toEqual(
      range(9, 17).map((hour) =>
        new Date(berlin(TUESDAY, `${String(hour).padStart(2, "0")}:00`)).toISOString()
      )
    );
    expect(before[0].time).toBe("2027-03-09T08:00:00.000Z");
    expect(berlin(TUESDAY, "10:00")).toBe(utc(TUESDAY, "09:00"));

    const start = berlin(TUESDAY, "10:00");
    const end = berlin(TUESDAY, "11:00");
    const booking = await book(t, seed, start, end);
    expect(booking).toMatchObject({
      status: "confirmed",
      start,
      end,
      resourceId: seed.resourceId,
      eventTypeId: seed.eventTypeId,
      bookerEmail: BOOKER.email,
    });

    // The booked start is gone; everything else is still offered.
    const after = await listDaySlots(t, seed);
    expect(after).toEqual(
      before.map((slot) => slot.time).filter((time) => time !== new Date(start).toISOString())
    );
    expect(after).toHaveLength(7);

    // 10:00–11:00 Berlin = 09:00–10:00 UTC = UTC slot indices 36..39; other days have no row.
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([36, 37, 38, 39]);
    expect(await getBusySlots(t, seed.resourceId, "2027-03-10")).toBeNull();

    await expect(book(t, seed, start, end)).rejects.toThrow("Time slot no longer available");
  });

  test("a day without weekly hours has no window and no slots", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    expect(await listDaySlots(t, seed, "2027-03-13")).toEqual([]); // Saturday
    expect(await listDaySlots(t, seed, "2027-03-10")).toHaveLength(8); // Wednesday
  });

  test("seedFungibleResource pools quantity for multi-resource bookings", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    const pool = await seedFungibleResource(t, { quantity: 2, eventTypeId: seed.eventTypeId });

    const resources = [{ resourceId: seed.resourceId }, { resourceId: pool.resourceId, quantity: 1 }];
    const start = berlin(TUESDAY, "09:00");
    const end = berlin(TUESDAY, "10:00");
    const check = () =>
      t.query(api.multi_resource.checkMultiResourceAvailability, { resources, start, end });

    expect((await check()).resources.map((r) => r.availableQuantity)).toEqual([1, 2]);

    const booking = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId,
      resources,
      start,
      end,
      timezone: seed.timezone,
      booker: BOOKER,
    });
    expect(booking?.status).toBe("confirmed");

    const after = await check();
    expect(after.available).toBe(false);
    expect(after.resources.map((r) => r.availableQuantity)).toEqual([0, 1]);
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([32, 33, 34, 35]);
  });
});
