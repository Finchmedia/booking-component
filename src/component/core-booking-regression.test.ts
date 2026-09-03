/// <reference types="vite/client" />
/**
 * Regression cover for the CORE booking surface — the functions the host app
 * calls on every booking flow, which the SCHDROM hardening port touched only
 * incidentally. Everything here is about drift: exact return shapes, exact
 * error strings, which guard fires first, and what each write path leaves in
 * `daily_availability` / `booking_history`.
 *
 * Areas:
 * - the legacy actor path (createReservation / cancelReservation)
 * - booking lookups and listBookings filters
 * - the unauthenticated token surface (getBookingByToken /
 *   cancelBookingByToken / rescheduleBookingByToken)
 * - expireProvisionalBooking
 * - getAvailability(start, end)
 * - event type CRUD and resource CRUD basics
 *
 * Slot arithmetic: `daily_availability.busySlots` are UTC 15-minute indices,
 * so 09:00–10:00 UTC == [36, 37, 38, 39] and 14:00–15:00 UTC == [56..59].
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  ORG,
  TUESDAY,
  TZ,
  book,
  getBusySlots,
  range,
  seedResource,
  setup,
  utc,
  type SeededResource,
  type T,
} from "./setup.test.js";

const RESOURCE = "res-1";
const EVENT = "et-1";
const AT = (time: string) => utc(TUESDAY, time);

let t: T;

beforeEach(() => {
  // Fresh backend + frozen clock per test; setup() drains the booking hooks
  // (→ e-mail mutations, which log "[emails] No resendApiKey provided") at the end.
  ({ t } = setup());
});

/** `createReservation` on the seeded resource (legacy, actor-based path). */
const reserve = (start: number, end: number, actorId = "ops@example.com") =>
  t.mutation(api.public.createReservation, {
    resourceId: RESOURCE,
    actorId,
    start,
    end,
  });

/** A provisional hold on the seeded resource. */
const hold = (seed: SeededResource, start: number, end: number) =>
  t.mutation(api.public.createProvisionalBooking, {
    eventTypeId: seed.eventTypeId,
    resourceId: seed.resourceId,
    start,
    end,
    timezone: seed.timezone,
    booker: BOOKER,
    location: LOCATION,
  });

const busy = (date = TUESDAY, resourceId = RESOURCE) => getBusySlots(t, resourceId, date);

const history = (bookingId: Id<"bookings">) =>
  t.query(api.hooks.getBookingHistory, { bookingId });

const availability = (start: number, end: number, resourceId = RESOURCE) =>
  t.query(api.public.getAvailability, { resourceId, start, end });

/** An `Id<"bookings">` whose document is gone (booking created, then wiped). */
async function staleBookingId(seed: SeededResource): Promise<Id<"bookings">> {
  const doomed = await book(t, seed, AT("22:00"), AT("22:30"));
  const id = doomed!._id;
  await t.mutation(api.maintenance.wipeAllBookingData, {});
  return id;
}

// ============================================
// createReservation / cancelReservation (legacy actor path)
// ============================================

describe("createReservation", () => {
  test("writes the legacy booking snapshot and holds the slots", async () => {
    const seed = await seedResource(t);
    const reservationId = await reserve(AT("09:00"), AT("10:00"));

    const booking = await t.query(api.public.getBooking, { bookingId: reservationId });
    expect(booking).toMatchObject({
      resourceId: seed.resourceId,
      status: "confirmed",
      // Legacy placeholders: no event type, no timezone, no real booker.
      eventTypeId: "legacy",
      timezone: "UTC",
      actorId: "ops@example.com",
      bookerEmail: "ops@example.com",
      bookerName: "Legacy Booker",
      eventTitle: "Legacy Booking",
      location: { type: "unknown" },
      start: AT("09:00"),
      end: AT("10:00"),
    });
    expect(booking!.uid.startsWith("legacy_")).toBe(true);
    // No management token → the token surface is closed for legacy rows.
    expect(booking!.managementToken).toBeUndefined();
    await expect(
      t.query(api.public.getBookingByToken, { uid: booking!.uid, token: "" })
    ).rejects.toThrow("Invalid token");

    // Reachable through the uid index like any other booking …
    expect((await t.query(api.public.getBookingByUid, { uid: booking!.uid }))?._id).toBe(
      reservationId
    );
    // … but it records no history row (unlike createBooking).
    expect(await history(reservationId)).toEqual([]);
    expect(await busy()).toEqual(range(36, 40));
  });

  test("rejects an overlapping reservation and merges a neighbouring one into the same day row", async () => {
    const seed = await seedResource(t);
    await reserve(AT("09:00"), AT("10:00"));

    await expect(reserve(AT("09:30"), AT("10:30"))).rejects.toThrow(
      "Resource is not available for the requested time range."
    );
    // The modern path sees the same hold, with its own message.
    await expect(book(t, seed, AT("09:00"), AT("10:00"))).rejects.toThrow(
      "Time slot no longer available"
    );
    expect(await busy()).toEqual(range(36, 40));

    // An adjacent range merges into the existing day row, kept ascending.
    await reserve(AT("10:00"), AT("11:00"));
    expect(await busy()).toEqual(range(36, 44));
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toHaveLength(2);
  });
});

describe("cancelReservation", () => {
  test("frees the slots, keeps the day row and never releases a later holder's slots", async () => {
    const seed = await seedResource(t);
    const reservationId = await reserve(AT("09:00"), AT("10:00"));

    // First cancel: slots released, reported as a fresh cancellation.
    expect(await t.mutation(api.public.cancelReservation, { reservationId })).toEqual({
      success: true,
      alreadyCancelled: false,
    });
    const cancelled = await t.query(api.public.getBooking, { bookingId: reservationId });
    expect(cancelled!.status).toBe("cancelled");
    // The legacy path only patches `status` — no cancelledAt / reason / history.
    expect(cancelled!.cancelledAt).toBeUndefined();
    expect(cancelled!.cancellationReason).toBeUndefined();
    expect(await history(reservationId)).toEqual([]);
    // The row survives as an empty bitmap (not deleted, not null).
    expect(await busy()).toEqual([]);
    expect(await availability(AT("09:00"), AT("10:00"))).toBe(true);

    // Someone else takes the freed range …
    const successor = await book(t, seed, AT("09:00"), AT("10:00"));
    expect(await busy()).toEqual(range(36, 40));

    // … and cancelling the old reservation a second time returns early instead
    // of subtracting the successor's slots.
    expect(await t.mutation(api.public.cancelReservation, { reservationId })).toEqual({
      success: true,
      alreadyCancelled: true,
    });
    expect(await busy()).toEqual(range(36, 40));
    expect((await t.query(api.public.getBooking, { bookingId: successor!._id }))?.status).toBe(
      "confirmed"
    );
  });

  test("unknown ids: cancelReservation throws, the read paths return null", async () => {
    const seed = await seedResource(t);
    const stale = await staleBookingId(seed);

    await expect(
      t.mutation(api.public.cancelReservation, { reservationId: stale })
    ).rejects.toThrow("Reservation not found");
    expect(await t.query(api.public.getBooking, { bookingId: stale })).toBeNull();
    expect(await t.query(api.public.getBookingByUid, { uid: "bk_does_not_exist" })).toBeNull();
  });
});

// ============================================
// listBookings
// ============================================

describe("listBookings", () => {
  test("hides provisional holds unless a status filter asks for them", async () => {
    const seed = await seedResource(t);
    const confirmed = await book(t, seed, AT("09:00"), AT("10:00"));
    const provisional = await hold(seed, AT("11:00"), AT("12:00"));
    expect(provisional!.status).toBe("provisional");

    expect((await t.query(api.public.listBookings, {})).map((b) => b.uid)).toEqual([
      confirmed!.uid,
    ]);
    expect(
      (await t.query(api.public.listBookings, { resourceId: RESOURCE })).map((b) => b.uid)
    ).toEqual([confirmed!.uid]);
    expect(
      (await t.query(api.public.listBookings, { status: "provisional" })).map((b) => b.uid)
    ).toEqual([provisional!.uid]);
    expect(
      (await t.query(api.public.listBookings, { status: "confirmed" })).map((b) => b.uid)
    ).toEqual([confirmed!.uid]);

    // Once expired the hold becomes a normal cancelled row and is listable.
    await t.mutation(api.public.expireProvisionalBooking, { bookingId: provisional!._id });
    expect(
      (await t.query(api.public.listBookings, { status: "cancelled" })).map((b) => b.uid)
    ).toEqual([provisional!.uid]);
    // …and it now shows up unfiltered too, because its status is no longer provisional.
    expect((await t.query(api.public.listBookings, {})).map((b) => b.uid).sort()).toEqual(
      [confirmed!.uid, provisional!.uid].sort()
    );
  });

  test("filters by resource / event type / window and applies the limit after the descending sort", async () => {
    const one = await seedResource(t);
    const two = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });

    const early = await book(t, one, AT("09:00"), AT("10:00"));
    const late = await book(t, one, AT("11:00"), AT("12:00"));
    const other = await book(t, two, AT("13:00"), AT("14:00"));

    // Newest first.
    expect(
      (await t.query(api.public.listBookings, { resourceId: RESOURCE })).map((b) => b.uid)
    ).toEqual([late!.uid, early!.uid]);
    expect(
      (await t.query(api.public.listBookings, { eventTypeId: "et-2" })).map((b) => b.uid)
    ).toEqual([other!.uid]);

    // dateFrom / dateTo compare against `start` (inclusive on both ends).
    expect(
      (
        await t.query(api.public.listBookings, {
          resourceId: RESOURCE,
          dateFrom: AT("11:00"),
        })
      ).map((b) => b.uid)
    ).toEqual([late!.uid]);
    expect(
      (
        await t.query(api.public.listBookings, {
          resourceId: RESOURCE,
          dateTo: AT("09:00"),
        })
      ).map((b) => b.uid)
    ).toEqual([early!.uid]);
    expect(
      await t.query(api.public.listBookings, {
        resourceId: RESOURCE,
        dateFrom: AT("09:30"),
        dateTo: AT("10:30"),
      })
    ).toEqual([]);

    // The limit is applied last, so it keeps the newest rows.
    expect(
      (await t.query(api.public.listBookings, { resourceId: RESOURCE, limit: 1 })).map(
        (b) => b.uid
      )
    ).toEqual([late!.uid]);
  });

  // createBooking stamps the event type's organizationId on the booking (the
  // same scope the hooks receive) so the by_org index finds it.
  test("scopes bookings to an organization", async () => {
    const seed = await seedResource(t);
    const booking = await book(t, seed, AT("09:00"), AT("10:00"));

    expect(
      (await t.query(api.public.listBookings, { organizationId: ORG })).map((b) => b.uid)
    ).toEqual([booking!.uid]);
    expect(booking!.organizationId).toBe(ORG);
  });

  // One id picks the index, the others still narrow the result.
  test("combines the resource and event type filters", async () => {
    const one = await seedResource(t);
    const two = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    const first = await book(t, one, AT("09:00"), AT("10:00"));
    await book(t, two, AT("09:00"), AT("10:00"));

    // res-1 has no et-2 booking, so the intersection must be empty.
    expect(
      await t.query(api.public.listBookings, { resourceId: RESOURCE, eventTypeId: "et-2" })
    ).toEqual([]);
    expect(
      (
        await t.query(api.public.listBookings, { resourceId: RESOURCE, eventTypeId: EVENT })
      ).map((b) => b.uid)
    ).toEqual([first!.uid]);
    // The org index is the most specific one; the resource filter still applies.
    expect(
      (await t.query(api.public.listBookings, { organizationId: ORG, resourceId: "res-2" })).map(
        (b) => b.resourceId
      )
    ).toEqual(["res-2"]);
    expect(await t.query(api.public.listBookings, { organizationId: ORG })).toHaveLength(2);
  });
});

// ============================================
// Token surface
// ============================================

describe("getBookingByToken", () => {
  test("every booking gets its own management token and the check is exact", async () => {
    const seed = await seedResource(t);
    const first = await book(t, seed, AT("09:00"), AT("10:00"));
    const second = await book(t, seed, AT("11:00"), AT("12:00"));

    expect(first!.uid).not.toBe(second!.uid);
    expect(first!.managementToken).toMatch(/^[0-9a-z]{20,}$/);
    expect(first!.managementToken).not.toBe(second!.managementToken);

    expect(
      (
        await t.query(api.public.getBookingByToken, {
          uid: first!.uid,
          token: first!.managementToken!,
        })
      )._id
    ).toBe(first!._id);

    // Another booking's token, a truncated token and an upper-cased token all fail.
    await expect(
      t.query(api.public.getBookingByToken, {
        uid: first!.uid,
        token: second!.managementToken!,
      })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.query(api.public.getBookingByToken, {
        uid: first!.uid,
        token: first!.managementToken!.slice(0, -1),
      })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.query(api.public.getBookingByToken, {
        uid: first!.uid,
        token: first!.managementToken!.toUpperCase(),
      })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.query(api.public.getBookingByToken, {
        uid: "bk_missing",
        token: first!.managementToken!,
      })
    ).rejects.toThrow("Booking not found");
  });
});

describe("cancelBookingByToken", () => {
  test("frees the slots, stamps the default reason and records the transition", async () => {
    const seed = await seedResource(t);
    const booking = await book(t, seed, AT("09:00"), AT("10:00"));

    expect(
      await t.mutation(api.public.cancelBookingByToken, {
        uid: booking!.uid,
        token: booking!.managementToken!,
      })
    ).toEqual({ success: true });

    const cancelled = await t.query(api.public.getBooking, { bookingId: booking!._id });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      cancellationReason: "Cancelled by booker",
      updatedAt: FIXED_NOW,
    });
    expect(
      (await history(booking!._id)).map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy,
        reason: h.reason,
      }))
    ).toEqual([
      { fromStatus: "", toStatus: "confirmed", changedBy: "system", reason: "Booking created" },
      {
        fromStatus: "confirmed",
        toStatus: "cancelled",
        changedBy: "user",
        reason: "Cancelled by booker",
      },
    ]);
    expect(await busy()).toEqual([]);
    // The range is bookable again.
    await expect(book(t, seed, AT("09:00"), AT("10:00"))).resolves.toMatchObject({
      status: "confirmed",
    });

    // Cancelling twice is refused with the current status in the message.
    await expect(
      t.mutation(api.public.cancelBookingByToken, {
        uid: booking!.uid,
        token: booking!.managementToken!,
      })
    ).rejects.toThrow("Cannot cancel booking with status: cancelled");
  });

  test("a custom reason is stored, a wrong token changes nothing and terminal states are refused", async () => {
    const seed = await seedResource(t);
    const booking = await book(t, seed, AT("09:00"), AT("10:00"));

    await expect(
      t.mutation(api.public.cancelBookingByToken, { uid: booking!.uid, token: "nope" })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.mutation(api.public.cancelBookingByToken, {
        uid: "bk_missing",
        token: booking!.managementToken!,
      })
    ).rejects.toThrow("Booking not found");
    expect((await t.query(api.public.getBooking, { bookingId: booking!._id }))?.status).toBe(
      "confirmed"
    );
    expect(await busy()).toEqual(range(36, 40));

    // completed is terminal for the token path, even with the right token.
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: booking!._id,
      toStatus: "completed",
    });
    await expect(
      t.mutation(api.public.cancelBookingByToken, {
        uid: booking!.uid,
        token: booking!.managementToken!,
      })
    ).rejects.toThrow("Cannot cancel booking with status: completed");

    // A second, pending booking cancels with the caller's reason.
    const pendingSeed = await seedResource(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
      requiresConfirmation: true,
    });
    const pending = await book(t, pendingSeed, AT("09:00"), AT("10:00"));
    expect(pending!.status).toBe("pending");
    await t.mutation(api.public.cancelBookingByToken, {
      uid: pending!.uid,
      token: pending!.managementToken!,
      reason: "plans changed",
    });
    expect(
      (await t.query(api.public.getBooking, { bookingId: pending!._id }))?.cancellationReason
    ).toBe("plans changed");
    expect(await busy(TUESDAY, "res-2")).toEqual([]);
  });
});

describe("rescheduleBookingByToken", () => {
  test("issues a new uid, carries the token over and moves the hold", async () => {
    const seed = await seedResource(t);
    const original = await book(t, seed, AT("09:00"), AT("10:00"));

    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: original!.uid,
      token: original!.managementToken!,
      newStart: AT("14:00"),
      newEnd: AT("15:00"),
    });

    expect(moved!.uid).not.toBe(original!.uid);
    expect(moved).toMatchObject({
      status: "confirmed",
      rescheduleUid: original!.uid,
      managementToken: original!.managementToken,
      start: AT("14:00"),
      end: AT("15:00"),
      resourceId: seed.resourceId,
      eventTypeId: seed.eventTypeId,
      bookerEmail: BOOKER.email,
      eventTitle: original!.eventTitle,
      location: LOCATION,
    });

    const old = await t.query(api.public.getBooking, { bookingId: original!._id });
    expect(old).toMatchObject({
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      cancellationReason: "Rescheduled to new time",
    });
    // Only the new range is held.
    expect(await busy()).toEqual(range(56, 60));

    // The same token now opens the new booking, and still resolves the old uid.
    expect(
      (
        await t.query(api.public.getBookingByToken, {
          uid: moved!.uid,
          token: original!.managementToken!,
        })
      )._id
    ).toBe(moved!._id);
    expect(
      (
        await t.query(api.public.getBookingByToken, {
          uid: original!.uid,
          token: original!.managementToken!,
        })
      ).status
    ).toBe("cancelled");

    // The superseded uid can no longer be moved.
    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: original!.uid,
        token: original!.managementToken!,
        newStart: AT("16:00"),
        newEnd: AT("17:00"),
      })
    ).rejects.toThrow("Cannot reschedule booking with status: cancelled");
  });

  test("guards: unknown uid, wrong token and an occupied target leave everything in place", async () => {
    const seed = await seedResource(t);
    const mine = await book(t, seed, AT("09:00"), AT("10:00"));
    await book(t, seed, AT("14:00"), AT("15:00")); // foreign holder of the target

    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: "bk_missing",
        token: mine!.managementToken!,
        newStart: AT("11:00"),
        newEnd: AT("12:00"),
      })
    ).rejects.toThrow("Booking not found");
    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: mine!.uid,
        token: "wrong-token",
        newStart: AT("11:00"),
        newEnd: AT("12:00"),
      })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: mine!.uid,
        token: mine!.managementToken!,
        newStart: AT("14:30"),
        newEnd: AT("15:30"),
      })
    ).rejects.toThrow("Resource is not available for the requested time range");

    expect((await t.query(api.public.getBooking, { bookingId: mine!._id }))?.status).toBe(
      "confirmed"
    );
    expect(await busy()).toEqual([...range(36, 40), ...range(56, 60)]);
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toHaveLength(2);
  });

  // Both reschedule paths share assertValidRange; without it an inverted range
  // released the old slots and reserved none (a "confirmed" booking holding nothing).
  test("refuses an inverted range like createBooking does", async () => {
    const seed = await seedResource(t);
    const booking = await book(t, seed, AT("09:00"), AT("10:00"));

    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: booking!.uid,
        token: booking!.managementToken!,
        newStart: AT("15:00"),
        newEnd: AT("14:00"),
      })
    ).rejects.toThrow("Invalid time range");
    await expect(
      t.mutation(api.public.rescheduleBooking, {
        bookingId: booking!._id,
        newStart: AT("15:00"),
        newEnd: AT("15:00"),
      })
    ).rejects.toThrow("Invalid time range");
    expect(await busy()).toEqual(range(36, 40));
    expect((await t.query(api.public.getBooking, { bookingId: booking!._id }))?.status).toBe(
      "confirmed"
    );
    expect(await t.query(api.public.listBookings, { resourceId: RESOURCE })).toHaveLength(1);
  });

  test("a pending booking stays pending across a token reschedule", async () => {
    const seed = await seedResource(t, { requiresConfirmation: true });
    const pending = await book(t, seed, AT("09:00"), AT("10:00"));
    expect(pending!.status).toBe("pending");

    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: pending!.uid,
      token: pending!.managementToken!,
      newStart: AT("11:00"),
      newEnd: AT("12:00"),
    });
    expect(moved!.status).toBe("pending");
    expect(await busy()).toEqual(range(44, 48));

    // The moved booking can still be approved through the state machine.
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: moved!._id,
      toStatus: "confirmed",
    });
    expect((await t.query(api.public.getBooking, { bookingId: moved!._id }))?.status).toBe(
      "confirmed"
    );
  });
});

// ============================================
// expireProvisionalBooking
// ============================================

describe("expireProvisionalBooking", () => {
  test("expires the hold, frees the slots and records exactly one transition", async () => {
    const seed = await seedResource(t);
    const provisional = await hold(seed, AT("09:00"), AT("10:00"));
    expect(await busy()).toEqual(range(36, 40));

    expect(
      await t.mutation(api.public.expireProvisionalBooking, {
        bookingId: provisional!._id,
        reason: "cart abandoned",
      })
    ).toEqual({ success: true });

    const expired = await t.query(api.public.getBooking, { bookingId: provisional!._id });
    expect(expired).toMatchObject({
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      cancellationReason: "cart abandoned",
      updatedAt: FIXED_NOW,
    });
    expect(
      (await history(provisional!._id)).map((h) => `${h.fromStatus}->${h.toStatus}:${h.reason}`)
    ).toEqual(["->provisional:Provisional booking created", "provisional->cancelled:cart abandoned"]);
    expect(await busy()).toEqual([]);

    // Idempotent: the already-cancelled branch reports success without writing again.
    expect(
      await t.mutation(api.public.expireProvisionalBooking, { bookingId: provisional!._id })
    ).toEqual({ success: true });
    expect(await history(provisional!._id)).toHaveLength(2);

    // Default reason on a second hold.
    const second = await hold(seed, AT("11:00"), AT("12:00"));
    await t.mutation(api.public.expireProvisionalBooking, { bookingId: second!._id });
    expect(
      (await t.query(api.public.getBooking, { bookingId: second!._id }))?.cancellationReason
    ).toBe("Provisional booking expired");
  });

  test("refuses confirmed and pending bookings, and throws for a stale id", async () => {
    const seed = await seedResource(t);
    const confirmed = await book(t, seed, AT("09:00"), AT("10:00"));

    expect(
      await t.mutation(api.public.expireProvisionalBooking, { bookingId: confirmed!._id })
    ).toEqual({ success: false, reason: "Booking is confirmed" });
    expect((await t.query(api.public.getBooking, { bookingId: confirmed!._id }))?.status).toBe(
      "confirmed"
    );
    expect(await busy()).toEqual(range(36, 40));

    const pendingSeed = await seedResource(t, {
      resourceId: "res-2",
      eventTypeId: "et-2",
      requiresConfirmation: true,
    });
    const pending = await book(t, pendingSeed, AT("09:00"), AT("10:00"));
    expect(
      await t.mutation(api.public.expireProvisionalBooking, { bookingId: pending!._id })
    ).toEqual({ success: false, reason: "Booking is pending" });
    expect(await busy(TUESDAY, "res-2")).toEqual(range(36, 40));

    const stale = await staleBookingId(pendingSeed);
    await expect(
      t.mutation(api.public.expireProvisionalBooking, { bookingId: stale })
    ).rejects.toThrow("Booking not found");
  });
});

// ============================================
// getAvailability(start, end)
// ============================================

describe("getAvailability", () => {
  test("is false for every kind of overlap and true for adjacent ranges", async () => {
    const seed = await seedResource(t);
    await book(t, seed, AT("09:00"), AT("10:00")); // slots 36..39

    expect(await availability(AT("09:00"), AT("10:00"))).toBe(false); // exact
    expect(await availability(AT("08:30"), AT("09:15"))).toBe(false); // head overlap
    expect(await availability(AT("09:45"), AT("10:30"))).toBe(false); // tail overlap
    expect(await availability(AT("08:00"), AT("11:00"))).toBe(false); // containing
    expect(await availability(AT("09:15"), AT("09:30"))).toBe(false); // contained
    // Unaligned ranges are widened to whole slots: 09:50–10:10 covers 39 and 40.
    expect(await availability(AT("09:50"), AT("10:10"))).toBe(false);

    expect(await availability(AT("08:00"), AT("09:00"))).toBe(true); // ends where it starts
    expect(await availability(AT("10:00"), AT("11:00"))).toBe(true); // starts where it ends
    // Nothing is written for an unknown resource, so it reads as free.
    expect(await availability(AT("09:00"), AT("10:00"), "ghost")).toBe(true);
    // Degenerate ranges cover no slot at all — the range guard lives in createBooking.
    expect(await availability(AT("09:00"), AT("09:00"))).toBe(true);
    expect(await availability(AT("10:00"), AT("09:00"))).toBe(true);
  });

  test("provisional holds count as busy until they are expired", async () => {
    const seed = await seedResource(t);
    const provisional = await hold(seed, AT("13:00"), AT("14:00"));
    expect(await availability(AT("13:00"), AT("14:00"))).toBe(false);

    await t.mutation(api.public.expireProvisionalBooking, { bookingId: provisional!._id });
    expect(await availability(AT("13:00"), AT("14:00"))).toBe(true);

    // A cancelled confirmed booking gives its range back the same way.
    const booking = await book(t, seed, AT("13:00"), AT("14:00"));
    expect(await availability(AT("13:00"), AT("14:00"))).toBe(false);
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: booking!._id,
      toStatus: "cancelled",
    });
    expect(await availability(AT("13:00"), AT("14:00"))).toBe(true);
  });
});

// ============================================
// Event type CRUD
// ============================================

type EventTypeOverrides = { slug?: string; title?: string; lengthInMinutes?: number };

const eventTypeArgs = (id: string, over: EventTypeOverrides = {}) => ({
  id,
  slug: id,
  title: `Event ${id}`,
  lengthInMinutes: 30,
  timezone: TZ,
  lockTimeZoneToggle: false,
  locations: [],
  organizationId: ORG,
  ...over,
});

describe("event type CRUD", () => {
  test("createEventType upserts by external id, keeps createdAt and never clears omitted fields", async () => {
    const first = await t.mutation(api.public.createEventType, {
      ...eventTypeArgs("et-x"),
      description: "first draft",
      requiresConfirmation: true,
    });

    vi.setSystemTime(FIXED_NOW + 60_000);
    const second = await t.mutation(api.public.createEventType, {
      ...eventTypeArgs("et-x", { slug: "x-renamed", title: "Renamed", lengthInMinutes: 45 }),
    });
    expect(second).toBe(first);

    const stored = await t.query(api.public.getEventType, { eventTypeId: "et-x" });
    expect(stored).toMatchObject({
      slug: "x-renamed",
      title: "Renamed",
      lengthInMinutes: 45,
      isActive: true,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW + 60_000,
      // Fields absent from the second call keep their old values (patch, not replace).
      description: "first draft",
      requiresConfirmation: true,
    });
    expect(await t.query(api.public.listEventTypes, {})).toHaveLength(1);
    await expect(t.query(api.public.getEventType, { eventTypeId: "ghost" })).rejects.toThrow(
      "Event type not found: ghost"
    );
  });

  test("getEventTypeBySlug and listEventTypes scope by organization and active flag", async () => {
    await t.mutation(api.public.createEventType, eventTypeArgs("et-a", { slug: "shared" }));
    await t.mutation(api.public.createEventType, {
      ...eventTypeArgs("et-b", { slug: "shared" }),
      organizationId: "org-2",
    });
    await t.mutation(api.public.createEventType, eventTypeArgs("et-c"));
    await t.mutation(api.public.toggleEventTypeActive, { id: "et-c", isActive: false });

    expect(
      (await t.query(api.public.getEventTypeBySlug, { slug: "shared", organizationId: "org-2" }))
        ?.id
    ).toBe("et-b");
    expect(
      (await t.query(api.public.getEventTypeBySlug, { slug: "shared", organizationId: ORG }))?.id
    ).toBe("et-a");
    // Without an organization the first row of the slug index wins.
    expect((await t.query(api.public.getEventTypeBySlug, { slug: "shared" }))?.id).toBe("et-a");
    expect(await t.query(api.public.getEventTypeBySlug, { slug: "ghost" })).toBeNull();
    expect(
      await t.query(api.public.getEventTypeBySlug, { slug: "shared", organizationId: "org-3" })
    ).toBeNull();
    // An inactive event type is still resolvable by slug (the caller decides).
    expect((await t.query(api.public.getEventTypeBySlug, { slug: "et-c" }))?.isActive).toBe(false);

    expect(
      (await t.query(api.public.listEventTypes, { organizationId: ORG })).map((e) => e.id).sort()
    ).toEqual(["et-a", "et-c"]);
    expect(
      (await t.query(api.public.listEventTypes, { organizationId: ORG, activeOnly: true })).map(
        (e) => e.id
      )
    ).toEqual(["et-a"]);
    expect(await t.query(api.public.listEventTypes, {})).toHaveLength(3);
    expect(
      await t.query(api.public.listEventTypes, { organizationId: "org-unknown" })
    ).toEqual([]);
  });

  test("updateEventType patches only the fields it is given and rejects unknown ids", async () => {
    const seed = await seedResource(t);
    const before = await t.query(api.public.getEventType, { eventTypeId: EVENT });

    vi.setSystemTime(FIXED_NOW + 30_000);
    const docId = await t.mutation(api.public.updateEventType, {
      id: EVENT,
      title: "Renamed",
      requiresConfirmation: true,
    });
    expect(docId).toBe(before!._id);

    const after = await t.query(api.public.getEventType, { eventTypeId: EVENT });
    expect(after).toMatchObject({
      title: "Renamed",
      requiresConfirmation: true,
      // untouched
      slug: before!.slug,
      lengthInMinutes: before!.lengthInMinutes,
      slotInterval: before!.slotInterval,
      timezone: before!.timezone,
      createdAt: before!.createdAt,
      updatedAt: FIXED_NOW + 30_000,
    });
    // The patch is visible to the booking path immediately.
    expect((await book(t, seed, AT("09:00"), AT("10:00")))?.status).toBe("pending");

    await expect(
      t.mutation(api.public.updateEventType, { id: "ghost", title: "x" })
    ).rejects.toThrow('Event type "ghost" not found');
  });

  test("toggleEventTypeActive closes both write paths and reports the users in the flow", async () => {
    const seed = await seedResource(t);

    expect(await t.mutation(api.public.toggleEventTypeActive, { id: EVENT, isActive: false })).toEqual(
      { success: true, affectedUsers: 0 }
    );
    await expect(book(t, seed, AT("09:00"), AT("10:00"))).rejects.toThrow(
      "Event type is no longer active"
    );
    await expect(hold(seed, AT("09:00"), AT("10:00"))).rejects.toThrow(
      "Event type is no longer active"
    );
    expect(await busy()).toBeNull();
    // Availability queries do not consult the flag — the guard is on the writes.
    expect(
      await t.query(api.public.getDaySlots, {
        resourceId: RESOURCE,
        date: TUESDAY,
        eventLength: 60,
        slotInterval: 60,
      })
    ).not.toEqual([]);

    // Users sitting in the flow are counted (deduplicated per user), not blocked.
    await t.mutation(api.presence.heartbeat, {
      resourceId: RESOURCE,
      slots: [`${TUESDAY}T09:00:00.000Z`, `${TUESDAY}T09:30:00.000Z`],
      user: "user-a",
      eventTypeId: EVENT,
    });
    await t.mutation(api.presence.heartbeat, {
      resourceId: RESOURCE,
      slots: [`${TUESDAY}T09:00:00.000Z`],
      user: "user-b",
      eventTypeId: EVENT,
    });
    expect(await t.mutation(api.public.toggleEventTypeActive, { id: EVENT, isActive: true })).toEqual(
      { success: true, affectedUsers: 2 }
    );
    expect((await book(t, seed, AT("09:00"), AT("10:00")))?.status).toBe("confirmed");

    await expect(
      t.mutation(api.public.toggleEventTypeActive, { id: "ghost", isActive: false })
    ).rejects.toThrow('Event type "ghost" not found');
  });

  test("deleteEventType refuses while any booking row exists, even a cancelled one", async () => {
    const seed = await seedResource(t);
    await t.mutation(api.public.createEventType, eventTypeArgs("et-unused"));

    // Unused event type: gone, and unreadable afterwards.
    expect(await t.mutation(api.public.deleteEventType, { id: "et-unused" })).toEqual({
      success: true,
    });
    await expect(t.query(api.public.getEventType, { eventTypeId: "et-unused" })).rejects.toThrow(
      "Event type not found: et-unused"
    );
    await expect(t.mutation(api.public.deleteEventType, { id: "et-unused" })).rejects.toThrow(
      'Event type "et-unused" not found'
    );

    const booking = await book(t, seed, AT("09:00"), AT("10:00"));
    await expect(t.mutation(api.public.deleteEventType, { id: EVENT })).rejects.toThrow(
      "Cannot delete event type with existing bookings. Deactivate it instead."
    );

    // Cancelling does not remove the row, so the guard still fires …
    await t.mutation(api.public.cancelBookingByToken, {
      uid: booking!.uid,
      token: booking!.managementToken!,
    });
    await expect(t.mutation(api.public.deleteEventType, { id: EVENT })).rejects.toThrow(
      "Cannot delete event type with existing bookings. Deactivate it instead."
    );

    // … until the booking rows are actually gone.
    await t.mutation(api.maintenance.wipeAllBookingData, {});
    expect(await t.mutation(api.public.deleteEventType, { id: EVENT })).toEqual({ success: true });
  });
});

// ============================================
// Resource CRUD
// ============================================

describe("resource CRUD", () => {
  test("toggleResourceActive closes the modern write paths and counts holders", async () => {
    const seed = await seedResource(t);

    expect(await t.mutation(api.resources.toggleResourceActive, { id: RESOURCE, isActive: false })).toEqual(
      { success: true, affectedUsers: 0 }
    );
    expect((await t.query(api.resources.getResource, { id: RESOURCE }))?.isActive).toBe(false);
    await expect(book(t, seed, AT("09:00"), AT("10:00"))).rejects.toThrow(
      "Resource is no longer active"
    );
    await expect(hold(seed, AT("09:00"), AT("10:00"))).rejects.toThrow(
      "Resource is no longer active"
    );
    // The legacy actor path has no active check — it still reserves.
    await reserve(AT("09:00"), AT("10:00"));
    expect(await busy()).toEqual(range(36, 40));

    // listResources honours the flag only when asked to.
    expect(await t.query(api.resources.listResources, { organizationId: ORG })).toHaveLength(1);
    expect(
      await t.query(api.resources.listResources, { organizationId: ORG, activeOnly: true })
    ).toEqual([]);

    await t.mutation(api.presence.heartbeat, {
      resourceId: RESOURCE,
      slots: [`${TUESDAY}T11:00:00.000Z`, `${TUESDAY}T11:30:00.000Z`],
      user: "user-a",
    });
    expect(await t.mutation(api.resources.toggleResourceActive, { id: RESOURCE, isActive: true })).toEqual(
      { success: true, affectedUsers: 1 }
    );
    expect((await book(t, seed, AT("11:00"), AT("12:00")))?.status).toBe("confirmed");

    await expect(
      t.mutation(api.resources.toggleResourceActive, { id: "ghost", isActive: false })
    ).rejects.toThrow('Resource "ghost" not found');
  });

  test("deleteResource refuses while bookings exist and leaves the links of a deleted resource behind", async () => {
    const seed = await seedResource(t);
    const spare = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    const booking = await book(t, seed, AT("09:00"), AT("10:00"));

    await expect(t.mutation(api.resources.deleteResource, { id: RESOURCE })).rejects.toThrow(
      "Cannot delete resource with existing bookings. Deactivate it instead."
    );
    await t.mutation(api.public.cancelBookingByToken, {
      uid: booking!.uid,
      token: booking!.managementToken!,
    });
    // A cancelled booking is still a booking row.
    await expect(t.mutation(api.resources.deleteResource, { id: RESOURCE })).rejects.toThrow(
      "Cannot delete resource with existing bookings. Deactivate it instead."
    );

    // The never-booked resource can go.
    expect(await t.mutation(api.resources.deleteResource, { id: spare.resourceId })).toEqual({
      success: true,
    });
    expect(await t.query(api.resources.getResource, { id: spare.resourceId })).toBeNull();
    expect(
      (await t.query(api.resources.listResources, { organizationId: ORG })).map((r) => r.id)
    ).toEqual([RESOURCE]);
    // Deleting does not cascade: the link row survives (callers use deleteAllLinksForResource).
    expect(
      await t.query(api.resource_event_types.getEventTypeIdsForResource, {
        resourceId: spare.resourceId,
      })
    ).toEqual(["et-2"]);

    await expect(t.mutation(api.resources.deleteResource, { id: "ghost" })).rejects.toThrow(
      'Resource "ghost" not found'
    );
  });
});
