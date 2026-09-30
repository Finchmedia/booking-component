/// <reference types="vite/client" />
// F5: at most one link row per (resource, event type) pair.
//
// Releases up to 0.4.2 inserted a row per repeated id in the replace
// mutations, and every `.unique()` link read then threw, including the
// createBooking / createProvisionalBooking guard. Component writes now keep one
// row per pair; reads tolerate duplicates that older releases left behind, and
// only the link mutations collapse them (the booking path writes no link row).
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  ORG,
  TUESDAY,
  TZ,
  book,
  seedResource,
  setup,
  utc,
  type SeededResource,
  type T,
} from "./setup.test.js";

/** Link rows of one pair, counted straight from the table. */
async function linkRows(t: T, resourceId: string, eventTypeId: string): Promise<number> {
  return await t.run(
    async (ctx) =>
      (await ctx.db.query("resource_event_types").collect()).filter(
        (row) => row.resourceId === resourceId && row.eventTypeId === eventTypeId
      ).length
  );
}

/** A second row for an already linked pair, as releases up to 0.4.2 could write it. */
async function seedDuplicate(t: T, seed: SeededResource): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("resource_event_types", {
      resourceId: seed.resourceId,
      eventTypeId: seed.eventTypeId,
    });
  });
  expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(2);
}

function addResource(t: T, id: string) {
  return t.mutation(api.resources.createResource, {
    id,
    organizationId: ORG,
    name: id,
    type: "room",
    timezone: TZ,
  });
}

function addEventType(t: T, id: string) {
  return t.mutation(api.public.createEventType, {
    id,
    slug: id,
    title: id,
    lengthInMinutes: 60,
    timezone: TZ,
    lockTimeZoneToggle: false,
    locations: [],
    organizationId: ORG,
    minNoticeMinutes: 0,
    maxFutureMinutes: 365 * 24 * 60,
  });
}

function hold(t: T, seed: SeededResource, start: number, end: number) {
  return t.mutation(api.public.createProvisionalBooking, {
    eventTypeId: seed.eventTypeId,
    resourceId: seed.resourceId,
    start,
    end,
    timezone: seed.timezone,
    booker: BOOKER,
    location: LOCATION,
  });
}

const pairOf = (seed: SeededResource) => ({
  resourceId: seed.resourceId,
  eventTypeId: seed.eventTypeId,
});

describe("replace mutations write one row per pair", () => {
  test("setResourcesForEventType([r, r]) links once and booking works", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, pairOf(seed));
    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(0);

    expect(
      await t.mutation(api.resource_event_types.setResourcesForEventType, {
        eventTypeId: seed.eventTypeId,
        resourceIds: [seed.resourceId, seed.resourceId],
      })
    ).toEqual({ success: true });

    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);
    expect(await t.query(api.resource_event_types.hasResourceEventTypeLink, pairOf(seed))).toBe(true);
    const booking = await book(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"));
    expect(booking.status).toBe("confirmed");
  });

  test("setEventTypesForResource([e, e, e]) links once and a hold works", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, pairOf(seed));

    await t.mutation(api.resource_event_types.setEventTypesForResource, {
      resourceId: seed.resourceId,
      eventTypeIds: [seed.eventTypeId, seed.eventTypeId, seed.eventTypeId],
    });

    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);
    const held = await hold(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"));
    expect(held.status).toBe("provisional");
  });

  test("mixed input [r2, r, r, r2] with r already linked: one row each, other links untouched", async () => {
    const { t } = setup();
    const seed = await seedResource(t); // res-1 ↔ et-1
    await addResource(t, "res-2");
    await addEventType(t, "et-2");
    await t.mutation(api.resource_event_types.linkResourceToEventType, {
      resourceId: seed.resourceId,
      eventTypeId: "et-2",
    });

    await t.mutation(api.resource_event_types.setResourcesForEventType, {
      eventTypeId: seed.eventTypeId,
      resourceIds: ["res-2", seed.resourceId, seed.resourceId, "res-2", "ghost"],
    });

    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);
    expect(await linkRows(t, "res-2", seed.eventTypeId)).toBe(1);
    expect(await linkRows(t, seed.resourceId, "et-2")).toBe(1);
    // Unknown ids are still skipped silently.
    expect(await linkRows(t, "ghost", seed.eventTypeId)).toBe(0);
    expect(
      await t.query(api.resource_event_types.getResourceIdsForEventType, {
        eventTypeId: seed.eventTypeId,
      })
    ).toEqual([seed.resourceId, "res-2"]);
  });
});

describe("duplicate rows left by earlier releases", () => {
  test("reads answer once and the booking path writes no link row", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedDuplicate(t, seed);

    expect(await t.query(api.resource_event_types.hasResourceEventTypeLink, pairOf(seed))).toBe(true);
    expect(
      await t.query(api.resource_event_types.getResourceIdsForEventType, {
        eventTypeId: seed.eventTypeId,
      })
    ).toEqual([seed.resourceId]);
    expect(
      await t.query(api.resource_event_types.getEventTypeIdsForResource, {
        resourceId: seed.resourceId,
      })
    ).toEqual([seed.eventTypeId]);
    expect(
      (
        await t.query(api.resource_event_types.getResourcesForEventType, {
          eventTypeId: seed.eventTypeId,
        })
      ).map((resource) => resource.id)
    ).toEqual([seed.resourceId]);
    expect(
      (
        await t.query(api.resource_event_types.getEventTypesForResource, {
          resourceId: seed.resourceId,
        })
      ).map((eventType) => eventType.id)
    ).toEqual([seed.eventTypeId]);

    const booking = await book(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"));
    const held = await hold(t, seed, utc(TUESDAY, "12:00"), utc(TUESDAY, "13:00"));
    expect([booking.status, held.status]).toEqual(["confirmed", "provisional"]);
    // Reads never repair: link-table writes stay out of the booking path.
    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(2);
  });

  test("linkResourceToEventType keeps the first row and drops the rest", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const [first] = await t.run(async (ctx) =>
      (await ctx.db.query("resource_event_types").collect()).map((row) => row._id)
    );
    await seedDuplicate(t, seed);

    const id: Id<"resource_event_types"> = await t.mutation(
      api.resource_event_types.linkResourceToEventType,
      pairOf(seed)
    );

    expect(id).toBe(first);
    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);
  });

  test("unlinkResourceFromEventType removes every row of the pair", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedDuplicate(t, seed);

    expect(
      await t.mutation(api.resource_event_types.unlinkResourceFromEventType, pairOf(seed))
    ).toEqual({ success: true, existed: true });

    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(0);
    expect(await t.query(api.resource_event_types.hasResourceEventTypeLink, pairOf(seed))).toBe(false);
    await expect(book(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"))).rejects.toThrow(
      "Resource is not available for this event type"
    );
  });

  test("a replace that keeps the pair collapses it, from either side", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedDuplicate(t, seed);
    await t.mutation(api.resource_event_types.setResourcesForEventType, {
      eventTypeId: seed.eventTypeId,
      resourceIds: [seed.resourceId],
    });
    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);

    await seedDuplicate(t, seed);
    await t.mutation(api.resource_event_types.setEventTypesForResource, {
      resourceId: seed.resourceId,
      eventTypeIds: [seed.eventTypeId],
    });
    expect(await linkRows(t, seed.resourceId, seed.eventTypeId)).toBe(1);
  });
});
