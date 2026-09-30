/**
 * 0.5.0 link rules (plan PR-52 links, PR-57; decisions D7, D26).
 *
 * - N13: an event type with an organization is linked only to resources of
 *   that organization. Event types without one stay global (legacy). The
 *   replace mutations reject the whole call.
 * - N12: deleteResource and deleteEventType delete their link rows in the
 *   same transaction, after the booking guard, so a re-created id starts
 *   unlinked.
 *
 * Converted from the verification probes ll-skeptic/zz-cv-lls-crossorg and
 * ll/zz-cv-ll-dangling, which pinned the 0.4.x behaviour.
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api.js";
import type { BookingErrorData } from "../shared/booking-errors.js";
import { TUESDAY, TZ, book, seedResource, setup, utc, type T } from "./setup.test.js";

async function mkResource(t: T, id: string, organizationId: string) {
  await t.mutation(api.resources.createResource, { id, organizationId, name: id, type: "room", timezone: TZ });
}
async function mkEvent(t: T, id: string, organizationId?: string) {
  await t.mutation(api.public.createEventType, {
    id, slug: id, title: id, lengthInMinutes: 60, timezone: TZ, lockTimeZoneToggle: false, locations: [],
    organizationId, minNoticeMinutes: 0, maxFutureMinutes: 365 * 24 * 60,
  });
}

/** The rejection's `data` (code + message), or "resolved". */
async function failure(call: Promise<unknown>): Promise<BookingErrorData | "resolved"> {
  try {
    await call;
    return "resolved";
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    return (error as ConvexError<BookingErrorData>).data;
  }
}

const linkIds = (t: T, eventTypeId: string) =>
  t.query(api.resource_event_types.getResourceIdsForEventType, { eventTypeId });
const eventTypeIds = (t: T, resourceId: string) =>
  t.query(api.resource_event_types.getEventTypeIdsForResource, { resourceId });

describe("links across organizations (N13)", () => {
  test("linkResourceToEventType rejects a resource of another organization; same-organization and global links work", async () => {
    const { t } = setup();
    await mkResource(t, "room-a", "org-A");
    await mkResource(t, "room-a2", "org-A");
    await mkEvent(t, "et-a", "org-A");
    await mkEvent(t, "et-b", "org-B");
    await mkEvent(t, "et-global"); // no organization

    expect(await failure(
      t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "room-a", eventTypeId: "et-b" }),
    )).toEqual({
      code: "ORGANIZATION_MISMATCH",
      message: 'Resource "room-a" of organization "org-A" cannot be linked to event type "et-b" of organization "org-B"',
    });
    expect(await eventTypeIds(t, "room-a")).toEqual([]);

    // CONTROLS: the same organization, and an event type without one.
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "room-a2", eventTypeId: "et-a" });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "room-a", eventTypeId: "et-global" });
    expect(await linkIds(t, "et-a")).toEqual(["room-a2"]);
    expect(await linkIds(t, "et-global")).toEqual(["room-a"]);
    const same = await book(t, { resourceId: "room-a2", eventTypeId: "et-a", timezone: "UTC" }, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));
    expect(same.organizationId).toBe("org-A");
  });

  test("setEventTypesForResource rejects the whole call when one event type belongs to another organization", async () => {
    const { t } = setup();
    await mkResource(t, "room-a", "org-A");
    await mkEvent(t, "et-a", "org-A");
    await mkEvent(t, "et-a2", "org-A");
    await mkEvent(t, "et-b", "org-B");
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "room-a", eventTypeId: "et-a" });

    expect(await failure(
      t.mutation(api.resource_event_types.setEventTypesForResource, { resourceId: "room-a", eventTypeIds: ["et-a2", "et-b"] }),
    )).toEqual({
      code: "ORGANIZATION_MISMATCH",
      message: 'Resource "room-a" of organization "org-A" cannot be linked to event type "et-b" of organization "org-B"',
    });
    // Nothing changed: the old link stays and et-a2 was not linked.
    expect(await eventTypeIds(t, "room-a")).toEqual(["et-a"]);

    // CONTROL: without the foreign event type (unknown ids are still skipped).
    expect(await t.mutation(api.resource_event_types.setEventTypesForResource, {
      resourceId: "room-a", eventTypeIds: ["et-a2", "no-such-event"],
    })).toEqual({ success: true });
    expect(await eventTypeIds(t, "room-a")).toEqual(["et-a2"]);
  });

  test("setResourcesForEventType rejects the whole call when one resource belongs to another organization", async () => {
    const { t } = setup();
    await mkResource(t, "room-a", "org-A");
    await mkResource(t, "room-a2", "org-A");
    await mkResource(t, "room-b", "org-B");
    await mkEvent(t, "et-a", "org-A");
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "room-a", eventTypeId: "et-a" });

    expect(await failure(
      t.mutation(api.resource_event_types.setResourcesForEventType, { eventTypeId: "et-a", resourceIds: ["room-a2", "room-b"] }),
    )).toEqual({
      code: "ORGANIZATION_MISMATCH",
      message: 'Resource "room-b" of organization "org-B" cannot be linked to event type "et-a" of organization "org-A"',
    });
    expect(await linkIds(t, "et-a")).toEqual(["room-a"]);

    // CONTROL: the same organization only (unknown ids are still skipped).
    expect(await t.mutation(api.resource_event_types.setResourcesForEventType, {
      eventTypeId: "et-a", resourceIds: ["room-a2", "no-such-room"],
    })).toEqual({ success: true });
    expect(await linkIds(t, "et-a")).toEqual(["room-a2"]);
  });

  test("an event type without organization stays global: resources of any organization link", async () => {
    const { t } = setup();
    await mkResource(t, "room-a", "org-A");
    await mkResource(t, "room-b", "org-B");
    await mkEvent(t, "et-global");
    expect(await t.mutation(api.resource_event_types.setResourcesForEventType, {
      eventTypeId: "et-global", resourceIds: ["room-a", "room-b"],
    })).toEqual({ success: true });
    expect(await linkIds(t, "et-global")).toEqual(["room-a", "room-b"]);
    expect(await t.mutation(api.resource_event_types.setEventTypesForResource, {
      resourceId: "room-b", eventTypeIds: ["et-global"],
    })).toEqual({ success: true });
  });
});

describe("deletes remove their links (N12)", () => {
  test("deleteResource: a resource created again with the same id starts unlinked", async () => {
    const { t } = setup();
    const s = await seedResource(t); // res-1 linked to et-1, no bookings
    expect(await t.mutation(api.resources.deleteResource, { id: s.resourceId })).toEqual({ success: true });
    expect(await linkIds(t, s.eventTypeId)).toEqual([]);

    await mkResource(t, s.resourceId, s.organizationId);
    expect(await t.query(api.resource_event_types.hasResourceEventTypeLink, {
      resourceId: s.resourceId, eventTypeId: s.eventTypeId,
    })).toBe(false);
    expect(await failure(book(t, s, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00")))).toEqual({
      code: "RESOURCE_NOT_LINKED",
      message: "Resource is not available for this event type",
    });
    // CONTROL: linking it again makes it bookable.
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: s.resourceId, eventTypeId: s.eventTypeId });
    expect((await book(t, s, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"))).status).toBe("confirmed");
  });

  test("deleteEventType: an event type created again with the same id has no resources", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await mkResource(t, "res-2", s.organizationId);
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "res-2", eventTypeId: s.eventTypeId });
    expect(await t.mutation(api.public.deleteEventType, { id: s.eventTypeId })).toEqual({ success: true });
    expect(await eventTypeIds(t, s.resourceId)).toEqual([]);
    expect(await eventTypeIds(t, "res-2")).toEqual([]);

    await mkEvent(t, s.eventTypeId, s.organizationId);
    expect(await t.query(api.resource_event_types.getEventTypesForResource, { resourceId: s.resourceId })).toEqual([]);
  });

  test("a refused delete keeps its links", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await book(t, s, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));
    expect(await failure(t.mutation(api.resources.deleteResource, { id: s.resourceId }))).toMatchObject({ code: "RESOURCE_IN_USE" });
    expect(await failure(t.mutation(api.public.deleteEventType, { id: s.eventTypeId }))).toMatchObject({ code: "EVENT_TYPE_IN_USE" });
    expect(await linkIds(t, s.eventTypeId)).toEqual([s.resourceId]);
  });

  test("other pairs are untouched", async () => {
    const { t } = setup();
    const s = await seedResource(t);
    await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: s.resourceId, eventTypeId: "et-2" });
    await t.mutation(api.resources.deleteResource, { id: "res-2" });
    expect(await linkIds(t, "et-2")).toEqual([s.resourceId]);
    expect(await eventTypeIds(t, s.resourceId)).toEqual([s.eventTypeId, "et-2"]);
  });
});
