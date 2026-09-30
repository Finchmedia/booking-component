/**
 * Behaviour the README documents as the contract or as a host duty (plan
 * PR-08b); change only deliberately, together with the README.
 *
 * - Eligibility (F6, N13; component-enforced since 0.5.0): every creation,
 *   both moves and confirmations check that the event type and every
 *   resource exist, are active, are linked and share the event type's
 *   organization. Cancelling and declining never check.
 * - `scheduleId: ""` means no schedule (F12).
 * - Updates (N25): an omitted field is unchanged, so no field can be removed;
 *   strings and lists can be set to "" and [].
 *
 * Pinned elsewhere: deletes remove link rows (link-organization),
 * listBookings' resourceId is the primary resource (list-bookings-stream) and
 * the other schedule-argument shapes (schedule-arguments).
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  book,
  seedResource,
  seedResourceWithSchedule,
  setup,
  utc,
  type SeededResource,
  type T,
} from "./setup.test.js";

const HOUR = 3_600_000;
const at = (hour: number) => utc(TUESDAY, `${String(hour).padStart(2, "0")}:00`);

/** "ok: <status>" (or "ok"), or the rejection message. */
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    const result = await call();
    return result !== null && typeof result === "object" && "status" in result ? `ok: ${String(result.status)}` : "ok";
  } catch (error) {
    return (error as Error).message;
  }
}

type Condition = "eligible" | "event type inactive" | "resource inactive" | "not linked";

async function apply(t: T, seed: SeededResource, condition: Condition) {
  if (condition === "event type inactive") {
    await t.mutation(api.public.toggleEventTypeActive, { id: seed.eventTypeId, isActive: false });
  } else if (condition === "resource inactive") {
    await t.mutation(api.resources.toggleResourceActive, { id: seed.resourceId, isActive: false });
  } else if (condition === "not linked") {
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, {
      resourceId: seed.resourceId, eventTypeId: seed.eventTypeId,
    });
  }
}

describe("eligibility per entry point", () => {
  // Since 0.5.0 every creation, both moves and confirmations follow the same
  // booking rules; the texts differ between single bookings and bundles.
  const SINGLE = {
    eligible: "ok: confirmed",
    "event type inactive": "Event type is no longer active",
    "resource inactive": "Resource is no longer active",
    "not linked": "Resource is not available for this event type",
  };
  const BUNDLE = {
    eligible: "ok: confirmed",
    "event type inactive": 'Event type "et-1" is no longer active',
    "resource inactive": 'Resource "res-1" is no longer active',
    "not linked": 'Resource "res-1" is not available for this event type',
  };

  test.each(Object.keys(SINGLE) as Condition[])("%s", async (condition) => {
    const { t } = setup();
    const seed = await seedResource(t);
    const approval = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2", requiresConfirmation: true });
    // Existing bookings, made while everything was eligible.
    const movable = await book(t, seed, at(8), at(9));
    const tokenMovable = await book(t, seed, at(9), at(10));
    const cancellable = await book(t, seed, at(10), at(11));
    const pending = await book(t, approval, at(8), at(9));
    const declinable = await book(t, approval, at(9), at(10));
    await apply(t, seed, condition);
    await apply(t, approval, condition);
    const approvalText = SINGLE[condition];

    expect({
      createBooking: await outcome(() => book(t, seed, at(11), at(12))),
      createProvisionalBooking: await outcome(() => t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: at(12), end: at(13),
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      })),
      createMultiResourceBooking: await outcome(() => t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId, resources: [{ resourceId: seed.resourceId }], start: at(13), end: at(14),
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      })),
      rescheduleBooking: await outcome(() => t.mutation(api.public.rescheduleBooking, {
        bookingId: movable._id, newStart: at(14), newEnd: at(15),
      })),
      rescheduleBookingByToken: await outcome(() => t.mutation(api.public.rescheduleBookingByToken, {
        uid: tokenMovable.uid, token: tokenMovable.managementToken!, newStart: at(15), newEnd: at(16),
      })),
      "transitionBookingState pending -> confirmed": await outcome(() => t.mutation(api.hooks.transitionBookingState, {
        bookingId: pending._id, toStatus: "confirmed",
      })),
      "transitionBookingState pending -> declined": await outcome(() => t.mutation(api.hooks.transitionBookingState, {
        bookingId: declinable._id, toStatus: "declined",
      })),
      cancelBookingByToken: await outcome(() => t.mutation(api.public.cancelBookingByToken, {
        uid: cancellable.uid, token: cancellable.managementToken!,
      })),
    }).toEqual({
      createBooking: SINGLE[condition],
      createProvisionalBooking: SINGLE[condition].replace("confirmed", "provisional"),
      createMultiResourceBooking: BUNDLE[condition],
      rescheduleBooking: SINGLE[condition],
      rescheduleBookingByToken: SINGLE[condition],
      "transitionBookingState pending -> confirmed": condition === "eligible" ? "ok" : approvalText.replace("res-1", "res-2"),
      // Ending a booking is always allowed.
      "transitionBookingState pending -> declined": "ok",
      cancelBookingByToken: "ok",
    });
    // Configuration changes never end existing bookings; a refused move keeps
    // the original as it was.
    if (condition !== "eligible") {
      for (const booking of [movable, tokenMovable]) {
        expect((await t.query(api.public.getBooking, { bookingId: booking._id }))?.status).toBe("confirmed");
      }
      expect((await t.query(api.public.getBooking, { bookingId: pending._id }))?.status).toBe("pending");
    }
  });

  test("bundles reject unknown resources; every booking path compares organizations", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // organization org-1
    await seedResource(t, { resourceId: "res-other", eventTypeId: "et-other", organizationId: "org-2" });
    // A cross-organization link as 0.4.x stored it (linkResourceToEventType rejects it since 0.5.0).
    await t.run((ctx) => ctx.db.insert("resource_event_types", { resourceId: "res-other", eventTypeId: seed.eventTypeId }));
    const bundle = (resourceId: string, hour: number) => outcome(() => t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId: seed.eventTypeId, resources: [{ resourceId }], start: at(hour), end: at(hour) + HOUR,
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    }));

    expect({
      "bundle, unknown resource": await bundle("no-such-resource", 9),
      "createBooking, unknown resource": await outcome(() => book(t, { ...seed, resourceId: "no-such-resource" }, at(10), at(11))),
      "createBooking, org-1 event type on a linked org-2 resource": await outcome(() =>
        book(t, { ...seed, resourceId: "res-other" }, at(11), at(12))),
      "bundle, org-1 event type on an org-2 resource": await bundle("res-other", 12),
    }).toEqual({
      "bundle, unknown resource": 'Resource "no-such-resource" not found',
      "createBooking, unknown resource": "Resource not found",
      "createBooking, org-1 event type on a linked org-2 resource": "Resource belongs to another organization than the event type",
      "bundle, org-1 event type on an org-2 resource": 'Resource "res-other" belongs to another organization than the event type',
    });
    // Nothing was reserved for the unknown id.
    expect(await t.query(api.maintenance.getDailyAvailability, { resourceId: "no-such-resource", date: TUESDAY })).toBeNull();
  });
});

test('scheduleId "" is no schedule: the legacy 09:00–17:00 UTC window', async () => {
  const { t } = setup();
  const seed = await seedResourceWithSchedule(t); // Mon–Fri 09–17 Europe/Berlin
  const SATURDAY = "2027-03-13";
  const day = async (scheduleId?: string) =>
    (await t.query(api.public.getDaySlots, {
      resourceId: seed.resourceId, date: SATURDAY, eventLength: 60, slotInterval: 60, scheduleId,
    })).map((slot) => slot.time.slice(11, 16));
  const month = async (scheduleId?: string) =>
    (await t.query(api.public.getMonthAvailability, {
      resourceId: seed.resourceId, dateFrom: SATURDAY, dateTo: SATURDAY, eventLength: 60, slotInterval: 60, scheduleId,
    }))[SATURDAY];

  // CONTROL: the real schedule is closed on Saturday.
  expect(await day(seed.scheduleId)).toEqual([]);
  expect(await month(seed.scheduleId)).toBe(false);
  expect(await day("")).toEqual(await day());
  expect(await day("")).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  expect(await month("")).toBe(true);
});

describe("updates: an omitted field is unchanged", () => {
  test("event types: \"\" and [] are stored; scheduleId and numbers cannot be removed", async () => {
    const { t } = setup();
    const seed = await seedResource(t, {
      scheduleId: "sch-1",
      eventType: { description: "Intro call", lengthInMinutesOptions: [30, 60], bufferBefore: 10 },
    });
    const read = async () => {
      const eventType = await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId });
      return {
        description: eventType.description,
        lengthInMinutesOptions: eventType.lengthInMinutesOptions,
        scheduleId: eventType.scheduleId,
        bufferBefore: eventType.bufferBefore,
        title: eventType.title,
      };
    };

    await t.mutation(api.public.updateEventType, {
      id: seed.eventTypeId, title: "Renamed", description: undefined, scheduleId: undefined, bufferBefore: undefined,
    });
    expect(await read()).toEqual({
      description: "Intro call", lengthInMinutesOptions: [30, 60], scheduleId: "sch-1", bufferBefore: 10, title: "Renamed",
    });

    await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, description: "", lengthInMinutesOptions: [] });
    expect(await read()).toEqual({
      description: "", lengthInMinutesOptions: [], scheduleId: "sch-1", bufferBefore: 10, title: "Renamed",
    });
  });

  test("resources: an omitted description is kept, \"\" is stored", async () => {
    const { t } = setup();
    const seed = await seedResource(t, { resource: { description: "Corner room" } });
    const description = async () => (await t.query(api.resources.getResource, { id: seed.resourceId }))?.description;

    await t.mutation(api.resources.updateResource, { id: seed.resourceId, name: "Room A" });
    expect(await description()).toBe("Corner room");
    await t.mutation(api.resources.updateResource, { id: seed.resourceId, description: "" });
    expect(await description()).toBe("");
  });
});
