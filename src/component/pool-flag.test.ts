/**
 * N16 (plan PR-60, decision D28 (A)): updateResource refuses isFungible
 * false -> true while active bookings WITHOUT booking_items (single-resource
 * bookings, legacy rows included) hold the resource. The flag alone, with
 * capacity one, keeps the bitmap, but moves and the single-resource paths
 * refuse pools, so those bookings would be stranded. Bundles keep their
 * items and stay movable, so they do not block the change (unlike
 * assertNoActiveBookings, which guards representation changes).
 *
 * Converted from the verification probes gb/zz-cv-gb-n5-pool-flag and
 * gb-skeptic/zz-cv-gbs-c5-pool-flag-fix.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { BOOKER, TUESDAY, book, getBusySlots, range, seedResource, setup, utc } from "./setup.test.js";

const POOL_FLAG_REFUSED = {
  code: "RESOURCE_IN_USE",
  message: "Cannot make a resource fungible while it has active single-resource bookings",
};

describe("isFungible: true on an exclusive resource", () => {
  test("is refused while an active single booking holds it; the booking stays movable", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const a = await book(t, seed, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));

    // CONTROL: the representation change (capacity 3) was already refused.
    await expect(
      t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true, quantity: 3 }),
    ).rejects.toThrow("Cannot change inventory mode while resource has active bookings");
    // The flag-only change is refused too now.
    await expect(t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true }))
      .rejects.toMatchObject({ data: POOL_FLAG_REFUSED });
    expect((await t.query(api.resources.getResource, { id: seed.resourceId }))?.isFungible).toBeUndefined();

    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: a.uid, token: a.managementToken!, newStart: utc(TUESDAY, "13:00"), newEnd: utc(TUESDAY, "14:00"),
    });
    expect(moved.status).toBe("confirmed");
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual(range(52, 56));
  });

  test("pending and provisional single bookings block it; ended ones do not", async () => {
    const { t } = setup();
    const seed = await seedResource(t, { requiresConfirmation: true });
    const pending = await book(t, seed, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));
    const hold = await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: utc(TUESDAY, "11:00"), end: utc(TUESDAY, "12:00"),
      timezone: "UTC", booker: BOOKER, location: { type: "address" },
    });
    const flag = () => t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true });

    await expect(flag()).rejects.toMatchObject({ data: POOL_FLAG_REFUSED });
    await t.mutation(api.hooks.transitionBookingState, { bookingId: pending._id, toStatus: "declined" });
    await expect(flag()).rejects.toMatchObject({ data: POOL_FLAG_REFUSED }); // the hold still counts
    await t.mutation(api.public.expireProvisionalBooking, { bookingId: hold._id });
    // CONTROL: with nothing active the flag is accepted.
    expect(await flag()).toBeDefined();
    expect((await t.query(api.resources.getResource, { id: seed.resourceId }))?.isFungible).toBe(true);
  });

  test("a legacy createReservation row blocks it", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.public.createReservation, {
      resourceId: seed.resourceId, actorId: "ops@example.com", start: utc(TUESDAY, "09:00"), end: utc(TUESDAY, "10:00"),
    });
    await expect(t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true }))
      .rejects.toMatchObject({ data: POOL_FLAG_REFUSED });
  });

  test("bundles do not block it and stay movable", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const bundle = await t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId,
      resources: [{ resourceId: seed.resourceId }],
      start: utc(TUESDAY, "09:00"),
      end: utc(TUESDAY, "10:00"),
      timezone: seed.timezone,
      booker: BOOKER,
    });
    expect(bundle.resourceId).toBe(seed.resourceId); // the bundle's primary resource

    await t.mutation(api.resources.updateResource, { id: seed.resourceId, isFungible: true });
    const moved = await t.mutation(api.public.rescheduleBooking, {
      bookingId: bundle._id, newStart: utc(TUESDAY, "11:00"), newEnd: utc(TUESDAY, "12:00"),
    });
    expect([moved.status, moved.rescheduleUid]).toEqual(["confirmed", bundle.uid]);
  });

  test("a resource without bookings, and other updates of an occupied one, are unaffected", async () => {
    const { t } = setup();
    const free = await seedResource(t, { resourceId: "res-free", eventTypeId: "et-free" });
    const busy = await seedResource(t);
    await book(t, busy, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));

    await t.mutation(api.resources.updateResource, { id: free.resourceId, isFungible: true });
    await t.mutation(api.resources.updateResource, { id: busy.resourceId, name: "Renamed", isFungible: false });
    expect((await t.query(api.resources.getResource, { id: busy.resourceId }))?.name).toBe("Renamed");
  });
});
