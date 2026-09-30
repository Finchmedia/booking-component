/**
 * N14 (plan PR-58, decision D27 (A)): createEventType is an
 * organization-safe upsert. On an existing id it updates the fields given
 * and keeps the rest: `isActive ?? true` applies only on insert, so a re-run
 * does not reactivate a deactivated event type, and an omitted
 * organizationId keeps the stored one. It never re-homes an event type to a
 * different organization (ORGANIZATION_MISMATCH); adopting one stored
 * without organization stays allowed while every linked resource belongs to
 * the adopting organization (0.5.0 review: the links stay, so the adoption
 * must not create links across organizations).
 *
 * Converted from the verification probe gb/zz-cv-gb-n1-eventtype-upsert,
 * which pinned the 0.4.x reactivation and re-homing.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { ORG, TUESDAY, book, seedResource, setup, utc } from "./setup.test.js";

const etArgs = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  title: "Consultation",
  lengthInMinutes: 60,
  timezone: "Europe/Berlin",
  lockTimeZoneToggle: false,
  locations: [],
  organizationId: ORG,
  ...over,
});

describe("createEventType on an existing id", () => {
  test("an omitted isActive keeps a deactivated event type inactive", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.public.updateEventType, { id: seed.eventTypeId, description: "keep me", requiresConfirmation: true });
    await t.mutation(api.public.toggleEventTypeActive, { id: seed.eventTypeId, isActive: false });

    // A re-run of the same provisioning step, without isActive.
    await t.mutation(api.public.createEventType, etArgs(seed.eventTypeId, { title: "Consultation v2" }));
    const stored = (await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId }))!;
    expect({
      isActive: stored.isActive,
      title: stored.title,
      description: stored.description,
      requiresConfirmation: stored.requiresConfirmation,
    }).toEqual({ isActive: false, title: "Consultation v2", description: "keep me", requiresConfirmation: true });
    await expect(book(t, seed, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"))).rejects.toThrow("Event type is no longer active");

    // CONTROL: an explicit isActive still applies.
    await t.mutation(api.public.createEventType, etArgs(seed.eventTypeId, { isActive: true }));
    expect((await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId }))!.isActive).toBe(true);
    expect((await book(t, seed, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"))).status).toBe("pending");
  });

  test("a new event type is active unless isActive says otherwise (insert default unchanged)", async () => {
    const { t } = setup();
    await t.mutation(api.public.createEventType, etArgs("et-new"));
    await t.mutation(api.public.createEventType, etArgs("et-off", { isActive: false }));
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-new" }))!.isActive).toBe(true);
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-off" }))!.isActive).toBe(false);
  });

  test("an id of another organization is not re-homed", async () => {
    const { t } = setup();
    const seedA = await seedResource(t); // org-1: res-1, et-1, linked
    const before = (await t.query(api.public.getEventType, { eventTypeId: seedA.eventTypeId }))!;

    await expect(
      t.mutation(api.public.createEventType, etArgs(seedA.eventTypeId, { organizationId: "org-2", title: "Org 2 service" })),
    ).rejects.toMatchObject({
      data: { code: "ORGANIZATION_MISMATCH", message: 'Event type "et-1" belongs to another organization than "org-2"' },
    });
    expect(await t.query(api.public.getEventType, { eventTypeId: seedA.eventTypeId }))!.toEqual(before);
    expect(await t.query(api.public.listEventTypes, { organizationId: "org-2" })).toEqual([]);
    const booking = await book(t, seedA, utc(TUESDAY, "11:00"), utc(TUESDAY, "12:00"));
    expect([booking.organizationId, booking.eventTitle]).toEqual([ORG, "Consultation"]);
  });

  test("the same organization, or none given, updates in place and keeps the organization", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.public.createEventType, etArgs(seed.eventTypeId, { title: "Same org" }));
    await t.mutation(api.public.createEventType, etArgs(seed.eventTypeId, { title: "No org given", organizationId: undefined }));
    const stored = (await t.query(api.public.getEventType, { eventTypeId: seed.eventTypeId }))!;
    expect([stored.title, stored.organizationId]).toEqual(["No org given", ORG]);
  });

  test("adoption is refused while a resource of another organization is linked, and writes nothing", async () => {
    const { t } = setup();
    await t.mutation(api.public.createEventType, etArgs("et-g", { organizationId: undefined }));
    for (const [id, organizationId] of [["res-a", "org-a"], ["res-b", "org-b"]]) {
      await t.mutation(api.resources.createResource, { id, organizationId, name: id, type: "room", timezone: "UTC" });
      await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: id, eventTypeId: "et-g" });
    }
    // A link whose resource was deleted before 0.5.0 does not count.
    await t.run((ctx) => ctx.db.insert("resource_event_types", { resourceId: "gone", eventTypeId: "et-g" }));
    const booking = await book(t, { resourceId: "res-b", eventTypeId: "et-g", timezone: "UTC" }, utc(TUESDAY, "09:00"), utc(TUESDAY, "10:00"));
    const before = (await t.query(api.public.getEventType, { eventTypeId: "et-g" }))!;

    await expect(
      t.mutation(api.public.createEventType, etArgs("et-g", { organizationId: "org-a", title: "Adopted" })),
    ).rejects.toMatchObject({
      data: {
        code: "ORGANIZATION_MISMATCH",
        message: 'Event type "et-g" cannot join organization "org-a": its linked resource "res-b" belongs to organization "org-b". Unlink it first',
      },
    });
    expect(await t.query(api.public.getEventType, { eventTypeId: "et-g" })).toEqual(before);
    expect((await t.query(api.resource_event_types.getResourceIdsForEventType, { eventTypeId: "et-g" })).sort()).toEqual(["gone", "res-a", "res-b"]);
    // The booking on org-b's resource can still be moved (no ORGANIZATION_MISMATCH).
    const moved = await t.mutation(api.public.rescheduleBooking, { bookingId: booking._id, newStart: utc(TUESDAY, "11:00"), newEnd: utc(TUESDAY, "12:00") });
    expect([moved.status, moved.organizationId]).toEqual(["confirmed", undefined]);

    // CONTROL: unlinked, the adoption goes through and keeps the remaining link.
    await t.mutation(api.resource_event_types.unlinkResourceFromEventType, { resourceId: "res-b", eventTypeId: "et-g" });
    await t.mutation(api.public.createEventType, etArgs("et-g", { organizationId: "org-a", title: "Adopted" }));
    const adopted = (await t.query(api.public.getEventType, { eventTypeId: "et-g" }))!;
    expect([adopted.organizationId, adopted.title]).toEqual(["org-a", "Adopted"]);
    expect(await t.query(api.maintenance.audit, { check: "link_integrity", limit: 10 })).toMatchObject({
      issues: [{ check: "link_integrity", resourceId: "gone", eventTypeId: "et-g", problems: ["resourceMissing"] }],
    });
  });

  test("an event type stored without organization can be adopted", async () => {
    const { t } = setup();
    await t.mutation(api.public.createEventType, etArgs("et-legacy", { organizationId: undefined }));
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-legacy" }))!.organizationId).toBeUndefined();
    await t.mutation(api.public.createEventType, etArgs("et-legacy", { organizationId: "org-2" }));
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-legacy" }))!.organizationId).toBe("org-2");
  });
});
