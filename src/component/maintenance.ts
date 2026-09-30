// ============================================
// MAINTENANCE / RESET
// ============================================
//
// The component's tables are isolated from the host app — it cannot touch them
// through its own ctx.db. Demo sandboxes, seed scripts and test fixtures
// therefore need reset functions INSIDE the component.
//
// Two levels:
// - wipeAllBookingData: bookings + history + items + slot occupancy. Keeps the
//   setup (resources, schedules, overrides, event types, links, hooks) so the
//   calendar is empty but still bookable.
// - wipeAllData: everything above PLUS the setup tables. Presence tables are
//   left alone in both cases: they are transient real-time locks holding
//   references to scheduled functions (markAsGone) and expire on their own.
//
// Both mutations are unauthenticated at the component boundary — the host app
// decides who may call them (wrap them in an admin-only mutation).

import { v } from "convex/values";
import type { IndexRange } from "convex/server";
import {
  mutation,
  query,
  type DatabaseReader,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { parseCivilDate } from "../shared/time.js";
import { holdsActiveInventory } from "./inventory_helpers";
import { isValidTimeZone } from "./input_validation";
import { getOrganizationDefaultSchedule, getScheduleByExternalId, getWeeklySlots } from "./schedules";
import { getLocalDateAndSlot } from "./utils";

// Resets run on modest data sets; the batch keeps per-iteration memory small.
// Convex transaction limits remain the hard upper bound for a single call.
const DELETE_BATCH = 500;

type BookingDataTable =
  | "bookings"
  | "booking_history"
  | "booking_items"
  | "daily_availability"
  | "quantity_availability";

type SetupTable =
  | "resources"
  | "schedules"
  | "date_overrides"
  | "event_types"
  | "resource_event_types"
  | "hooks";

async function deleteAllRows(
  ctx: MutationCtx,
  table: BookingDataTable | SetupTable
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const rows = await ctx.db.query(table).take(DELETE_BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    deleted += rows.length;
    if (rows.length < DELETE_BATCH) break;
  }
  return deleted;
}

const bookingDataCounts = {
  bookings: v.number(),
  bookingHistory: v.number(),
  bookingItems: v.number(),
  dailyAvailability: v.number(),
  quantityAvailability: v.number(),
};

async function wipeBookingData(ctx: MutationCtx) {
  // Dependent rows first, then the bookings themselves.
  const bookingHistory = await deleteAllRows(ctx, "booking_history");
  const bookingItems = await deleteAllRows(ctx, "booking_items");
  const bookings = await deleteAllRows(ctx, "bookings");
  const dailyAvailability = await deleteAllRows(ctx, "daily_availability");
  const quantityAvailability = await deleteAllRows(ctx, "quantity_availability");

  return {
    bookings,
    bookingHistory,
    bookingItems,
    dailyAvailability,
    quantityAvailability,
  };
}

/**
 * Deletes ALL booking data (bookings + history + items + slot occupancy) but
 * keeps the setup (resources, schedules, event types, links, hooks). Afterwards
 * the calendar is empty and every slot is free again.
 */
export const wipeAllBookingData = mutation({
  args: {},
  returns: v.object(bookingDataCounts),
  handler: async (ctx) => {
    return await wipeBookingData(ctx);
  },
});

/**
 * Deletes ALL component data: booking data (see wipeAllBookingData) AND the
 * setup tables (resources, schedules, date overrides, event types,
 * resource ↔ event type links, hooks). Presence tables are left alone.
 * Intended for sandbox resets before re-seeding.
 */
export const wipeAllData = mutation({
  args: {},
  returns: v.object({
    ...bookingDataCounts,
    resources: v.number(),
    schedules: v.number(),
    dateOverrides: v.number(),
    eventTypes: v.number(),
    resourceEventTypes: v.number(),
    hooks: v.number(),
  }),
  handler: async (ctx) => {
    const bookingData = await wipeBookingData(ctx);

    // Dependent setup rows first (overrides reference schedules, links
    // reference resources/event types), then the parents.
    const dateOverrides = await deleteAllRows(ctx, "date_overrides");
    const resourceEventTypes = await deleteAllRows(ctx, "resource_event_types");
    const hooks = await deleteAllRows(ctx, "hooks");
    const schedules = await deleteAllRows(ctx, "schedules");
    const eventTypes = await deleteAllRows(ctx, "event_types");
    const resources = await deleteAllRows(ctx, "resources");

    return {
      ...bookingData,
      resources,
      schedules,
      dateOverrides,
      eventTypes,
      resourceEventTypes,
      hooks,
    };
  },
});

/**
 * Raw slot occupancy of one resource/day — for verification and debugging
 * (getDaySlots only returns the FREE slots and says nothing about bookings).
 * Returns the busySlots array, or null when no row exists for that day.
 */
export const getDailyAvailability = query({
  args: { resourceId: v.string(), date: v.string() },
  returns: v.union(v.null(), v.array(v.number())),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("daily_availability")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", args.resourceId).eq("date", args.date)
      )
      .unique();
    return row?.busySlots ?? null;
  },
});

// ============================================
// UPGRADE AUDIT (read-only)
// ============================================
//
// Component tables are private to the component, so hosts cannot check stored
// rows themselves. `audit` reports one check per call, one page at a time.

/**
 * Largest `limit` of one audit call. A booking costs one override read, plus,
 * once per page, its event type, its schedule and its organization's default
 * schedule (at most two single-document reads); an event type costs nothing
 * more.
 */
const MAX_AUDIT_LIMIT = 500;

/** `load(key)` once per key; later calls share its promise. */
function memoized<V>(cache: Map<string, Promise<V>>, key: string, load: () => Promise<V>): Promise<V> {
  let value = cache.get(key);
  if (!value) {
    value = load();
    cache.set(key, value);
  }
  return value;
}

type AuditTable = "bookings" | "event_types";

/**
 * A row's complete by_creation_time index key. Creation times can tie
 * (imported rows), so the time alone would skip or repeat rows at a page
 * boundary.
 */
type AuditCursor<T extends AuditTable> = { creationTime: number; id: Id<T> };

function encodeAuditCursor(row: { _creationTime: number; _id: string }): string {
  return JSON.stringify([row._creationTime, row._id]);
}

/** `name` labels the error: "audit" or "backfill". */
function parseAuditCursor<T extends AuditTable>(
  db: DatabaseReader,
  table: T,
  cursor: string,
  name = "audit"
): AuditCursor<T> {
  let key: unknown;
  try {
    key = JSON.parse(cursor);
  } catch {
    key = null;
  }
  if (Array.isArray(key) && key.length === 2 && Number.isFinite(key[0]) && typeof key[1] === "string") {
    const id = db.normalizeId(table, key[1]);
    if (id) return { creationTime: key[0], id };
  }
  throw new Error(`Invalid ${name} cursor`);
}

/**
 * The by_creation_time index every table has, typed for a table parameter
 * (the generated builder cannot resolve index fields for a generic table) and
 * with the _id tie-breaker that ends every index.
 */
type CreationTimeIndex<T extends AuditTable> = {
  withIndex(
    index: "by_creation_time",
    range?: (q: {
      eq(field: "_creationTime", value: number): { gt(field: "_id", value: Id<T>): IndexRange };
      gt(field: "_creationTime", value: number): IndexRange;
    }) => IndexRange
  ): { take(n: number): Promise<Doc<T>[]> };
};

/**
 * Up to `limit` rows after `cursor`, in by_creation_time order: the rest of
 * the cursor's tie group first, then the later creation times (the split
 * presence.sweepOrphanedHolds uses). The key is compared by value, so a
 * cursor row deleted in the meantime is fine.
 */
async function rowsAfter<T extends AuditTable>(
  db: DatabaseReader,
  table: T,
  cursor: AuditCursor<T> | null,
  limit: number
): Promise<Doc<T>[]> {
  const rows = () => db.query(table) as unknown as CreationTimeIndex<T>;
  if (!cursor) {
    return await rows().withIndex("by_creation_time").take(limit);
  }
  const tieGroup = await rows()
    .withIndex("by_creation_time", (q) =>
      q.eq("_creationTime", cursor.creationTime).gt("_id", cursor.id)
    )
    .take(limit);
  if (tieGroup.length === limit) return tieGroup;
  const later = await rows()
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", cursor.creationTime))
    .take(limit - tieGroup.length);
  return [...tieGroup, ...later];
}

const auditIssue = v.union(
  v.object({
    check: v.literal("f10_weekday"),
    uid: v.string(),
    start: v.number(),
    scheduleId: v.string(),
    date: v.string(),
  }),
  v.object({
    check: v.literal("event_length_invalid"),
    eventTypeId: v.string(),
    lengthInMinutes: v.number(),
    lengthInMinutesOptions: v.optional(v.array(v.number())),
  })
);
type AuditIssue = typeof auditIssue.type;

/** Schedule lookups of one audit page, each made once. */
type ScheduleCache = {
  /** Event type id and organization → the schedule resolved for them. */
  resolved: Map<string, Promise<Doc<"schedules"> | null>>;
  /** Organization → its default schedule. */
  defaults: Map<string, Promise<Doc<"schedules"> | null>>;
};

/**
 * The schedule a host would resolve for a booking, as the reference host
 * does: the event type's schedule, else the organization's default schedule
 * (the one marked default, else the first; see getDefaultSchedule).
 */
async function scheduleForBooking(
  ctx: QueryCtx,
  booking: Doc<"bookings">,
  cache: ScheduleCache
): Promise<Doc<"schedules"> | null> {
  const key = `${booking.eventTypeId}\u0000${booking.organizationId ?? ""}`;
  return await memoized(cache.resolved, key, async () => {
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", booking.eventTypeId))
      .unique();
    const own = eventType?.scheduleId
      ? await getScheduleByExternalId(ctx, eventType.scheduleId)
      : null;
    const organizationId = booking.organizationId;
    if (own || !organizationId) return own;
    return await memoized(cache.defaults, organizationId, () =>
      getOrganizationDefaultSchedule(ctx, organizationId)
    );
  });
}

/**
 * f10_weekday: an upcoming active booking on a date whose weekly hours 0.4.2
 * took from the NEXT weekday (schedule zone at UTC+12 or beyond), and whose
 * start lies outside the hours of its own weekday. Dates with an override are
 * skipped; both rules used the override.
 */
async function f10WeekdayIssue(
  ctx: QueryCtx,
  booking: Doc<"bookings">,
  now: number,
  cache: ScheduleCache
): Promise<AuditIssue | null> {
  if (!holdsActiveInventory(booking.status) || booking.start < now) return null;
  const schedule = await scheduleForBooking(ctx, booking, cache);
  if (!schedule || !isValidTimeZone(schedule.timezone)) return null;

  const local = getLocalDateAndSlot(booking.start, schedule.timezone);
  // 0.4.2 read the weekday of `${date}T12:00Z` in the zone.
  const readAs = getLocalDateAndSlot(Date.parse(`${local.date}T12:00:00.000Z`), schedule.timezone);
  if (readAs.date === local.date) return null;

  const override = await ctx.db
    .query("date_overrides")
    .withIndex("by_schedule_date", (q) =>
      q.eq("scheduleId", schedule._id).eq("date", local.date)
    )
    .first();
  if (override) return null;

  if (getWeeklySlots(schedule, parseCivilDate(local.date)).includes(local.slot)) return null;
  return {
    check: "f10_weekday",
    uid: booking.uid,
    start: booking.start,
    scheduleId: schedule.id,
    date: local.date,
  };
}

/** event_length_invalid: a length (or length option) that is not a positive number. */
function eventLengthIssue(eventType: Doc<"event_types">): AuditIssue | null {
  const invalid = (length: number) => !Number.isFinite(length) || length <= 0;
  if (!invalid(eventType.lengthInMinutes) && !(eventType.lengthInMinutesOptions ?? []).some(invalid)) {
    return null;
  }
  return {
    check: "event_length_invalid",
    eventTypeId: eventType.id,
    lengthInMinutes: eventType.lengthInMinutes,
    lengthInMinutesOptions: eventType.lengthInMinutesOptions,
  };
}

/**
 * Read-only upgrade audit, one check and one page of rows per call:
 * - "f10_weekday": upcoming pending, confirmed or provisional bookings that
 *   0.4.2 admitted on a weekday without opening hours (schedules at UTC+12
 *   or beyond used the next weekday's hours). The schedule is the booking's
 *   event type's, else its organization's default, as in the reference host.
 * - "event_length_invalid": event types whose lengthInMinutes or
 *   lengthInMinutesOptions hold a value that is not a positive number. The
 *   availability queries reject such lengths since 0.4.3.
 *
 * Start without a cursor and pass `continueCursor` back until `isDone`.
 * `scanned` counts the rows read; `issues` lists the ones that failed the
 * check. Call it from a host internal function.
 */
export const audit = query({
  args: {
    check: v.union(v.literal("f10_weekday"), v.literal("event_length_invalid")),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
  },
  returns: v.object({
    issues: v.array(auditIssue),
    scanned: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_AUDIT_LIMIT) {
      throw new Error(`limit must be an integer from 1 to ${MAX_AUDIT_LIMIT}`);
    }
    const issues: AuditIssue[] = [];
    let rows: Array<Doc<"bookings"> | Doc<"event_types">>;

    if (args.check === "f10_weekday") {
      const cursor =
        typeof args.cursor === "string" ? parseAuditCursor(ctx.db, "bookings", args.cursor) : null;
      const bookings = await rowsAfter(ctx.db, "bookings", cursor, args.limit);
      const now = Date.now();
      const schedules: ScheduleCache = { resolved: new Map(), defaults: new Map() };
      for (const booking of bookings) {
        const issue = await f10WeekdayIssue(ctx, booking, now, schedules);
        if (issue) issues.push(issue);
      }
      rows = bookings;
    } else {
      const cursor =
        typeof args.cursor === "string" ? parseAuditCursor(ctx.db, "event_types", args.cursor) : null;
      const eventTypes = await rowsAfter(ctx.db, "event_types", cursor, args.limit);
      for (const eventType of eventTypes) {
        const issue = eventLengthIssue(eventType);
        if (issue) issues.push(issue);
      }
      rows = eventTypes;
    }

    const last = rows[rows.length - 1];
    return {
      issues,
      scanned: rows.length,
      continueCursor: last ? encodeAuditCursor(last) : (args.cursor ?? null),
      isDone: rows.length < args.limit,
    };
  },
});

// ============================================
// BACKFILL (one-time repair after upgrading)
// ============================================

/**
 * Largest `limit` of one backfill call. A booking costs at most one patch and
 * one read of its booking items, plus its event type and each of its
 * resources once per page.
 */
const MAX_BACKFILL_LIMIT = 500;

const organizationMismatch = v.object({
  uid: v.string(),
  organizationId: v.string(),
  eventTypeOrganizationId: v.string(),
});

/**
 * A booking left without organization because the stored rows do not
 * corroborate one. `resourceId` names the first resource that fails.
 */
const organizationReview = v.object({
  uid: v.string(),
  eventTypeId: v.string(),
  reason: v.union(
    v.literal("event_type_missing"),
    v.literal("event_type_without_organization"),
    v.literal("resource_missing"),
    v.literal("resource_organization_differs")
  ),
  eventTypeOrganizationId: v.optional(v.string()),
  resourceId: v.optional(v.string()),
  resourceOrganizationId: v.optional(v.string()),
});
type OrganizationReview = typeof organizationReview.type;

/**
 * The organization a booking without one can take, or why it cannot: its
 * event type must exist and have an organization, and every resource the
 * booking occupies (its resourceId and each booking item) must exist and
 * belong to that organization too. Nothing records the organization a
 * booking was made for, and an event type can move to another organization
 * later; the resources, owners of the booked inventory, corroborate it.
 */
async function corroboratedOrganization(
  db: DatabaseReader,
  booking: Doc<"bookings">,
  eventType: Doc<"event_types"> | null,
  resourceOrganizations: Map<string, Promise<string | null>>
): Promise<{ organizationId: string } | OrganizationReview> {
  const review = { uid: booking.uid, eventTypeId: booking.eventTypeId };
  if (!eventType) return { ...review, reason: "event_type_missing" };
  const organizationId = eventType.organizationId;
  if (organizationId === undefined) return { ...review, reason: "event_type_without_organization" };

  const items = await db
    .query("booking_items")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect();
  for (const resourceId of new Set([booking.resourceId, ...items.map((item) => item.resourceId)])) {
    // null: no resource document.
    const resourceOrganizationId = await memoized(resourceOrganizations, resourceId, async () => {
      const resource = await db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", resourceId))
        .first();
      return resource?.organizationId ?? null;
    });
    if (resourceOrganizationId === null) {
      return { ...review, reason: "resource_missing", eventTypeOrganizationId: organizationId, resourceId };
    }
    if (resourceOrganizationId !== organizationId) {
      return {
        ...review,
        reason: "resource_organization_differs",
        eventTypeOrganizationId: organizationId,
        resourceId,
        resourceOrganizationId,
      };
    }
  }
  return { organizationId };
}

/**
 * Fills a missing booking organizationId, one page of bookings per call,
 * where the stored rows corroborate it. Until 0.4.3 bundles created without
 * `organizationId` stored none (and single bookings before 0.3.0), so they
 * were missing from organization lists and organization hooks.
 *
 * A booking takes its event type's organization only when every resource it
 * occupies (its resourceId and each booking item) exists and belongs to that
 * organization as well. The event type alone is no evidence: it may have
 * moved to another organization since the booking was made, which would then
 * receive the booker's details and management token in its booking list.
 *
 * - `updated` counts the rows given their event type's organization
 *   (with `dryRun`, the rows that would be; nothing is written).
 * - `skipped` counts rows that stay without one: legacy createReservation
 *   rows and the rows in `needsReview`.
 * - `needsReview` lists the rows the stored data cannot assign, with the
 *   reason: event type deleted or without organization, a resource missing or
 *   in another organization. They keep no organization, so they stay out of
 *   organization lists and hooks as before; check them against your records.
 * - `mismatches` lists rows whose organization differs from their event
 *   type's. They are reported, never rewritten.
 *
 * Idempotent: a second run updates nothing. Start without a cursor and pass
 * `continueCursor` back until `isDone`; call it from a host internal mutation.
 * Bookings created during a run sort after the cursor and are visited too.
 */
export const backfillBookingOrganizations = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    skipped: v.number(),
    mismatches: v.array(organizationMismatch),
    needsReview: v.array(organizationReview),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_BACKFILL_LIMIT) {
      throw new Error(`limit must be an integer from 1 to ${MAX_BACKFILL_LIMIT}`);
    }
    const cursor =
      typeof args.cursor === "string"
        ? parseAuditCursor(ctx.db, "bookings", args.cursor, "backfill")
        : null;
    const bookings = await rowsAfter(ctx.db, "bookings", cursor, args.limit);

    // Lookups shared by the page: event type by id, resource organization by id.
    const eventTypes = new Map<string, Promise<Doc<"event_types"> | null>>();
    const resourceOrganizations = new Map<string, Promise<string | null>>();
    let updated = 0;
    let skipped = 0;
    const mismatches: Array<typeof organizationMismatch.type> = [];
    const needsReview: OrganizationReview[] = [];
    for (const booking of bookings) {
      const eventType =
        booking.eventTypeId === "legacy"
          ? null
          : await memoized(eventTypes, booking.eventTypeId, () =>
              ctx.db
                .query("event_types")
                .withIndex("by_external_id", (q) => q.eq("id", booking.eventTypeId))
                .first()
            );

      if (booking.organizationId !== undefined) {
        const eventTypeOrganizationId = eventType?.organizationId;
        if (eventTypeOrganizationId !== undefined && booking.organizationId !== eventTypeOrganizationId) {
          mismatches.push({
            uid: booking.uid,
            organizationId: booking.organizationId,
            eventTypeOrganizationId,
          });
        }
        continue;
      }
      if (booking.eventTypeId === "legacy") {
        skipped++;
        continue;
      }
      const result = await corroboratedOrganization(ctx.db, booking, eventType, resourceOrganizations);
      if ("reason" in result) {
        skipped++;
        needsReview.push(result);
        continue;
      }
      updated++;
      if (!args.dryRun) {
        await ctx.db.patch(booking._id, { organizationId: result.organizationId });
      }
    }

    const last = bookings[bookings.length - 1];
    return {
      scanned: bookings.length,
      updated,
      skipped,
      mismatches,
      needsReview,
      continueCursor: last ? encodeAuditCursor(last) : (args.cursor ?? null),
      isDone: bookings.length < args.limit,
    };
  },
});
