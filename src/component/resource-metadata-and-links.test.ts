/// <reference types="vite/client" />
// Feature #9 (free-form `resources.metadata`) and feature #4 (the
// `by_resource_event_type` compound index behind every resource ↔ event type
// link lookup, including the createBooking / createProvisionalBooking guard).
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import {
  BOOKER,
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
  type T,
} from "./setup.test.js";

const RESOURCE = "res-1";
const EVENT = "et-1";

type CreateResourceArgs = (typeof api.resources.createResource)["_args"];
type CreateEventTypeArgs = (typeof api.public.createEventType)["_args"];

/** createResource with the fixture defaults; `extra` overrides any arg. */
function addResource(t: T, id: string, extra: Partial<CreateResourceArgs> = {}) {
  return t.mutation(api.resources.createResource, {
    id,
    organizationId: ORG,
    name: `Resource ${id}`,
    type: "room",
    timezone: TZ,
    ...extra,
  });
}

/** createEventType with the fixture defaults (60 min, no booking window limits). */
function addEventType(t: T, id: string, extra: Partial<CreateEventTypeArgs> = {}) {
  return t.mutation(api.public.createEventType, {
    id,
    slug: id,
    title: `Event ${id}`,
    lengthInMinutes: 60,
    slotInterval: 60,
    timezone: TZ,
    lockTimeZoneToggle: false,
    locations: [],
    organizationId: ORG,
    minNoticeMinutes: 0,
    maxFutureMinutes: 365 * 24 * 60,
    ...extra,
  });
}

/** Stored metadata map of a resource (looked up by external id). */
async function metadataOf(t: T, id: string): Promise<Record<string, string> | undefined> {
  const resource = await t.query(api.resources.getResource, { id });
  return resource?.metadata;
}

const link = (t: T, resourceId: string, eventTypeId: string) =>
  t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId, eventTypeId });

const unlink = (t: T, resourceId: string, eventTypeId: string) =>
  t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId, eventTypeId });

const hasLink = (t: T, resourceId: string, eventTypeId: string) =>
  t.query(api.resource_event_types.hasResourceEventTypeLink, { resourceId, eventTypeId });

/** Sorted event type ids linked to a resource (raw link rows, no existence filter). */
async function linkedEventTypeIds(t: T, resourceId: string): Promise<string[]> {
  const ids = await t.query(api.resource_event_types.getEventTypeIdsForResource, { resourceId });
  return [...ids].sort();
}

/** Sorted resource ids linked to an event type (raw link rows, no existence filter). */
async function linkedResourceIds(t: T, eventTypeId: string): Promise<string[]> {
  const ids = await t.query(api.resource_event_types.getResourceIdsForEventType, { eventTypeId });
  return [...ids].sort();
}

let t: T;

beforeEach(() => {
  ({ t } = setup());
});

// ============================================
// #9 — createResource metadata
// ============================================

describe("createResource metadata", () => {
  test("the map is stored verbatim and reachable through every resource read path", async () => {
    const metadata = { role: "host", email: "x@y.z" };
    const docId = await addResource(t, RESOURCE, { metadata });

    expect(await metadataOf(t, RESOURCE)).toEqual(metadata);
    expect((await t.query(api.resources.getResourceById, { resourceId: docId }))?.metadata).toEqual(
      metadata
    );

    const listed = await t.query(api.resources.listResources, { organizationId: ORG });
    expect(listed.map((r) => r.metadata)).toEqual([metadata]);
    const byType = await t.query(api.resources.listResourcesByType, {
      organizationId: ORG,
      type: "room",
    });
    expect(byType.map((r) => r.metadata)).toEqual([metadata]);
  });

  test("omitting metadata leaves it undefined; an explicit empty map is kept as {}", async () => {
    await addResource(t, "res-none");
    await addResource(t, "res-empty", { metadata: {} });

    expect(await metadataOf(t, "res-none")).toBeUndefined();
    // {} is a real stored value, not the same thing as "no metadata".
    expect(await metadataOf(t, "res-empty")).toEqual({});
    expect(await metadataOf(t, "res-empty")).not.toBeUndefined();
  });

  test("values are opaque strings — empty, unicode and address-like ones survive", async () => {
    const metadata = {
      role: "host",
      email: "x@y.z",
      note: "",
      displayName: "Ürsula ✨",
      externalUserId: "user|1234",
    };
    await addResource(t, RESOURCE, { metadata });
    expect(await metadataOf(t, RESOURCE)).toEqual(metadata);
  });
});

// ============================================
// #9 — updateResource metadata
// ============================================

describe("updateResource metadata", () => {
  test("adds a map to a resource created without one and returns its document id", async () => {
    const docId = await addResource(t, RESOURCE);
    expect(await metadataOf(t, RESOURCE)).toBeUndefined();

    const returned = await t.mutation(api.resources.updateResource, {
      id: RESOURCE,
      metadata: { role: "host", email: "x@y.z" },
    });
    expect(returned).toBe(docId);
    expect((await t.query(api.resources.getResourceById, { resourceId: docId }))?.metadata).toEqual({
      role: "host",
      email: "x@y.z",
    });
  });

  test("replaces the whole map — omitted keys disappear and {} empties it", async () => {
    await addResource(t, RESOURCE, {
      metadata: { role: "host", email: "x@y.z", shift: "morning" },
    });

    // Partial-looking patch: everything not repeated is gone.
    await t.mutation(api.resources.updateResource, { id: RESOURCE, metadata: { role: "guest" } });
    expect(await metadataOf(t, RESOURCE)).toEqual({ role: "guest" });

    // Even the key that survived the previous write disappears in turn.
    await t.mutation(api.resources.updateResource, {
      id: RESOURCE,
      metadata: { email: "new@y.z" },
    });
    expect(await metadataOf(t, RESOURCE)).toEqual({ email: "new@y.z" });

    // There is no clear form: the closest is an empty map, which stays a map.
    await t.mutation(api.resources.updateResource, { id: RESOURCE, metadata: {} });
    expect(await metadataOf(t, RESOURCE)).toEqual({});

    // Unrelated fields were never touched by any of it.
    expect(await t.query(api.resources.getResource, { id: RESOURCE })).toMatchObject({
      name: `Resource ${RESOURCE}`,
      type: "room",
      isActive: true,
    });
  });

  test("updates that omit metadata keep the stored map, including toggleResourceActive", async () => {
    const metadata = { role: "host", email: "x@y.z" };
    await addResource(t, RESOURCE, { metadata });

    await t.mutation(api.resources.updateResource, {
      id: RESOURCE,
      name: "Room B",
      type: "person",
      description: "renamed",
      timezone: "UTC",
      isActive: false,
    });
    expect(await t.query(api.resources.getResource, { id: RESOURCE })).toMatchObject({
      name: "Room B",
      type: "person",
      description: "renamed",
      timezone: "UTC",
      isActive: false,
      metadata,
    });

    expect(await t.mutation(api.resources.toggleResourceActive, { id: RESOURCE, isActive: true }))
      .toEqual({ success: true, affectedUsers: 0 });
    expect(await metadataOf(t, RESOURCE)).toEqual(metadata);
  });

  test("updating an unknown resource throws before writing anything", async () => {
    await expect(
      t.mutation(api.resources.updateResource, { id: "ghost", metadata: { role: "host" } })
    ).rejects.toThrow('Resource "ghost" not found');
    expect(await t.query(api.resources.listResources, { organizationId: ORG })).toEqual([]);
  });
});

// ============================================
// #4 — link lookups through the compound index
// ============================================

describe("resource ↔ event type links", () => {
  test("hasResourceEventTypeLink is direction-sensitive and false for unknown pairs", async () => {
    await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    await addResource(t, "res-2");
    await addEventType(t, "et-2");

    expect(await hasLink(t, RESOURCE, EVENT)).toBe(true);
    // Same resource, other event type / same event type, other resource.
    expect(await hasLink(t, RESOURCE, "et-2")).toBe(false);
    expect(await hasLink(t, "res-2", EVENT)).toBe(false);
    // The compound index is (resourceId, eventTypeId): swapping the two must not match.
    expect(await hasLink(t, EVENT, RESOURCE)).toBe(false);
    // Ids that exist in neither table.
    expect(await hasLink(t, "ghost", "ghost-et")).toBe(false);
  });

  test("linkResourceToEventType is idempotent: same row id, no duplicate", async () => {
    await addResource(t, RESOURCE);
    await addEventType(t, EVENT);

    const first = await link(t, RESOURCE, EVENT);
    const second = await link(t, RESOURCE, EVENT);
    const third = await link(t, RESOURCE, EVENT);
    expect(second).toBe(first);
    expect(third).toBe(first);

    expect(await linkedEventTypeIds(t, RESOURCE)).toHaveLength(1);
    expect(await linkedResourceIds(t, EVENT)).toHaveLength(1);
    // A duplicate row would make the .unique() lookups throw instead of answering.
    expect(await hasLink(t, RESOURCE, EVENT)).toBe(true);
    expect(
      (await t.query(api.resource_event_types.getEventTypesForResource, { resourceId: RESOURCE }))
        .map((et) => et?.id) // getEventTypesForResource filters nulls at runtime, but its declared type keeps them
    ).toEqual([EVENT]);
  });

  test("linkResourceToEventType validates both sides before inserting", async () => {
    await addResource(t, RESOURCE);
    await addEventType(t, EVENT);

    await expect(link(t, "ghost", EVENT)).rejects.toThrow('Resource "ghost" not found');
    await expect(link(t, RESOURCE, "ghost-et")).rejects.toThrow('Event type "ghost-et" not found');
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual([]);
    expect(await linkedResourceIds(t, EVENT)).toEqual([]);
  });

  test("unlinkResourceFromEventType removes exactly one link and is a no-op afterwards", async () => {
    await addResource(t, RESOURCE);
    await addResource(t, "res-2");
    await addEventType(t, EVENT);
    await addEventType(t, "et-2");
    // Matrix: res-1 ↔ et-1, res-1 ↔ et-2, res-2 ↔ et-1.
    await link(t, RESOURCE, EVENT);
    await link(t, RESOURCE, "et-2");
    await link(t, "res-2", EVENT);

    expect(await unlink(t, RESOURCE, EVENT)).toEqual({ success: true, existed: true });
    expect(await hasLink(t, RESOURCE, EVENT)).toBe(false);
    expect(await hasLink(t, RESOURCE, "et-2")).toBe(true);
    expect(await hasLink(t, "res-2", EVENT)).toBe(true);
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual(["et-2"]);
    expect(await linkedResourceIds(t, EVENT)).toEqual(["res-2"]);

    // Unlinking again (and unlinking a pair that never existed) is a reported no-op.
    expect(await unlink(t, RESOURCE, EVENT)).toEqual({ success: true, existed: false });
    expect(await unlink(t, "ghost", "ghost-et")).toEqual({ success: true, existed: false });
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual(["et-2"]);
    expect(await linkedResourceIds(t, EVENT)).toEqual(["res-2"]);
  });

  test("setResourcesForEventType replaces the set, skips unknown ids and can clear it", async () => {
    await addResource(t, RESOURCE);
    await addResource(t, "res-2");
    await addResource(t, "res-3");
    await addEventType(t, EVENT);
    await addEventType(t, "et-2");
    await link(t, RESOURCE, EVENT);
    await link(t, "res-2", EVENT);
    await link(t, RESOURCE, "et-2"); // must survive every write below

    const setResources = (resourceIds: string[]) =>
      t.mutation(api.resource_event_types.setResourcesForEventType, {
        eventTypeId: EVENT,
        resourceIds,
      });

    // res-1 dropped, res-2 kept, res-3 added.
    expect(await setResources(["res-2", "res-3"])).toEqual({ success: true });
    expect(await linkedResourceIds(t, EVENT)).toEqual(["res-2", "res-3"]);
    expect(await hasLink(t, RESOURCE, EVENT)).toBe(false);
    expect(await hasLink(t, RESOURCE, "et-2")).toBe(true);

    // Unknown resource ids are silently skipped, the known ones still applied.
    await setResources([RESOURCE, "ghost"]);
    expect(await linkedResourceIds(t, EVENT)).toEqual([RESOURCE]);

    // The empty set clears every link of this event type only.
    await setResources([]);
    expect(await linkedResourceIds(t, EVENT)).toEqual([]);
    expect(await linkedResourceIds(t, "et-2")).toEqual([RESOURCE]);

    await expect(
      t.mutation(api.resource_event_types.setResourcesForEventType, {
        eventTypeId: "ghost-et",
        resourceIds: [RESOURCE],
      })
    ).rejects.toThrow('Event type "ghost-et" not found');
  });

  test("setEventTypesForResource mirrors it from the resource side", async () => {
    await addResource(t, RESOURCE);
    await addResource(t, "res-2");
    await addEventType(t, EVENT);
    await addEventType(t, "et-2");
    await link(t, RESOURCE, EVENT);
    await link(t, "res-2", EVENT); // must survive

    expect(
      await t.mutation(api.resource_event_types.setEventTypesForResource, {
        resourceId: RESOURCE,
        eventTypeIds: ["et-2", "ghost-et"],
      })
    ).toEqual({ success: true });
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual(["et-2"]);
    expect(await linkedResourceIds(t, EVENT)).toEqual(["res-2"]);

    await expect(
      t.mutation(api.resource_event_types.setEventTypesForResource, {
        resourceId: "ghost",
        eventTypeIds: [EVENT],
      })
    ).rejects.toThrow('Resource "ghost" not found');
  });

  test("the document lookups hide inactive/deleted rows that the id lists still report", async () => {
    await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    await addEventType(t, "et-2");
    await addResource(t, "res-2");
    await link(t, RESOURCE, "et-2");
    await link(t, "res-2", EVENT);

    const eventTypesFor = async (resourceId: string) =>
      (await t.query(api.resource_event_types.getEventTypesForResource, { resourceId }))
        .map((et) => et?.id) // getEventTypesForResource filters nulls at runtime, but its declared type keeps them
        .sort();
    const resourcesFor = async (eventTypeId: string) =>
      (await t.query(api.resource_event_types.getResourcesForEventType, { eventTypeId }))
        .map((r) => r.id)
        .sort();

    expect(await eventTypesFor(RESOURCE)).toEqual([EVENT, "et-2"]);
    expect(await resourcesFor(EVENT)).toEqual([RESOURCE, "res-2"]);

    // Deactivated event types drop out of the document view, the link stays.
    await t.mutation(api.public.toggleEventTypeActive, { id: "et-2", isActive: false });
    expect(await eventTypesFor(RESOURCE)).toEqual([EVENT]);
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual([EVENT, "et-2"]);

    // Deleting the rows leaves dangling links; the document views filter the nulls.
    expect(await t.mutation(api.public.deleteEventType, { id: "et-2" })).toEqual({ success: true });
    expect(await t.mutation(api.resources.deleteResource, { id: "res-2" })).toEqual({
      success: true,
    });
    expect(await eventTypesFor(RESOURCE)).toEqual([EVENT]);
    expect(await resourcesFor(EVENT)).toEqual([RESOURCE]);
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual([EVENT, "et-2"]);
    expect(await linkedResourceIds(t, EVENT)).toEqual([RESOURCE, "res-2"]);

    // The explicit cleanup mutations are what actually removes them.
    expect(
      await t.mutation(api.resource_event_types.deleteAllLinksForEventType, {
        eventTypeId: "et-2",
      })
    ).toEqual({ deleted: 1 });
    expect(
      await t.mutation(api.resource_event_types.deleteAllLinksForResource, { resourceId: "res-2" })
    ).toEqual({ deleted: 1 });
    expect(await linkedEventTypeIds(t, RESOURCE)).toEqual([EVENT]);
    expect(await linkedResourceIds(t, EVENT)).toEqual([RESOURCE]);
  });
});

// ============================================
// #4 — the booking guard on top of the link
// ============================================

describe("createBooking link guard", () => {
  const START = utc(TUESDAY, "09:00");
  const END = utc(TUESDAY, "10:00");

  test("an unlinked resource/event type pair is rejected and nothing is written", async () => {
    await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    await addResource(t, "res-2"); // exists, active, but not linked to et-1

    await expect(
      book(t, { resourceId: "res-2", eventTypeId: EVENT, timezone: TZ }, START, END)
    ).rejects.toThrow("Resource is not available for this event type");

    expect(await t.query(api.public.listBookings, { resourceId: "res-2" })).toEqual([]);
    expect(await getBusySlots(t, "res-2", TUESDAY)).toBeNull();
  });

  test("createProvisionalBooking enforces the same guard on the same index", async () => {
    await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    await addResource(t, "res-2");

    const provisional = (resourceId: string) =>
      t.mutation(api.public.createProvisionalBooking, {
        eventTypeId: EVENT,
        resourceId,
        start: START,
        end: END,
        timezone: TZ,
        booker: BOOKER,
        location: LOCATION,
      });

    await expect(provisional("res-2")).rejects.toThrow(
      "Resource is not available for this event type"
    );
    expect(await getBusySlots(t, "res-2", TUESDAY)).toBeNull();

    // Linking the pair makes the very same call succeed.
    await link(t, "res-2", EVENT);
    expect(await provisional("res-2")).toMatchObject({
      status: "provisional",
      resourceId: "res-2",
      eventTypeId: EVENT,
    });
    expect(await getBusySlots(t, "res-2", TUESDAY)).toEqual(range(36, 40));
  });

  test("existence and active checks run before the link check", async () => {
    await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    await addResource(t, "res-2"); // never linked

    // Unknown event type / unknown resource never reach the link lookup.
    await expect(
      book(t, { resourceId: RESOURCE, eventTypeId: "ghost-et", timezone: TZ }, START, END)
    ).rejects.toThrow("Event type not found");
    await expect(
      book(t, { resourceId: "ghost", eventTypeId: EVENT, timezone: TZ }, START, END)
    ).rejects.toThrow("Resource not found");

    // An inactive but unlinked resource reports the active check, not the link check.
    await t.mutation(api.resources.toggleResourceActive, { id: "res-2", isActive: false });
    await expect(
      book(t, { resourceId: "res-2", eventTypeId: EVENT, timezone: TZ }, START, END)
    ).rejects.toThrow("Resource is no longer active");

    // An inactive event type outranks the link check for a properly linked resource.
    await t.mutation(api.public.toggleEventTypeActive, { id: EVENT, isActive: false });
    await expect(
      book(t, { resourceId: RESOURCE, eventTypeId: EVENT, timezone: TZ }, START, END)
    ).rejects.toThrow("Event type is no longer active");
  });

  test("unlinking after a booking blocks new ones but keeps the existing booking", async () => {
    const seed = await seedResource(t, { resourceId: RESOURCE, eventTypeId: EVENT });
    const booking = await book(t, seed, START, END);
    expect(booking?.status).toBe("confirmed");

    expect(await unlink(t, RESOURCE, EVENT)).toEqual({ success: true, existed: true });
    await expect(
      book(t, seed, utc(TUESDAY, "11:00"), utc(TUESDAY, "12:00"))
    ).rejects.toThrow("Resource is not available for this event type");

    // The booking that was made while the link existed is untouched.
    const stored = await t.query(api.public.listBookings, { resourceId: RESOURCE });
    expect(stored.map((b) => b.uid)).toEqual([booking?.uid]);
    expect(await getBusySlots(t, RESOURCE, TUESDAY)).toEqual(range(36, 40));

    // Re-linking through the set mutation restores bookability.
    await t.mutation(api.resource_event_types.setResourcesForEventType, {
      eventTypeId: EVENT,
      resourceIds: [RESOURCE],
    });
    const second = await book(t, seed, utc(TUESDAY, "11:00"), utc(TUESDAY, "12:00"));
    expect(second?.status).toBe("confirmed");
    expect(await getBusySlots(t, RESOURCE, TUESDAY)).toEqual([...range(36, 40), ...range(44, 48)]);
  });
});
