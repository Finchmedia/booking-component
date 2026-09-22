import { describe, expect, test, vi } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  TUESDAY,
  setup,
  seedResource,
  seedFungibleResource,
  utc,
  getBusySlots,
  range,
  type T,
} from "./setup.test.js";

const start = utc(TUESDAY, "09:00");
const end = utc(TUESDAY, "10:00");
async function fixture(pending = false) {
  const { t } = setup();
  const seed = await seedResource(t, {
    requiresConfirmation: pending,
    eventType: { description: "A consultation" },
  });
  const pool = await seedFungibleResource(t, {
    quantity: 2,
    eventTypeId: seed.eventTypeId,
  });
  const args = {
    eventTypeId: seed.eventTypeId,
    start,
    end,
    timezone: seed.timezone,
    booker: BOOKER,
  };
  return { t, seed, pool, args };
}

test("regression: duplicate pool entries must not exceed capacity", async () => {
  const { t, pool, args } = await fixture();
  await expect(
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      ...args,
      resources: [
        { resourceId: pool.resourceId, quantity: 2 },
        { resourceId: pool.resourceId, quantity: 2 },
      ],
    }),
  ).rejects.toThrow();
});

test("regression: negative quantities must be rejected", async () => {
  const { t, pool, args } = await fixture();
  await expect(
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      ...args,
      resources: [{ resourceId: pool.resourceId, quantity: -1 }],
    }),
  ).rejects.toThrow();
});

test("regression: cancelling a declined booking must preserve the next holder", async () => {
  const { t, seed, args } = await fixture(true);
  const booking = await t.mutation(
    api.multi_resource.createMultiResourceBooking,
    {
      ...args,
      resources: [{ resourceId: seed.resourceId }],
    },
  );
  await t.mutation(api.hooks.transitionBookingState, {
    bookingId: booking._id,
    toStatus: "declined",
  });
  await t.mutation(api.multi_resource.createMultiResourceBooking, {
    ...args,
    resources: [{ resourceId: seed.resourceId }],
  });
  const before = await getBusySlots(t, seed.resourceId, TUESDAY);
  try {
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking._id,
    });
  } catch {
    /* rejecting a terminal state is valid */
  }
  expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual(before);
});

test("regression: token cancellation must release all booked inventory", async () => {
  const { t, seed, pool, args } = await fixture();
  const booking = await t.mutation(
    api.multi_resource.createMultiResourceBooking,
    {
      ...args,
      resources: [
        { resourceId: seed.resourceId },
        { resourceId: pool.resourceId, quantity: 2 },
      ],
    },
  );
  await t.mutation(api.public.cancelBookingByToken, {
    uid: booking.uid!,
    token: booking.managementToken!,
  });
  const check = await t.query(
    api.multi_resource.checkMultiResourceAvailability,
    {
      resources: [{ resourceId: pool.resourceId, quantity: 2 }],
      start,
      end,
    },
  );
  expect(check.available).toBe(true);
});

test.each(["id", "token"] as const)(
  "regression: %s reschedule must retain all booked resources",
  async (mode) => {
    const { t, seed, pool, args } = await fixture();
    const booking = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [
          { resourceId: seed.resourceId },
          { resourceId: pool.resourceId, quantity: 2 },
        ],
      },
    );
    const newTime = {
      newStart: utc(TUESDAY, "11:00"),
      newEnd: utc(TUESDAY, "12:00"),
    };
    const moved =
      mode === "id"
        ? await t.mutation(api.public.rescheduleBooking, {
            bookingId: booking._id,
            ...newTime,
          })
        : await t.mutation(api.public.rescheduleBookingByToken, {
            uid: booking.uid!,
            token: booking.managementToken!,
            ...newTime,
          });
    const withItems = await t.query(api.multi_resource.getBookingWithItems, {
      bookingId: moved._id,
    });
    expect(withItems!.items.map((i) => i.resourceId).sort()).toEqual(
      [seed.resourceId, pool.resourceId].sort(),
    );
  },
);

test("regression: single-resource booking must respect fully occupied pooled inventory", async () => {
  const { t, seed, pool, args } = await fixture();
  await t.mutation(api.multi_resource.createMultiResourceBooking, {
    ...args,
    resources: [{ resourceId: pool.resourceId, quantity: 2 }],
  });
  await expect(
    t.mutation(api.public.createBooking, {
      ...args,
      resourceId: pool.resourceId,
      eventTypeId: seed.eventTypeId,
      location: { type: "address" },
    }),
  ).rejects.toThrow();
});

async function snapshot(t: T) {
  return await t.run(async (ctx) => ({
    bookings: await ctx.db.query("bookings").collect(),
    items: await ctx.db.query("booking_items").collect(),
    history: await ctx.db.query("booking_history").collect(),
    bitmaps: await ctx.db.query("daily_availability").collect(),
    quantities: await ctx.db.query("quantity_availability").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

const invalidQuantities = [
  0,
  -1,
  0.5,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
];

describe("inventory input validation", () => {
  test.each(invalidQuantities)(
    "rejects quantity %s in both read and write paths without side effects",
    async (quantity) => {
      const { t, pool, args } = await fixture();
      const resources = [{ resourceId: pool.resourceId, quantity }];
      const before = await snapshot(t);
      await expect(
        t.query(api.multi_resource.checkMultiResourceAvailability, {
          resources,
          start,
          end,
        }),
      ).rejects.toThrow();
      await expect(
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources,
        }),
      ).rejects.toThrow();
      expect(await snapshot(t)).toEqual(before);
    },
  );

  test.each(invalidQuantities)(
    "rejects capacity %s on resource creation and update",
    async (quantity) => {
      const { t, pool } = await fixture();
      await expect(
        t.mutation(api.resources.createResource, {
          id: "invalid",
          organizationId: "org-1",
          name: "Invalid",
          type: "pool",
          timezone: "UTC",
          isFungible: true,
          quantity,
        }),
      ).rejects.toThrow();
      await expect(
        t.mutation(api.resources.updateResource, {
          id: pool.resourceId,
          quantity,
        }),
      ).rejects.toThrow();
      expect(
        (await t.query(api.resources.getResource, { id: pool.resourceId }))
          ?.quantity,
      ).toBe(2);
      expect(
        await t.query(api.resources.getResource, { id: "invalid" }),
      ).toBeNull();
    },
  );

  test("rejects duplicate IDs, empty lists and exclusive quantities consistently", async () => {
    const { t, seed, pool, args } = await fixture();
    for (const resources of [
      [],
      [
        { resourceId: pool.resourceId, quantity: 2 },
        { resourceId: pool.resourceId, quantity: 2 },
      ],
      [{ resourceId: seed.resourceId }, { resourceId: seed.resourceId }],
      [{ resourceId: seed.resourceId, quantity: 2 }],
    ]) {
      await expect(
        t.query(api.multi_resource.checkMultiResourceAvailability, {
          resources,
          start,
          end,
        }),
      ).rejects.toThrow();
      await expect(
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources,
        }),
      ).rejects.toThrow();
    }
    expect((await snapshot(t)).bookings).toEqual([]);
    await expect(
      t.mutation(api.resources.updateResource, {
        id: seed.resourceId,
        quantity: 2,
      }),
    ).rejects.toThrow("Non-fungible");
  });

  test.each([1, 2])(
    "a pool with capacity %s accepts exactly its capacity and refuses overflow",
    async (quantity) => {
      const { t, seed, pool, args } = await fixture();
      await t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity,
      });
      const resources = [{ resourceId: pool.resourceId, quantity }];
      const check = await t.query(
        api.multi_resource.checkMultiResourceAvailability,
        { resources, start, end },
      );
      expect(check.available).toBe(true);
      const tooMany = [{ resourceId: pool.resourceId, quantity: quantity + 1 }];
      const overflow = await t.query(
        api.multi_resource.checkMultiResourceAvailability,
        { resources: tooMany, start, end },
      );
      expect(overflow.available).toBe(false);
      expect(overflow.resources[0].availableQuantity).toBe(quantity);
      await expect(
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources: tooMany,
        }),
      ).rejects.toThrow("not available");
      await t.mutation(api.multi_resource.createMultiResourceBooking, {
        ...args,
        resources,
      });
      const before = await snapshot(t);
      await expect(
        t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources: [{ resourceId: seed.resourceId }, ...resources],
        }),
      ).rejects.toThrow("not available");
      expect(await snapshot(t)).toEqual(before);
    },
  );

  test("capacity cannot shrink below occupancy or change inventory modes until slots are released", async () => {
    const { t, seed, pool, args } = await fixture();
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 3,
    });
    const booking = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [
          { resourceId: seed.resourceId },
          { resourceId: pool.resourceId, quantity: 2 },
        ],
      },
    );
    // Reducing unused capacity is valid and does not change inventory representation.
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 2,
    });
    await expect(
      t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 1,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 1,
        isFungible: false,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.resources.updateResource, {
        id: seed.resourceId,
        quantity: 2,
        isFungible: true,
      }),
    ).rejects.toThrow();
    // A secondary item must also prevent deletion: release needs its resource's mode.
    await expect(
      t.mutation(api.resources.deleteResource, { id: pool.resourceId }),
    ).rejects.toThrow("existing bookings");
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking._id,
    });
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 1,
    });
    await t.mutation(api.resources.updateResource, {
      id: seed.resourceId,
      quantity: 2,
      isFungible: true,
    });
    const next = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [{ resourceId: pool.resourceId }],
      },
    );
    expect(next.status).toBe("confirmed");
    expect(await getBusySlots(t, pool.resourceId, TUESDAY)).toEqual(
      range(36, 40),
    );
  });

  test("defining a previously unknown resource cannot hide its legacy reservations", async () => {
    const { t } = setup();
    const reservationId = await t.mutation(api.public.createReservation, {
      resourceId: "future-pool",
      actorId: BOOKER.email,
      start,
      end,
    });
    const pool = {
      id: "future-pool",
      organizationId: "org-1",
      name: "Future pool",
      type: "pool",
      timezone: "UTC",
      isFungible: true,
      quantity: 2,
    };
    await expect(
      t.mutation(api.resources.createResource, pool),
    ).rejects.toThrow("inventory mode");
    expect(await getBusySlots(t, pool.id, TUESDAY)).toEqual(range(36, 40));
    await t.mutation(api.public.cancelReservation, { reservationId });
    await t.mutation(api.resources.createResource, pool);
    expect(
      (await t.query(api.resources.getResource, { id: pool.id }))?.quantity,
    ).toBe(2);
  });

  test("past completed usage does not block future capacity reductions or mode changes", async () => {
    const { t, pool, args } = await fixture();
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 3,
    });
    const booking = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [{ resourceId: pool.resourceId, quantity: 3 }],
      },
    );
    await t.mutation(api.hooks.transitionBookingState, {
      bookingId: booking._id,
      toStatus: "completed",
    });
    const historicalCounters = (await snapshot(t)).quantities;
    // Even a completed booking protects future or partly elapsed slots.
    vi.setSystemTime(start + 10 * 60_000);
    await expect(
      t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 2,
      }),
    ).rejects.toThrow();
    vi.setSystemTime(end);
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 2,
    });
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 1,
    });
    const next = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        start: utc(TUESDAY, "11:00"),
        end: utc(TUESDAY, "12:00"),
        resources: [{ resourceId: pool.resourceId, quantity: 1 }],
      },
    );
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: next._id,
    });
    expect(await getBusySlots(t, pool.resourceId, TUESDAY)).toEqual([]);
    expect((await snapshot(t)).quantities).toEqual(historicalCounters);
  });

  test("a past active secondary booking still prevents a resource mode change", async () => {
    const { t, seed, pool, args } = await fixture();
    const booking = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [
          { resourceId: seed.resourceId },
          { resourceId: pool.resourceId },
        ],
      },
    );
    vi.setSystemTime(utc("2027-03-10", "00:00"));
    await expect(
      t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 1,
      }),
    ).rejects.toThrow("active bookings");
    await t.mutation(api.multi_resource.cancelMultiResourceBooking, {
      bookingId: booking._id,
    });
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 1,
    });
  });

  test("a capacity reduction within counter mode cannot go below an occupied slot", async () => {
    const { t, pool, args } = await fixture();
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity: 4,
    });
    await t.mutation(api.multi_resource.createMultiResourceBooking, {
      ...args,
      resources: [{ resourceId: pool.resourceId, quantity: 3 }],
    });
    await expect(
      t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 2,
      }),
    ).rejects.toThrow("reserved quantities");
    expect(
      (await t.query(api.resources.getResource, { id: pool.resourceId }))
        ?.quantity,
    ).toBe(4);
  });
});

describe("state-aware release", () => {
  test.each(["declined", "cancelled", "completed"] as const)(
    "all cancel/expiry paths preserve a terminal %s booking's inventory",
    async (terminal) => {
      const { t, seed, pool, args } = await fixture(terminal === "declined");
      const resources = [
        { resourceId: seed.resourceId },
        { resourceId: pool.resourceId, quantity: 2 },
      ];
      const booking = await t.mutation(
        api.multi_resource.createMultiResourceBooking,
        { ...args, resources },
      );
      await t.mutation(api.hooks.transitionBookingState, {
        bookingId: booking._id,
        toStatus: terminal,
      });
      if (terminal !== "completed") {
        await t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources,
        });
      }
      const before = await snapshot(t);
      await expect(
        t.mutation(api.multi_resource.cancelMultiResourceBooking, {
          bookingId: booking._id,
        }),
      ).rejects.toThrow();
      if (terminal === "cancelled") {
        expect(
          await t.mutation(api.public.cancelReservation, {
            reservationId: booking._id,
          }),
        ).toMatchObject({ alreadyCancelled: true });
      } else {
        await expect(
          t.mutation(api.public.cancelReservation, {
            reservationId: booking._id,
          }),
        ).rejects.toThrow();
      }
      await expect(
        t.mutation(api.public.cancelBookingByToken, {
          uid: booking.uid,
          token: booking.managementToken!,
        }),
      ).rejects.toThrow();
      await expect(
        t.mutation(api.hooks.transitionBookingState, {
          bookingId: booking._id,
          toStatus: "cancelled",
        }),
      ).rejects.toThrow();
      await t.mutation(api.public.expireProvisionalBooking, {
        bookingId: booking._id,
      });
      expect(await snapshot(t)).toEqual(before);
    },
  );

  test.each([false, true])(
    "token cancellation releases every item once (pending: %s), including UTC midnight",
    async (pending) => {
      const { t, seed, pool, args } = await fixture(pending);
      await t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 3,
      });
      const overnight = {
        start: utc(TUESDAY, "23:30"),
        end: utc("2027-03-10", "00:30"),
      };
      const resources = [
        { resourceId: seed.resourceId },
        { resourceId: pool.resourceId, quantity: 2 },
      ];
      const booking = await t.mutation(
        api.multi_resource.createMultiResourceBooking,
        { ...args, ...overnight, resources },
      );
      await t.mutation(api.multi_resource.createMultiResourceBooking, {
        ...args,
        ...overnight,
        resources: [{ resourceId: pool.resourceId, quantity: 1 }],
      });
      const before = await snapshot(t);
      await expect(
        t.mutation(api.public.cancelBookingByToken, {
          uid: booking.uid,
          token: "wrong",
        }),
      ).rejects.toThrow("Invalid token");
      expect(await snapshot(t)).toEqual(before);
      await t.mutation(api.public.cancelBookingByToken, {
        uid: booking.uid,
        token: booking.managementToken!,
        reason: "cancelled",
      });
      expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([]);
      expect(await getBusySlots(t, seed.resourceId, "2027-03-10")).toEqual([]);
      const check = await t.query(
        api.multi_resource.checkMultiResourceAvailability,
        { resources, ...overnight },
      );
      expect(
        check.resources.map((resource) => resource.availableQuantity),
      ).toEqual([1, 2]);
      const after = await snapshot(t);
      expect(
        after.history.filter((row) => row.bookingId === booking._id),
      ).toHaveLength(2);
      expect(
        after.scheduled.filter((row) => row.name.includes("triggerHooks")),
      ).toHaveLength(3);
      await expect(
        t.mutation(api.public.cancelBookingByToken, {
          uid: booking.uid,
          token: booking.managementToken!,
        }),
      ).rejects.toThrow();
      expect(await snapshot(t)).toEqual(after);
    },
  );

  test("reservation cancellation and provisional expiry release all item types, then remain harmless", async () => {
    const { t, seed, pool, args } = await fixture();
    const resources = [
      { resourceId: seed.resourceId },
      { resourceId: pool.resourceId, quantity: 2 },
    ];
    const booking = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      { ...args, resources },
    );
    await t.mutation(api.public.cancelReservation, {
      reservationId: booking._id,
    });
    const replacement = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      { ...args, resources },
    );
    // Future host integrations may provision a multi-resource payment hold.
    await t.run((ctx) =>
      ctx.db.patch(replacement._id, { status: "provisional" }),
    );
    await t.mutation(api.public.expireProvisionalBooking, {
      bookingId: replacement._id,
    });
    await t.mutation(api.multi_resource.createMultiResourceBooking, {
      ...args,
      resources,
    });
    const before = await snapshot(t);
    await t.mutation(api.public.cancelReservation, {
      reservationId: booking._id,
    });
    await t.mutation(api.public.expireProvisionalBooking, {
      bookingId: replacement._id,
    });
    expect(await snapshot(t)).toEqual(before);
  });
});

describe.each(["id", "token"] as const)("atomic %s reschedule", (mode) => {
  const move = (
    t: T,
    booking: Doc<"bookings">,
    newStart: number,
    newEnd: number,
  ) =>
    mode === "id"
      ? t.mutation(api.public.rescheduleBooking, {
          bookingId: booking._id,
          newStart,
          newEnd,
        })
      : t.mutation(api.public.rescheduleBookingByToken, {
          uid: booking.uid,
          token: booking.managementToken!,
          newStart,
          newEnd,
        });

  test.each([false, true])(
    "moves all quantities across an overlapping interval and keeps metadata (pending: %s)",
    async (pending) => {
      const { t, seed, pool, args } = await fixture(pending);
      await t.mutation(api.resources.updateResource, {
        id: pool.resourceId,
        quantity: 3,
      });
      const resources = [
        { resourceId: seed.resourceId },
        { resourceId: pool.resourceId, quantity: 2 },
      ];
      const original = await t.mutation(
        api.multi_resource.createMultiResourceBooking,
        {
          ...args,
          resources,
          organizationId: "org-1",
          booker: { ...BOOKER, phone: "123", notes: "Keep me" },
          location: { type: "address", value: "Meeting room" },
        },
      );
      await t.mutation(api.multi_resource.createMultiResourceBooking, {
        ...args,
        end: utc(TUESDAY, "10:30"),
        resources: [{ resourceId: pool.resourceId, quantity: 1 }],
      });
      const moved = await move(
        t,
        original,
        utc(TUESDAY, "09:30"),
        utc(TUESDAY, "10:30"),
      );
      expect(moved).toMatchObject({
        managementToken: original.managementToken,
        rescheduleUid: original.uid,
        status: original.status,
        bookerName: original.bookerName,
        bookerEmail: original.bookerEmail,
        bookerPhone: original.bookerPhone,
        bookerNotes: original.bookerNotes,
        eventTypeId: original.eventTypeId,
        eventTitle: original.eventTitle,
        eventDescription: original.eventDescription,
        organizationId: original.organizationId,
        timezone: original.timezone,
        actorId: original.actorId,
        location: original.location,
      });
      expect(moved.uid).not.toBe(original.uid);
      const items = await t.query(api.multi_resource.getBookingWithItems, {
        bookingId: moved._id,
      });
      expect(
        items!.items.map((item) => ({
          resourceId: item.resourceId,
          quantity: item.quantity,
        })),
      ).toEqual([
        { resourceId: seed.resourceId, quantity: 1 },
        { resourceId: pool.resourceId, quantity: 2 },
      ]);
      expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual(
        range(38, 42),
      );
      const after = await snapshot(t);
      const counters = after.quantities[0].slotQuantities;
      expect(counters).toEqual({ 36: 1, 37: 1, 38: 3, 39: 3, 40: 3, 41: 3 });
      expect(
        after.history.filter((row) => row.bookingId === original._id),
      ).toHaveLength(2);
      expect(
        after.history.filter((row) => row.bookingId === moved._id),
      ).toHaveLength(1);
      const hook = after.scheduled.find(
        (row) =>
          row.name.includes("triggerHooks") &&
          row.args[0].eventType === "booking.rescheduled",
      );
      expect(hook?.args[0].payload).toMatchObject({
        uid: moved.uid,
        managementToken: moved.managementToken,
        newBookingId: moved._id,
      });
      await t.mutation(api.public.cancelBookingByToken, {
        uid: moved.uid,
        token: moved.managementToken!,
      });
      expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([]);
      expect((await snapshot(t)).quantities[0].slotQuantities).toEqual({
        36: 1,
        37: 1,
        38: 1,
        39: 1,
        40: 1,
        41: 1,
      });
    },
  );

  test("a full destination pool rolls back the primary room, items, history and hook scheduling", async () => {
    const { t, seed, pool, args } = await fixture();
    const original = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [
          { resourceId: seed.resourceId },
          { resourceId: pool.resourceId, quantity: 2 },
        ],
      },
    );
    await t.mutation(api.multi_resource.createMultiResourceBooking, {
      ...args,
      start: utc(TUESDAY, "11:00"),
      end: utc(TUESDAY, "12:00"),
      resources: [{ resourceId: pool.resourceId, quantity: 1 }],
    });
    const before = await snapshot(t);
    await expect(
      move(t, original, utc(TUESDAY, "11:00"), utc(TUESDAY, "12:00")),
    ).rejects.toThrow("not available");
    expect(await snapshot(t)).toEqual(before);
  });

  test("moves all inventory across UTC midnight and preserves an invalid token's original booking", async () => {
    const { t, seed, pool, args } = await fixture();
    const original = await t.mutation(
      api.multi_resource.createMultiResourceBooking,
      {
        ...args,
        resources: [
          { resourceId: seed.resourceId },
          { resourceId: pool.resourceId, quantity: 2 },
        ],
      },
    );
    const newStart = utc(TUESDAY, "23:30"),
      newEnd = utc("2027-03-10", "00:30");
    const before = await snapshot(t);
    await expect(
      t.mutation(api.public.rescheduleBookingByToken, {
        uid: original.uid,
        token: "wrong",
        newStart,
        newEnd,
      }),
    ).rejects.toThrow("Invalid token");
    expect(await snapshot(t)).toEqual(before);
    await move(t, original, newStart, newEnd);
    expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([94, 95]);
    expect(await getBusySlots(t, seed.resourceId, "2027-03-10")).toEqual([
      0, 1,
    ]);
    const resources = [{ resourceId: pool.resourceId, quantity: 2 }];
    expect(
      (
        await t.query(api.multi_resource.checkMultiResourceAvailability, {
          resources,
          start,
          end,
        })
      ).available,
    ).toBe(true);
    expect(
      (
        await t.query(api.multi_resource.checkMultiResourceAvailability, {
          resources,
          start: newStart,
          end: newEnd,
        })
      ).available,
    ).toBe(false);
  });
});

test.each([1, 2])(
  "all ordinary writes and reads consistently exclude fungible resources (capacity %s)",
  async (quantity) => {
    const { t, pool, args } = await fixture();
    await t.mutation(api.resources.updateResource, {
      id: pool.resourceId,
      quantity,
    });
    const ordinary = {
      ...args,
      resourceId: pool.resourceId,
      location: { type: "address" },
    };
    for (const filled of [false, true]) {
      if (filled)
        await t.mutation(api.multi_resource.createMultiResourceBooking, {
          ...args,
          resources: [{ resourceId: pool.resourceId, quantity }],
        });
      const before = await snapshot(t);
      await expect(
        t.mutation(api.public.createBooking, ordinary),
      ).rejects.toThrow("Fungible resources require");
      await expect(
        t.mutation(api.public.createProvisionalBooking, ordinary),
      ).rejects.toThrow("Fungible resources require");
      await expect(
        t.mutation(api.public.createReservation, {
          resourceId: pool.resourceId,
          actorId: BOOKER.email,
          start,
          end,
        }),
      ).rejects.toThrow("Fungible resources require");
      expect(
        await t.query(api.resources.getResourceAvailability, {
          resourceId: pool.resourceId,
          date: TUESDAY,
        }),
      ).toEqual(filled ? range(36, 40) : []);
      expect(
        await t.query(api.resources.getQuantityAvailability, {
          resourceId: pool.resourceId,
          date: TUESDAY,
        }),
      ).toEqual({
        totalQuantity: quantity,
        bookedQuantities: filled
          ? Object.fromEntries(
              range(36, 40).map((slot) => [String(slot), quantity]),
            )
          : {},
      });
      expect(
        await t.query(api.public.getAvailability, {
          resourceId: pool.resourceId,
          start,
          end,
        }),
      ).toBe(false);
      expect(
        await t.query(api.public.getDaySlots, {
          resourceId: pool.resourceId,
          date: TUESDAY,
          eventLength: 60,
        }),
      ).toEqual([]);
      expect(
        await t.query(api.public.getMonthAvailability, {
          resourceId: pool.resourceId,
          dateFrom: TUESDAY,
          dateTo: TUESDAY,
          eventLength: 60,
        }),
      ).toEqual({ [TUESDAY]: false });
      expect(await snapshot(t)).toEqual(before);
    }
  },
);
