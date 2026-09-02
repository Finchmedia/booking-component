/// <reference types="vite/client" />
// Regression coverage for src/component/multi_resource.ts and
// src/component/presence.ts.
//
// Fixture (seedStudio): one room (bitmap resource, also the schedule owner),
// one fungible microphone pool (quantity 2, isStandalone false) and one
// non-fungible keyboard, all linked to the same event type. Bookings run on
// Tuesday 2027-03-09; Europe/Berlin is UTC+1 that week, so 10:00–11:00 local
// is 09:00–10:00 UTC = UTC slot indices 36..39.
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  FIXED_NOW,
  LOCATION,
  TUESDAY,
  TZ,
  berlin,
  book,
  drain,
  getBusySlots,
  listDaySlots,
  range,
  seedFungibleResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type SeededSchedule,
  type T,
} from "./setup.test.js";

// ============================================
// FIXTURE
// ============================================

const ROOM = "room-1";
const MIC = "mic-1";
const KEYBOARD = "kbd-1";

/** 10:00–11:00 Europe/Berlin on the fixture Tuesday = 09:00–10:00 UTC = slots 36..39. */
const START = berlin(TUESDAY, "10:00");
const END = berlin(TUESDAY, "11:00");
/** The next hour, 11:00–12:00 local = slots 40..43. */
const LATER_START = berlin(TUESDAY, "11:00");
const LATER_END = berlin(TUESDAY, "12:00");

type ResourceRequest = { resourceId: string; quantity?: number };

/**
 * Room (+ schedule + event type, from the harness) plus a pooled microphone
 * (quantity 2, `isStandalone: false`) and a plain keyboard, both linked to the
 * room's event type.
 */
async function seedStudio(
  t: T,
  opts: { requiresConfirmation?: boolean } = {}
): Promise<SeededSchedule> {
  const seed = await seedResourceWithSchedule(t, {
    resourceId: ROOM,
    requiresConfirmation: opts.requiresConfirmation,
  });
  await seedFungibleResource(t, {
    resourceId: MIC,
    quantity: 2,
    organizationId: seed.organizationId,
    timezone: seed.timezone,
    eventTypeId: seed.eventTypeId,
    resource: { name: "Microphone", isStandalone: false },
  });
  await t.mutation(api.resources.createResource, {
    id: KEYBOARD,
    organizationId: seed.organizationId,
    name: "Keyboard",
    type: "equipment",
    timezone: seed.timezone,
  });
  await t.mutation(api.resource_event_types.linkResourceToEventType, {
    resourceId: KEYBOARD,
    eventTypeId: seed.eventTypeId,
  });
  return seed;
}

function checkAvailability(
  t: T,
  resources: ResourceRequest[],
  start = START,
  end = END
) {
  return t.query(api.multi_resource.checkMultiResourceAvailability, {
    resources,
    start,
    end,
  });
}

function bookMulti(
  t: T,
  seed: SeededSchedule,
  resources: ResourceRequest[],
  start = START,
  end = END
): Promise<Doc<"bookings"> | null> {
  return t.mutation(api.multi_resource.createMultiResourceBooking, {
    eventTypeId: seed.eventTypeId,
    organizationId: seed.organizationId,
    resources,
    start,
    end,
    timezone: seed.timezone,
    booker: BOOKER,
    location: LOCATION,
  });
}

/** Raw `quantity_availability.slotQuantities` of a pooled resource (`null` = no row). */
function pooled(
  t: T,
  resourceId: string,
  date = TUESDAY
): Promise<Record<string, number> | null> {
  return t.run(async (ctx) => {
    const doc = await ctx.db
      .query("quantity_availability")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", resourceId).eq("date", date)
      )
      .unique();
    return doc ? ((doc.slotQuantities ?? {}) as Record<string, number>) : null;
  });
}

/** `{ "36": n, … }` over `slots` — the shape `quantity_availability` stores. */
const quantityMap = (slots: number[], booked: number): Record<string, number> =>
  Object.fromEntries(slots.map((slot) => [String(slot), booked]));

/** A syntactically valid `Id<"bookings">` that points at nothing. */
function danglingBookingId(t: T): Promise<Id<"bookings">> {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert("bookings", {
      resourceId: ROOM,
      actorId: BOOKER.email,
      start: START,
      end: END,
      status: "confirmed",
      uid: "bk_ghost",
      eventTypeId: "et-1",
      timezone: TZ,
      bookerName: BOOKER.name,
      bookerEmail: BOOKER.email,
      eventTitle: "Ghost",
      location: { type: "address" },
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    await ctx.db.delete(id);
    return id;
  });
}

// ============================================
// (a) CHECK → BOOK → ITEMS
// ============================================

describe("multi-resource: availability check", () => {
  test("reports every requested resource with its own capacity and conflicts", async () => {
    const { t } = setup();
    await seedStudio(t);

    const request: ResourceRequest[] = [
      { resourceId: ROOM },
      { resourceId: MIC, quantity: 1 },
      { resourceId: KEYBOARD },
    ];
    expect(await checkAvailability(t, request)).toEqual({
      available: true,
      resources: [
        // Bitmap resources report capacity 1; the pool reports its full quantity.
        {
          resourceId: ROOM,
          available: true,
          requestedQuantity: 1,
          availableQuantity: 1,
          conflicts: [],
        },
        {
          resourceId: MIC,
          available: true,
          requestedQuantity: 1,
          availableQuantity: 2,
          conflicts: [],
        },
        {
          resourceId: KEYBOARD,
          available: true,
          requestedQuantity: 1,
          availableQuantity: 1,
          conflicts: [],
        },
      ],
    });
  });

  test("asking a pool for more than it owns fails the check without any booking", async () => {
    const { t } = setup();
    await seedStudio(t);

    const overdrawn = await checkAvailability(t, [{ resourceId: MIC, quantity: 3 }]);
    expect(overdrawn.available).toBe(false);
    expect(overdrawn.resources[0]).toEqual({
      resourceId: MIC,
      available: false,
      requestedQuantity: 3,
      // Nothing is booked yet: the pool still has all 2 units free…
      availableQuantity: 2,
      // …but every slot of the window is a conflict for a 3-unit request.
      conflicts: range(36, 40),
    });
    expect(await pooled(t, MIC)).toBeNull();
  });

  test("a bitmap conflict zeroes the capacity and lists only the overlapping slots", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    // A plain single-resource booking writes the same daily_availability bitmap
    // the multi-resource check reads.
    await book(t, seed, START, END);

    // 10:30–11:30 local overlaps the booked hour in slots 38, 39 only.
    const overlap = await checkAvailability(
      t,
      [{ resourceId: ROOM }],
      berlin(TUESDAY, "10:30"),
      berlin(TUESDAY, "11:30")
    );
    expect(overlap.available).toBe(false);
    expect(overlap.resources[0]).toEqual({
      resourceId: ROOM,
      available: false,
      requestedQuantity: 1,
      availableQuantity: 0,
      conflicts: [38, 39],
    });

    // The untouched neighbouring hour is still free.
    expect(await checkAvailability(t, [{ resourceId: ROOM }], LATER_START, LATER_END))
      .toMatchObject({ available: true });
  });

  test("unknown resource ids are reported as free single-unit resources", async () => {
    const { t } = setup();
    await seedStudio(t);

    // No existence check at this layer: an id nobody created reads as an empty
    // bitmap resource. Locked in so adding a lookup guard is a deliberate change.
    expect(await checkAvailability(t, [{ resourceId: "nope" }])).toEqual({
      available: true,
      resources: [
        {
          resourceId: "nope",
          available: true,
          requestedQuantity: 1,
          availableQuantity: 1,
          conflicts: [],
        },
      ],
    });
  });

  test("a fungible resource with quantity 1 uses the bitmap path, not the pool", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    // isFungible is only honoured together with quantity > 1.
    await seedFungibleResource(t, {
      resourceId: "solo-pool",
      quantity: 1,
      organizationId: seed.organizationId,
      timezone: seed.timezone,
      eventTypeId: seed.eventTypeId,
    });

    await bookMulti(t, seed, [{ resourceId: "solo-pool" }]);
    expect(await pooled(t, "solo-pool")).toBeNull();
    expect(await getBusySlots(t, "solo-pool", TUESDAY)).toEqual(range(36, 40));
    expect(await checkAvailability(t, [{ resourceId: "solo-pool" }])).toMatchObject({
      available: false,
      resources: [{ availableQuantity: 0, conflicts: range(36, 40) }],
    });
  });
});

describe("multi-resource: createMultiResourceBooking", () => {
  test("books room, pool and keyboard together and getBookingWithItems lists them", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);

    const booking = await bookMulti(t, seed, [
      { resourceId: ROOM },
      { resourceId: MIC, quantity: 1 },
      { resourceId: KEYBOARD },
    ]);
    expect(booking).toMatchObject({
      status: "confirmed",
      // The first requested resource becomes the booking's primary resource.
      resourceId: ROOM,
      eventTypeId: seed.eventTypeId,
      organizationId: seed.organizationId,
      start: START,
      end: END,
      timezone: seed.timezone,
      actorId: BOOKER.email,
      bookerName: BOOKER.name,
      bookerEmail: BOOKER.email,
      eventTitle: "Consultation",
      location: LOCATION,
    });
    expect(booking?.uid).toMatch(/^bk_/);
    expect(booking?.managementToken).toEqual(expect.any(String));
    expect(booking!.managementToken!.length).toBeGreaterThan(32);

    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: booking!._id,
    });
    expect(withItems?.items.map((item) => [item.resourceId, item.quantity])).toEqual([
      [ROOM, 1],
      [MIC, 1],
      [KEYBOARD, 1],
    ]);
    // Each item carries the resolved resource document.
    expect(withItems?.items.map((item) => item.resource?.name)).toEqual([
      `Resource ${ROOM}`,
      "Microphone",
      "Keyboard",
    ]);
    expect(withItems?.items[1].resource).toMatchObject({
      isFungible: true,
      quantity: 2,
      isStandalone: false,
    });

    // Bitmap resources go to daily_availability, the pool to quantity_availability.
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual(range(36, 40));
    expect(await getBusySlots(t, KEYBOARD, TUESDAY)).toEqual(range(36, 40));
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 1));
    expect(await getBusySlots(t, MIC, TUESDAY)).toBeNull();

    // The room's hour disappears from the schedule-aware day view.
    expect(await listDaySlots(t, seed)).not.toContain(new Date(START).toISOString());

    const history = await t.query(api.hooks.getBookingHistory, {
      bookingId: booking!._id,
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "",
      toStatus: "confirmed",
      changedBy: "system",
      reason: "Booking created",
    });
  });

  test("requiresConfirmation makes the multi-resource booking pending but still reserves", async () => {
    const { t } = setup();
    const seed = await seedStudio(t, { requiresConfirmation: true });

    const booking = await bookMulti(t, seed, [
      { resourceId: ROOM },
      { resourceId: MIC, quantity: 2 },
    ]);
    expect(booking?.status).toBe("pending");
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual(range(36, 40));
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 2));

    const history = await t.query(api.hooks.getBookingHistory, {
      bookingId: booking!._id,
    });
    expect(history[0]).toMatchObject({ fromStatus: "", toStatus: "pending" });
  });

  test("an unknown event type is rejected by id", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);

    await expect(
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: "ghost-event",
        resources: [{ resourceId: ROOM }],
        start: START,
        end: END,
        timezone: seed.timezone,
        booker: BOOKER,
      })
    ).rejects.toThrow('Event type "ghost-event" not found');
    expect(await getBusySlots(t, ROOM, TUESDAY)).toBeNull();
  });

  test("a busy bitmap resource is rejected with the selected-time error", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    await bookMulti(t, seed, [{ resourceId: ROOM }, { resourceId: MIC }]);

    await expect(
      bookMulti(t, seed, [{ resourceId: KEYBOARD }, { resourceId: ROOM }])
    ).rejects.toThrow(`Resource "${ROOM}" is not available for the selected time`);

    // Fail-fast: the keyboard listed before the conflicting room stays untouched.
    expect(await getBusySlots(t, KEYBOARD, TUESDAY)).toBeNull();
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 1));
    expect(
      await t.run(async (ctx) => (await ctx.db.query("bookings").collect()).length)
    ).toBe(1);
  });

  test("spans UTC midnight: both days get their own bitmap and pool rows", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    const start = utc(TUESDAY, "23:30");
    const end = utc("2027-03-10", "00:30");

    const booking = await bookMulti(
      t,
      seed,
      [{ resourceId: ROOM }, { resourceId: MIC, quantity: 2 }],
      start,
      end
    );
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual([94, 95]);
    expect(await getBusySlots(t, ROOM, "2027-03-10")).toEqual([0, 1]);
    expect(await pooled(t, MIC, TUESDAY)).toEqual(quantityMap([94, 95], 2));
    expect(await pooled(t, MIC, "2027-03-10")).toEqual(quantityMap([0, 1], 2));

    // …and the check agrees across the day boundary.
    const busy = await checkAvailability(t, [{ resourceId: MIC }], start, end);
    expect(busy.available).toBe(false);
    expect(busy.resources[0].conflicts).toEqual([94, 95, 0, 1]);

    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking!._id,
    });
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual([]);
    expect(await getBusySlots(t, ROOM, "2027-03-10")).toEqual([]);
    expect(await pooled(t, MIC, TUESDAY)).toEqual(quantityMap([94, 95], 0));
    expect(await pooled(t, MIC, "2027-03-10")).toEqual(quantityMap([0, 1], 0));
  });
});

// ============================================
// (b) POOL EXHAUSTION
// ============================================

describe("multi-resource: pooled quantity", () => {
  test("the microphone takes two holds and rejects the third", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);

    // The pool is booked on its own — see the skipped isStandalone test below.
    await bookMulti(t, seed, [{ resourceId: MIC }]);
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 1));
    expect(await checkAvailability(t, [{ resourceId: MIC }])).toMatchObject({
      available: true,
      resources: [{ availableQuantity: 1, conflicts: [] }],
    });

    await bookMulti(t, seed, [{ resourceId: MIC }]);
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 2));

    const exhausted = await checkAvailability(t, [{ resourceId: MIC }]);
    expect(exhausted.available).toBe(false);
    expect(exhausted.resources[0]).toEqual({
      resourceId: MIC,
      available: false,
      requestedQuantity: 1,
      availableQuantity: 0,
      conflicts: range(36, 40),
    });

    await expect(bookMulti(t, seed, [{ resourceId: MIC }])).rejects.toThrow(
      `Resource "${MIC}" is not available for the requested quantity`
    );
    // The rejected attempt did not increment the counters.
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 2));
    expect(
      await t.run(async (ctx) => (await ctx.db.query("bookings").collect()).length)
    ).toBe(2);
  });

  test("a two-unit request is refused once a single unit is taken", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    await bookMulti(t, seed, [{ resourceId: MIC, quantity: 1 }]);

    await expect(
      bookMulti(t, seed, [{ resourceId: MIC, quantity: 2 }])
    ).rejects.toThrow(`Resource "${MIC}" is not available for the requested quantity`);

    // One unit is still bookable, and the untouched next hour takes two.
    await bookMulti(t, seed, [{ resourceId: MIC, quantity: 1 }]);
    await bookMulti(t, seed, [{ resourceId: MIC, quantity: 2 }], LATER_START, LATER_END);
    expect(await pooled(t, MIC)).toEqual({
      ...quantityMap(range(36, 40), 2),
      ...quantityMap(range(40, 44), 2),
    });
  });

  test("only the overlapping slots of a partially free window block a pooled booking", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    await bookMulti(t, seed, [{ resourceId: MIC, quantity: 2 }]);

    // 10:30–11:30 local overlaps slots 38, 39 (booked) and 40, 41 (free).
    await expect(
      bookMulti(
        t,
        seed,
        [{ resourceId: MIC }],
        berlin(TUESDAY, "10:30"),
        berlin(TUESDAY, "11:30")
      )
    ).rejects.toThrow(`Resource "${MIC}" is not available for the requested quantity`);

    const partial = await checkAvailability(
      t,
      [{ resourceId: MIC }],
      berlin(TUESDAY, "10:30"),
      berlin(TUESDAY, "11:30")
    );
    expect(partial.resources[0].conflicts).toEqual([38, 39]);
    expect(partial.resources[0].availableQuantity).toBe(0);
    // The failed attempt left the free half of the window untouched.
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 2));
  });

  test("a mixed request stops at the exhausted pool and reserves nothing", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    await bookMulti(t, seed, [{ resourceId: MIC, quantity: 2 }], LATER_START, LATER_END);

    // Room is free, the pool is not: the whole mutation must roll back.
    await expect(
      bookMulti(
        t,
        seed,
        [{ resourceId: ROOM }, { resourceId: MIC }],
        LATER_START,
        LATER_END
      )
    ).rejects.toThrow(`Resource "${MIC}" is not available for the requested quantity`);
    expect(await getBusySlots(t, ROOM, TUESDAY)).toBeNull();
    expect(await listDaySlots(t, seed)).toHaveLength(8);
    expect(
      await t.run(async (ctx) => (await ctx.db.query("booking_items").collect()).length)
    ).toBe(1);
  });
});

// ============================================
// (c) CANCELLATION
// ============================================

describe("multi-resource: cancelMultiResourceBooking", () => {
  test("frees pooled quantity and bitmap slots and keeps the items as the record", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    const booking = await bookMulti(t, seed, [
      { resourceId: ROOM },
      { resourceId: MIC, quantity: 2 },
      { resourceId: KEYBOARD },
    ]);

    expect(
      await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
        bookingId: booking!._id,
        reason: "storm",
        cancelledBy: "ada",
      })
    ).toEqual({ success: true });

    const cancelled = await t.query(api.public.getBooking, { bookingId: booking!._id });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancellationReason: "storm",
    });
    expect(cancelled?.cancelledAt).toBe(FIXED_NOW);

    // Bitmap rows are emptied, pooled counters are decremented to zero.
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual([]);
    expect(await getBusySlots(t, KEYBOARD, TUESDAY)).toEqual([]);
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 0));
    expect(await checkAvailability(t, [
      { resourceId: ROOM },
      { resourceId: MIC, quantity: 2 },
      { resourceId: KEYBOARD },
    ])).toMatchObject({ available: true });

    // The hour is offered again and can actually be re-booked.
    expect(await listDaySlots(t, seed)).toContain(new Date(START).toISOString());
    await bookMulti(t, seed, [{ resourceId: ROOM }, { resourceId: MIC, quantity: 2 }]);

    // booking_items survive the cancellation.
    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: booking!._id,
    });
    expect(withItems?.status).toBe("cancelled");
    expect(withItems?.items).toHaveLength(3);

    const history = await t.query(api.hooks.getBookingHistory, {
      bookingId: booking!._id,
    });
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      fromStatus: "confirmed",
      toStatus: "cancelled",
      changedBy: "ada",
      reason: "storm",
    });
  });

  test("records `unknown` when no canceller is given and cancels a pending booking", async () => {
    const { t } = setup();
    const seed = await seedStudio(t, { requiresConfirmation: true });
    const booking = await bookMulti(t, seed, [{ resourceId: MIC, quantity: 2 }]);
    expect(booking?.status).toBe("pending");

    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking!._id,
    });
    const history = await t.query(api.hooks.getBookingHistory, {
      bookingId: booking!._id,
    });
    expect(history[1]).toMatchObject({
      fromStatus: "pending",
      toStatus: "cancelled",
      changedBy: "unknown",
    });
    expect(
      (await t.query(api.public.getBooking, { bookingId: booking!._id }))
        ?.cancellationReason
    ).toBeUndefined();
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 0));
  });

  test("also releases a single-resource booking that has no booking_items", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    const single = await book(t, seed, START, END);
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual(range(36, 40));

    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: single!._id,
      reason: "no items path",
    });
    expect(await getBusySlots(t, ROOM, TUESDAY)).toEqual([]);
    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: single!._id,
    });
    expect(withItems?.items).toEqual([]);
    expect(withItems?.status).toBe("cancelled");
  });

  test("rejects a second cancellation and an unknown booking id", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);
    const booking = await bookMulti(t, seed, [{ resourceId: ROOM }, { resourceId: MIC }]);

    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking!._id,
    });
    await expect(
      t.mutation(api.multi_resource.cancelMultiResourceBooking, {
        bookingId: booking!._id,
      })
    ).rejects.toThrow("Booking is already cancelled");
    // The rejected second cancel did not decrement the pool below zero.
    expect(await pooled(t, MIC)).toEqual(quantityMap(range(36, 40), 0));

    await expect(
      t.mutation(api.multi_resource.cancelMultiResourceBooking, {
        bookingId: await danglingBookingId(t),
      })
    ).rejects.toThrow("Booking not found");
    expect(
      await t.query(api.multi_resource.getBookingWithItems, {
        bookingId: await danglingBookingId(t),
      })
    ).toBeNull();
  });
});

// ============================================
// (d) NON-STANDALONE RESOURCES
// ============================================

describe("multi-resource: standalone constraint", () => {
  // BUG(port-review): `isStandalone: false` ("can't be booked alone", schema.ts:21) is
  // stored by createResource/updateResource but no code path enforces it — booking the
  // microphone pool as the only resource of a multi-resource booking resolves to a
  // confirmed booking instead of rejecting (grep: isStandalone is read nowhere).
  test.skip("a resource marked isStandalone: false cannot be booked on its own", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);

    await expect(bookMulti(t, seed, [{ resourceId: MIC }])).rejects.toThrow(
      /standalone|cannot be booked alone/i
    );
    // Booked together with the room it is fine.
    await bookMulti(t, seed, [{ resourceId: ROOM }, { resourceId: MIC }]);
  });

  // BUG(port-review): createMultiResourceBooking has no `start < end` guard (public.ts
  // createBooking/createProvisionalBooking got one in the hardening port), so an
  // inverted range creates a booking whose getRequiredSlots map is empty and which
  // therefore reserves nothing. Observed: status "confirmed", start > end, 2
  // booking_items, daily_availability(room-1) null, quantity_availability(mic-1) null.
  test.skip("rejects an inverted range like createBooking does", async () => {
    const { t } = setup();
    const seed = await seedStudio(t);

    await expect(
      bookMulti(t, seed, [{ resourceId: ROOM }, { resourceId: MIC }], END, START)
    ).rejects.toThrow("Invalid time range: end must be after start");
  });
});

// ============================================
// (e) PRESENCE
// ============================================

/** ISO slot keys, as the React client sends them (UTC instants). */
const SLOT_A = new Date(START).toISOString(); // 2027-03-09T09:00:00.000Z
const SLOT_B = new Date(LATER_START).toISOString(); // 2027-03-09T10:00:00.000Z
const SLOT_NEXT_DAY = new Date(berlin("2027-03-10", "10:00")).toISOString();
const TIMEOUT_MS = 10_000; // presence.ts TIMEOUT_MS

function presenceRows(t: T): Promise<Doc<"presence">[]> {
  return t.run((ctx) => ctx.db.query("presence").collect());
}

function heartbeatRows(t: T): Promise<Doc<"presence_heartbeats">[]> {
  return t.run((ctx) => ctx.db.query("presence_heartbeats").collect());
}

describe("presence: holds", () => {
  test("a heartbeat is visible through list, getDatePresence and getActivePresenceCount", async () => {
    const { t } = setup();

    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A, SLOT_B],
      user: "ada",
      eventTypeId: "et-1",
      data: { step: "details" },
    });

    // One row per slot, one cleanup job per slot.
    expect(await presenceRows(t)).toHaveLength(2);
    const heartbeats = await heartbeatRows(t);
    expect(heartbeats.map((row) => row.slot)).toEqual([SLOT_A, SLOT_B]);
    expect(heartbeats.every((row) => row.markAsGone !== undefined)).toBe(true);
    // …scheduled TIMEOUT_MS out, not run yet.
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0].name).toContain("presence");
    expect(scheduled[0].scheduledTime).toBe(FIXED_NOW + TIMEOUT_MS);

    expect(
      await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_A })
    ).toMatchObject([
      {
        resourceId: ROOM,
        user: "ada",
        slot: SLOT_A,
        eventTypeId: "et-1",
        updated: FIXED_NOW,
        data: { step: "details" },
      },
    ]);
    expect(await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_NEXT_DAY }))
      .toEqual([]);

    // getDatePresence strips the internal ids and is scoped to the date prefix.
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: ROOM, date: TUESDAY })
    ).toEqual([
      { slot: SLOT_A, user: "ada", updated: FIXED_NOW },
      { slot: SLOT_B, user: "ada", updated: FIXED_NOW },
    ]);
    expect(
      await t.query(api.presence.getDatePresence, {
        resourceId: ROOM,
        date: "2027-03-10",
      })
    ).toEqual([]);
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: KEYBOARD, date: TUESDAY })
    ).toEqual([]);

    // Two slots, one user.
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 1, users: ["ada"] });
    expect(
      await t.query(api.presence.getActivePresenceCount, { eventTypeId: "et-1" })
    ).toEqual({ count: 1, users: ["ada"] });
    // No filter at all short-circuits, and unknown ids simply count nothing.
    expect(await t.query(api.presence.getActivePresenceCount, {})).toEqual({
      count: 0,
      users: [],
    });
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: "other-room" })
    ).toEqual({ count: 0, users: [] });
    // resourceId wins when both filters are given.
    expect(
      await t.query(api.presence.getActivePresenceCount, {
        resourceId: ROOM,
        eventTypeId: "other-event",
      })
    ).toEqual({ count: 1, users: ["ada"] });
  });

  test("a second user's hold on the same slot is reported, most recent first", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
      eventTypeId: "et-1",
    });
    vi.setSystemTime(FIXED_NOW + 1_000);
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "bob",
      eventTypeId: "et-1",
    });

    // `list` orders by `updated` descending.
    expect(
      (await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_A })).map(
        (row) => [row.user, row.updated]
      )
    ).toEqual([
      ["bob", FIXED_NOW + 1_000],
      ["ada", FIXED_NOW],
    ]);
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: ROOM, date: TUESDAY })
    ).toEqual([
      { slot: SLOT_A, user: "ada", updated: FIXED_NOW },
      { slot: SLOT_A, user: "bob", updated: FIXED_NOW + 1_000 },
    ]);
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 2, users: ["ada", "bob"] });
  });

  test("re-heartbeating refreshes the row without scheduling a second cleanup", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
      eventTypeId: "et-1",
      data: { step: "details" },
    });
    const [firstHeartbeat] = await heartbeatRows(t);

    vi.setSystemTime(FIXED_NOW + 5_000);
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });

    const rows = await presenceRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].updated).toBe(FIXED_NOW + 5_000);
    // `data` is preserved (`args.data ?? existing.data`) while `eventTypeId` is
    // overwritten unconditionally — asymmetric, locked in deliberately.
    expect(rows[0].data).toEqual({ step: "details" });
    expect(rows[0].eventTypeId).toBeUndefined();
    expect(
      await t.query(api.presence.getActivePresenceCount, { eventTypeId: "et-1" })
    ).toEqual({ count: 0, users: [] });

    // Still exactly one cleanup job, unchanged.
    const heartbeats = await heartbeatRows(t);
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0].markAsGone).toBe(firstHeartbeat.markAsGone);
    expect(
      await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())
    ).toHaveLength(1);
  });

  test("leave removes only the leaving user's hold and its heartbeat row", async () => {
    const { t } = setup();
    for (const user of ["ada", "bob"]) {
      await t.mutation(api.presence.heartbeat, {
        resourceId: ROOM,
        slots: [SLOT_A, SLOT_B],
        user,
      });
    }
    expect(await presenceRows(t)).toHaveLength(4);

    await t.mutation(api.presence.leave, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });
    expect(
      (await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_A })).map(
        (row) => row.user
      )
    ).toEqual(["bob"]);
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: ROOM, date: TUESDAY })
    ).toEqual([
      { slot: SLOT_A, user: "bob", updated: FIXED_NOW },
      { slot: SLOT_B, user: "ada", updated: FIXED_NOW },
      { slot: SLOT_B, user: "bob", updated: FIXED_NOW },
    ]);
    expect(
      (await heartbeatRows(t)).map((row) => [row.user, row.slot])
    ).toEqual([
      ["ada", SLOT_B],
      ["bob", SLOT_A],
      ["bob", SLOT_B],
    ]);

    // Leaving the remaining slots (and an unheld one) is a no-op-tolerant batch.
    await t.mutation(api.presence.leave, {
      resourceId: ROOM,
      slots: [SLOT_A, SLOT_B, SLOT_NEXT_DAY],
      user: "ada",
    });
    expect((await presenceRows(t)).map((row) => row.user)).toEqual(["bob", "bob"]);
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 1, users: ["bob"] });
  });

  test("stale holds drop out of every read at the timeout boundary", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
      eventTypeId: "et-1",
    });

    // Exactly TIMEOUT_MS old is still active (`now - updated <= TIMEOUT_MS`).
    vi.setSystemTime(FIXED_NOW + TIMEOUT_MS);
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: ROOM, date: TUESDAY })
    ).toHaveLength(1);
    expect(
      await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_A })
    ).toHaveLength(1);
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 1, users: ["ada"] });

    // One millisecond later every read filters it out — while the row is still
    // in the database (the scheduled cleanup has not run yet).
    vi.setSystemTime(FIXED_NOW + TIMEOUT_MS + 1);
    expect(
      await t.query(api.presence.getDatePresence, { resourceId: ROOM, date: TUESDAY })
    ).toEqual([]);
    expect(await t.query(api.presence.list, { resourceId: ROOM, slot: SLOT_A })).toEqual(
      []
    );
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 0, users: [] });
    expect(
      await t.query(api.presence.getActivePresenceCount, { eventTypeId: "et-1" })
    ).toEqual({ count: 0, users: [] });
    expect(await presenceRows(t)).toHaveLength(1);
  });
});

describe("presence: scheduled cleanup", () => {
  test("the scheduled markAsGone job deletes the timed-out hold", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });

    // Jump the clock past the timeout (fake timers keep the job's relative
    // delay), then let the scheduler run.
    vi.setSystemTime(FIXED_NOW + 2 * TIMEOUT_MS);
    await drain(t);

    expect(await presenceRows(t)).toEqual([]);
    expect(await heartbeatRows(t)).toEqual([]);
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 0, users: [] });
  });

  test("cleanup deletes a stale hold and leaves other users alone", async () => {
    const { t } = setup();
    for (const user of ["ada", "bob"]) {
      await t.mutation(api.presence.heartbeat, {
        resourceId: ROOM,
        slots: [SLOT_A],
        user,
      });
    }

    vi.setSystemTime(FIXED_NOW + TIMEOUT_MS + 1);
    await t.mutation(internal.presence.cleanup, {
      resourceId: ROOM,
      slot: SLOT_A,
      user: "ada",
    });

    expect((await presenceRows(t)).map((row) => row.user)).toEqual(["bob"]);
    expect((await heartbeatRows(t)).map((row) => row.user)).toEqual(["bob"]);
  });

  test("cleanup reschedules itself while the user is still active", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });
    const [before] = await heartbeatRows(t);

    // Exactly at the boundary the hold is still considered active.
    vi.setSystemTime(FIXED_NOW + TIMEOUT_MS);
    await t.mutation(internal.presence.cleanup, {
      resourceId: ROOM,
      slot: SLOT_A,
      user: "ada",
    });

    expect(await presenceRows(t)).toHaveLength(1);
    const [after] = await heartbeatRows(t);
    expect(after.markAsGone).not.toBe(before.markAsGone);
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    );
    expect(scheduled).toHaveLength(2);
    expect(scheduled[1].scheduledTime).toBe(FIXED_NOW + 2 * TIMEOUT_MS);
  });

  test("cleanup tidies up half-deleted state", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });

    // Presence gone, heartbeat row left behind: cleanup removes the leftover.
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("presence").collect();
      await ctx.db.delete(row._id);
    });
    await t.mutation(internal.presence.cleanup, {
      resourceId: ROOM,
      slot: SLOT_A,
      user: "ada",
    });
    expect(await heartbeatRows(t)).toEqual([]);

    // …and the reverse: a presence row without a heartbeat job is dropped too.
    await t.run(async (ctx) => {
      await ctx.db.insert("presence", {
        resourceId: ROOM,
        user: "ada",
        slot: SLOT_A,
        updated: FIXED_NOW,
      });
    });
    await t.mutation(internal.presence.cleanup, {
      resourceId: ROOM,
      slot: SLOT_A,
      user: "ada",
    });
    expect(await presenceRows(t)).toEqual([]);
  });

  // BUG(port-review): presence rows are keyed by (user, slot) only, so a heartbeat for
  // a second resource patches the first resource's row instead of creating one — the
  // hold never shows up under the new resourceId (and `leave` on either resource
  // deletes it). Observed after both heartbeats: exactly one presence row,
  // ["room-1", "ada", SLOT_A]; getDatePresence(kbd-1, TUESDAY) === [].
  test.skip("a hold is tracked per resource, not just per user and slot", async () => {
    const { t } = setup();
    await t.mutation(api.presence.heartbeat, {
      resourceId: ROOM,
      slots: [SLOT_A],
      user: "ada",
    });
    await t.mutation(api.presence.heartbeat, {
      resourceId: KEYBOARD,
      slots: [SLOT_A],
      user: "ada",
    });

    expect(
      await t.query(api.presence.getDatePresence, { resourceId: KEYBOARD, date: TUESDAY })
    ).toEqual([{ slot: SLOT_A, user: "ada", updated: FIXED_NOW }]);
    expect(
      await t.query(api.presence.getActivePresenceCount, { resourceId: ROOM })
    ).toEqual({ count: 1, users: ["ada"] });
  });
});
