/**
 * N14 (plan PR-58, decision D27 (A)): createEventType is an
 * organization-safe upsert. On an existing id it updates the fields given
 * and keeps the rest: `isActive ?? true` applies only on insert, so a re-run
 * does not reactivate a deactivated event type, and an omitted
 * organizationId keeps the stored one. It never re-homes an event type to a
 * different organization (ORGANIZATION_MISMATCH); adopting one stored
 * without organization stays allowed.
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

  test("an event type stored without organization can be adopted", async () => {
    const { t } = setup();
    await t.mutation(api.public.createEventType, etArgs("et-legacy", { organizationId: undefined }));
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-legacy" }))!.organizationId).toBeUndefined();
    await t.mutation(api.public.createEventType, etArgs("et-legacy", { organizationId: "org-2" }));
    expect((await t.query(api.public.getEventType, { eventTypeId: "et-legacy" }))!.organizationId).toBe("org-2");
  });
});
