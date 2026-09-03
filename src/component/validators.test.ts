/// <reference types="vite/client" />
/**
 * validators.ts — schema-derived document validators and shared result shapes.
 *
 * The document validators are `schema.tables.<t>.validator.extend({ _id,
 * _creationTime })`. Convex object validators are EXACT (an unknown field
 * fails), so a validator that drifted from a table would throw on every read
 * once it is used as `returns:`. This file pins, for EVERY table in schema.ts:
 *   - a minimal row (required fields only) written through convex-test, read
 *     back with its system fields, passes the runtime validator check
 *     (`validate` from convex-helpers, which rejects unknown fields and — with
 *     `db` — checks that ids belong to the declared table),
 *   - the validator's field set is exactly the table's fields + `_id` +
 *     `_creationTime`, with `_id` bound to the right table,
 *   - `Doc<"t">` and `Infer<typeof <t>Doc>` are the same type (tsc),
 * plus fully populated rows for the three richest tables, the exactness
 * rules (unknown field / missing system field / foreign id), the composite
 * `bookingWithItemsDoc`, and the small result validators.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { validate } from "convex-helpers/validators";
import type { GenericDatabaseReader, GenericDataModel, SystemTableNames } from "convex/server";
import type { Infer } from "convex/values";
import schema from "./schema.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id, TableNames } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { BOOKER, FIXED_NOW, ORG, TUESDAY, TZ, setup, utc } from "./setup.test.js";
import {
  bookingDoc,
  bookingHistoryDoc,
  bookingItemDoc,
  bookingWithItemsDoc,
  cancelResult,
  dailyAvailabilityDoc,
  dateOverrideDoc,
  deletedCount,
  eventTypeDoc,
  hookDoc,
  presenceDoc,
  presenceHeartbeatDoc,
  quantityAvailabilityDoc,
  resourceDoc,
  resourceEventTypeDoc,
  scheduleDoc,
  successResult,
  successWithAffectedUsers,
} from "./validators.js";

// ============================================
// TABLE -> VALIDATOR MAP
// ============================================

/** Every table must have a document validator (`satisfies` makes a new table a type error). */
const DOC_VALIDATORS = {
  resources: resourceDoc,
  schedules: scheduleDoc,
  date_overrides: dateOverrideDoc,
  event_types: eventTypeDoc,
  resource_event_types: resourceEventTypeDoc,
  daily_availability: dailyAvailabilityDoc,
  quantity_availability: quantityAvailabilityDoc,
  bookings: bookingDoc,
  booking_items: bookingItemDoc,
  booking_history: bookingHistoryDoc,
  presence: presenceDoc,
  presence_heartbeats: presenceHeartbeatDoc,
  hooks: hookDoc,
} satisfies Record<TableNames, unknown>;

const TABLES = Object.keys(schema.tables) as TableNames[];

const SLOT = new Date(utc(TUESDAY, "10:00")).toISOString();

// ============================================
// ID-AWARE VALIDATION
// ============================================

const isTable = (name: string): name is TableNames => name in schema.tables;
const isSystemTable = (name: string): name is SystemTableNames =>
  name === "_scheduled_functions" || name === "_storage";

/**
 * `validate(..., { db })` checks every `v.id("t")` with `db.normalizeId("t", id)`,
 * which refuses system tables (`presence_heartbeats.markAsGone` is a
 * `v.id("_scheduled_functions")`); route those to `db.system.normalizeId`.
 * `validate` uses nothing else from the reader.
 */
function idAwareReader(db: MutationCtx["db"]): GenericDatabaseReader<GenericDataModel> {
  const normalizeId: GenericDatabaseReader<GenericDataModel>["normalizeId"] = (tableName, id) => {
    if (isSystemTable(tableName)) return db.system.normalizeId(tableName, id);
    if (isTable(tableName)) return db.normalizeId(tableName, id);
    return null;
  };
  return { normalizeId } as GenericDatabaseReader<GenericDataModel>;
}

// ============================================
// SEEDING
// ============================================

/** Reads a row back with its system fields (`_id`, `_creationTime`). */
async function stored<K extends TableNames>(ctx: MutationCtx, id: Id<K>): Promise<Doc<K>> {
  const doc = await ctx.db.get(id);
  if (!doc) throw new Error(`row ${id} not found after insert`);
  return doc;
}

type SeededDocs = { [K in TableNames]: Doc<K> };

/**
 * Inserts ONE minimal row per table (required fields only; `v.id()` fields
 * point at rows written in the same transaction) and returns the stored docs.
 */
async function seedMinimalRows(ctx: MutationCtx): Promise<SeededDocs> {
  const now = FIXED_NOW;

  const resources = await ctx.db.insert("resources", {
    id: "res-1",
    organizationId: ORG,
    name: "Room 1",
    type: "room",
    timezone: TZ,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const schedules = await ctx.db.insert("schedules", {
    id: "sch-1",
    organizationId: ORG,
    name: "Office hours",
    timezone: TZ,
    isDefault: true,
    weeklyHours: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
    createdAt: now,
    updatedAt: now,
  });
  const date_overrides = await ctx.db.insert("date_overrides", {
    scheduleId: schedules,
    date: TUESDAY,
    type: "unavailable",
  });
  const event_types = await ctx.db.insert("event_types", {
    id: "et-1",
    slug: "et-1",
    title: "Consultation",
    lengthInMinutes: 60,
    timezone: TZ,
    lockTimeZoneToggle: false,
    locations: [{ type: "address" }],
  });
  const resource_event_types = await ctx.db.insert("resource_event_types", {
    resourceId: "res-1",
    eventTypeId: "et-1",
  });
  const daily_availability = await ctx.db.insert("daily_availability", {
    resourceId: "res-1",
    date: TUESDAY,
    busySlots: [36, 37, 38, 39],
  });
  const quantity_availability = await ctx.db.insert("quantity_availability", {
    resourceId: "res-1",
    date: TUESDAY,
    slotQuantities: { "36": 2, "37": 1 },
  });
  const bookings = await ctx.db.insert("bookings", {
    resourceId: "res-1",
    actorId: BOOKER.email,
    start: utc(TUESDAY, "10:00"),
    end: utc(TUESDAY, "11:00"),
    status: "confirmed",
    uid: "bk_minimal",
    eventTypeId: "et-1",
    timezone: TZ,
    bookerName: BOOKER.name,
    bookerEmail: BOOKER.email,
    eventTitle: "Consultation",
    location: { type: "address" },
    createdAt: now,
    updatedAt: now,
  });
  const booking_items = await ctx.db.insert("booking_items", {
    bookingId: bookings,
    resourceId: "res-1",
    quantity: 1,
  });
  const booking_history = await ctx.db.insert("booking_history", {
    bookingId: bookings,
    fromStatus: "pending",
    toStatus: "confirmed",
    timestamp: now,
  });
  const presence = await ctx.db.insert("presence", {
    resourceId: "res-1",
    user: "ada",
    slot: SLOT,
    updated: now,
  });
  // `markAsGone` is a v.id("_scheduled_functions") — only a real scheduled job id passes.
  const markAsGone = await ctx.scheduler.runAfter(0, internal.presence.cleanup, {
    resourceId: "res-1",
    slot: SLOT,
    user: "ada",
  });
  const presence_heartbeats = await ctx.db.insert("presence_heartbeats", {
    resourceId: "res-1",
    user: "ada",
    slot: SLOT,
    markAsGone,
  });
  const hooks = await ctx.db.insert("hooks", {
    eventType: "booking.created",
    functionHandle: "function://host/notify",
    enabled: true,
    createdAt: now,
  });

  return {
    resources: await stored(ctx, resources),
    schedules: await stored(ctx, schedules),
    date_overrides: await stored(ctx, date_overrides),
    event_types: await stored(ctx, event_types),
    resource_event_types: await stored(ctx, resource_event_types),
    daily_availability: await stored(ctx, daily_availability),
    quantity_availability: await stored(ctx, quantity_availability),
    bookings: await stored(ctx, bookings),
    booking_items: await stored(ctx, booking_items),
    booking_history: await stored(ctx, booking_history),
    presence: await stored(ctx, presence),
    presence_heartbeats: await stored(ctx, presence_heartbeats),
    hooks: await stored(ctx, hooks),
  };
}

// ============================================
// DOCUMENT VALIDATORS — one test per table
// ============================================

describe("document validators cover every table", () => {
  test("the validator map has exactly the tables of schema.ts", () => {
    expect(Object.keys(DOC_VALIDATORS).sort()).toEqual([...TABLES].sort());
  });

  for (const table of TABLES) {
    test(`${table}: a stored minimal row validates and the field set is schema + system fields`, async () => {
      const { t } = setup();
      const validator = DOC_VALIDATORS[table];

      // Runtime: the row as convex-test stores it (with _id/_creationTime).
      const ok = await t.run(async (ctx) => {
        const docs = await seedMinimalRows(ctx);
        const doc = docs[table];
        expect(doc._id).toBeTypeOf("string");
        expect(doc._creationTime).toBeTypeOf("number");
        return validate(validator, doc, { throw: true, db: idAwareReader(ctx.db) });
      });
      expect(ok).toBe(true);

      // Structure: exactly the table's fields plus the two system fields.
      const schemaFields = Object.keys(schema.tables[table].validator.fields);
      expect(Object.keys(validator.fields).sort()).toEqual(
        [...schemaFields, "_id", "_creationTime"].sort()
      );
      expect(validator.fields._id.kind).toBe("id");
      expect(validator.fields._id.tableName).toBe(table);
      expect(validator.fields._creationTime.kind).toBe("float64");
      expect(validator.kind).toBe("object");
      expect(validator.isOptional).toBe("required");
    });
  }

  test("Doc<table> and Infer<typeof <table>Doc> are the same type", () => {
    // Checked by `tsc --noEmit` (vitest's expectTypeOf is a runtime no-op).
    expectTypeOf<Doc<"resources">>().toEqualTypeOf<Infer<typeof resourceDoc>>();
    expectTypeOf<Doc<"schedules">>().toEqualTypeOf<Infer<typeof scheduleDoc>>();
    expectTypeOf<Doc<"date_overrides">>().toEqualTypeOf<Infer<typeof dateOverrideDoc>>();
    expectTypeOf<Doc<"event_types">>().toEqualTypeOf<Infer<typeof eventTypeDoc>>();
    expectTypeOf<Doc<"resource_event_types">>().toEqualTypeOf<
      Infer<typeof resourceEventTypeDoc>
    >();
    expectTypeOf<Doc<"daily_availability">>().toEqualTypeOf<
      Infer<typeof dailyAvailabilityDoc>
    >();
    expectTypeOf<Doc<"quantity_availability">>().toEqualTypeOf<
      Infer<typeof quantityAvailabilityDoc>
    >();
    expectTypeOf<Doc<"bookings">>().toEqualTypeOf<Infer<typeof bookingDoc>>();
    expectTypeOf<Doc<"booking_items">>().toEqualTypeOf<Infer<typeof bookingItemDoc>>();
    expectTypeOf<Doc<"booking_history">>().toEqualTypeOf<Infer<typeof bookingHistoryDoc>>();
    expectTypeOf<Doc<"presence">>().toEqualTypeOf<Infer<typeof presenceDoc>>();
    expectTypeOf<Doc<"presence_heartbeats">>().toEqualTypeOf<
      Infer<typeof presenceHeartbeatDoc>
    >();
    expectTypeOf<Doc<"hooks">>().toEqualTypeOf<Infer<typeof hookDoc>>();
  });
});

// ============================================
// FULLY POPULATED ROWS — every optional field present
// ============================================

describe("fully populated rows", () => {
  test("a booking with every optional field set validates", async () => {
    const { t } = setup();
    const ok = await t.run(async (ctx) => {
      const id = await ctx.db.insert("bookings", {
        resourceId: "res-1",
        actorId: BOOKER.email,
        start: utc(TUESDAY, "10:00"),
        end: utc(TUESDAY, "11:00"),
        status: "cancelled",
        uid: "bk_full",
        managementToken: "tok_full",
        eventTypeId: "et-1",
        organizationId: ORG,
        timezone: TZ,
        bookerName: BOOKER.name,
        bookerEmail: BOOKER.email,
        bookerPhone: "+49 30 1234567",
        bookerNotes: "Please prepare the projector.",
        eventTitle: "Consultation",
        eventDescription: "60 minutes",
        location: { type: "address", value: "Room 1" },
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        cancelledAt: FIXED_NOW,
        rescheduleUid: "bk_previous",
        cancellationReason: "Booker cancelled",
      });
      return validate(bookingDoc, await stored(ctx, id), { throw: true, db: idAwareReader(ctx.db) });
    });
    expect(ok).toBe(true);
  });

  test("a resource with quantity, fungibility, standalone flag and metadata validates", async () => {
    const { t } = setup();
    const ok = await t.run(async (ctx) => {
      const id = await ctx.db.insert("resources", {
        id: "pool-1",
        organizationId: ORG,
        name: "Projectors",
        type: "equipment",
        description: "Rental pool",
        timezone: TZ,
        quantity: 3,
        isFungible: true,
        isStandalone: false,
        metadata: { role: "rental", email: "gear@example.com" },
        isActive: false,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      return validate(resourceDoc, await stored(ctx, id), { throw: true, db: idAwareReader(ctx.db) });
    });
    expect(ok).toBe(true);
  });

  test("an event type with every optional field and nested location fields validates", async () => {
    const { t } = setup();
    const ok = await t.run(async (ctx) => {
      const id = await ctx.db.insert("event_types", {
        id: "et-full",
        slug: "et-full",
        title: "Studio Session",
        lengthInMinutes: 30,
        lengthInMinutesOptions: [30, 60, 90],
        slotInterval: 15,
        description: "Bring your own instrument",
        timezone: TZ,
        lockTimeZoneToggle: true,
        locations: [
          { type: "address", address: "Studio 2", public: true },
          { type: "link" },
        ],
        organizationId: ORG,
        scheduleId: "sch-1",
        bufferBefore: 10,
        bufferAfter: 5,
        minNoticeMinutes: 120,
        maxFutureMinutes: 60 * 24 * 30,
        requiresConfirmation: true,
        isActive: true,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      return validate(eventTypeDoc, await stored(ctx, id), { throw: true, db: idAwareReader(ctx.db) });
    });
    expect(ok).toBe(true);
  });
});

// ============================================
// EXACTNESS — what the validators must REJECT
// ============================================

describe("document validators are exact", () => {
  test("an unknown field, a missing system field and a foreign id are rejected", async () => {
    const { t } = setup();
    await t.run(async (ctx) => {
      const docs = await seedMinimalRows(ctx);
      const booking = docs.bookings;

      expect(validate(bookingDoc, booking, { db: idAwareReader(ctx.db) })).toBe(true);
      expect(validate(bookingDoc, { ...booking, extra: 1 })).toBe(false);
      expect(() => validate(bookingDoc, { ...booking, extra: 1 }, { throw: true })).toThrow(
        /extra/
      );

      const { _id, ...withoutId } = booking;
      expect(validate(bookingDoc, withoutId)).toBe(false);
      const { _creationTime, ...withoutCreationTime } = booking;
      expect(validate(bookingDoc, withoutCreationTime)).toBe(false);

      // `_id` from another table: only detectable with the db-aware id check.
      const foreign = { ...booking, _id: docs.resources._id };
      expect(validate(bookingDoc, foreign, { db: idAwareReader(ctx.db) })).toBe(false);

      // Non-objects are rejected outright.
      expect(validate(bookingDoc, null)).toBe(false);
      expect(validate(bookingDoc, "bk_1")).toBe(false);
    });
  });

  test("a status outside the documented set still validates (status stays v.string())", async () => {
    const { t } = setup();
    const ok = await t.run(async (ctx) => {
      const docs = await seedMinimalRows(ctx);
      return validate(bookingDoc, { ...docs.bookings, status: "legacy-status" });
    });
    expect(ok).toBe(true);
  });
});

// ============================================
// COMPOSITE — bookingWithItemsDoc
// ============================================

describe("bookingWithItemsDoc", () => {
  test("accepts the getBookingWithItems shape with resolved and missing resources", async () => {
    const { t } = setup();
    const ok = await t.run(async (ctx) => {
      const docs = await seedMinimalRows(ctx);
      const orphanItemId = await ctx.db.insert("booking_items", {
        bookingId: docs.bookings._id,
        resourceId: "res-gone",
        quantity: 2,
      });
      const items = await ctx.db
        .query("booking_items")
        .withIndex("by_booking", (q) => q.eq("bookingId", docs.bookings._id))
        .collect();
      expect(items.map((i) => i._id).sort()).toEqual(
        [docs.booking_items._id, orphanItemId].sort()
      );

      // Mirrors multi_resource.getBookingWithItems: booking spread + items with resource | null.
      const withItems = {
        ...docs.bookings,
        items: await Promise.all(
          items.map(async (item) => ({
            ...item,
            resource: await ctx.db
              .query("resources")
              .withIndex("by_external_id", (q) => q.eq("id", item.resourceId))
              .unique(),
          }))
        ),
      };
      expect(withItems.items.map((i) => i.resource?.id ?? null).sort()).toEqual([null, "res-1"]);

      expect(validate(bookingWithItemsDoc, { ...withItems, items: [] })).toBe(true);
      expect(validate(bookingWithItemsDoc, docs.bookings)).toBe(false); // items missing
      expect(
        validate(bookingWithItemsDoc, {
          ...withItems,
          items: [{ ...withItems.items[0], resource: undefined }],
        })
      ).toBe(false); // resource must be a doc or null, never absent
      return validate(bookingWithItemsDoc, withItems, { throw: true, db: idAwareReader(ctx.db) });
    });
    expect(ok).toBe(true);
  });

  test("Infer<typeof bookingWithItemsDoc> matches the handler's spread shape", () => {
    type Expected = Doc<"bookings"> & {
      items: Array<Doc<"booking_items"> & { resource: Doc<"resources"> | null }>;
    };
    expectTypeOf<Infer<typeof bookingWithItemsDoc>>().toExtend<Expected>();
    expectTypeOf<Expected>().toExtend<Infer<typeof bookingWithItemsDoc>>();
  });
});

// ============================================
// RESULT VALIDATORS
// ============================================

describe("result validators", () => {
  test("successResult accepts exactly { success }", () => {
    expect(validate(successResult, { success: true })).toBe(true);
    expect(validate(successResult, { success: false })).toBe(true);
    expect(validate(successResult, {})).toBe(false);
    expect(validate(successResult, { success: "yes" })).toBe(false);
    expect(validate(successResult, { success: true, alreadyCancelled: false })).toBe(false);
    expectTypeOf<Infer<typeof successResult>>().toEqualTypeOf<{ success: boolean }>();
  });

  test("cancelResult accepts exactly { success, alreadyCancelled }", () => {
    expect(validate(cancelResult, { success: true, alreadyCancelled: true })).toBe(true);
    expect(validate(cancelResult, { success: true, alreadyCancelled: false })).toBe(true);
    expect(validate(cancelResult, { success: true })).toBe(false);
    expect(validate(cancelResult, { success: true, alreadyCancelled: false, reason: "x" })).toBe(
      false
    );
    expectTypeOf<Infer<typeof cancelResult>>().toEqualTypeOf<{
      success: boolean;
      alreadyCancelled: boolean;
    }>();
  });

  test("successWithAffectedUsers accepts exactly { success, affectedUsers }", () => {
    expect(validate(successWithAffectedUsers, { success: true, affectedUsers: 0 })).toBe(true);
    expect(validate(successWithAffectedUsers, { success: true, affectedUsers: 3 })).toBe(true);
    expect(validate(successWithAffectedUsers, { success: true })).toBe(false);
    expect(validate(successWithAffectedUsers, { success: true, affectedUsers: "3" })).toBe(false);
    expectTypeOf<Infer<typeof successWithAffectedUsers>>().toEqualTypeOf<{
      success: boolean;
      affectedUsers: number;
    }>();
  });

  test("deletedCount accepts exactly { deleted }", () => {
    expect(validate(deletedCount, { deleted: 0 })).toBe(true);
    expect(validate(deletedCount, { deleted: 12 })).toBe(true);
    expect(validate(deletedCount, {})).toBe(false);
    expect(validate(deletedCount, { deleted: 1, success: true })).toBe(false);
    expectTypeOf<Infer<typeof deletedCount>>().toEqualTypeOf<{ deleted: number }>();
  });
});
