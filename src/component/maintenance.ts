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
import { throwBookingError } from "../shared/booking-errors.js";
import { bookingStatusValidator, isBookingStatus } from "../shared/booking-status.js";
import { LEGACY_EVENT_TYPE_ID, bookingRuleProblems, isLegacyReservation } from "./booking_lifecycle";
import { holdsActiveInventory } from "./inventory_helpers";
import {
  isLengthOutsideOptions,
  isNonNegativeMinutes,
  isPositiveMinutes,
  isValidTimeZone,
  isWholePositiveMinutes,
} from "./input_validation";
import { isLinked, sharesOrganization } from "./resource_event_types";
import { getScheduleByExternalId, getWeeklySlots } from "./schedules";
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
 * Largest `limit` of one audit call. A row costs at most one read of its own
 * (an override, its link pair) or, for a booking, its items (one per bundle
 * item) or history rows (one per status change), plus lookups of the event
 * types, resources, schedules and links it names, each once per page.
 */
const MAX_AUDIT_LIMIT = 500;

type AuditTable =
  | "bookings"
  | "event_types"
  | "schedules"
  | "resources"
  | "date_overrides"
  | "resource_event_types";

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
  throwBookingError("INVALID_INPUT", `Invalid ${name} cursor`);
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
  ): { take(n: number): Promise<AuditRow<T>[]> };
};

/** A row with its system fields spelled out (Doc<T> of a generic T does not resolve them). */
type AuditRow<T extends AuditTable> = Doc<T> & { _creationTime: number; _id: Id<T> };

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
): Promise<AuditRow<T>[]> {
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

const problems = <P extends string>(...names: [P, ...P[]]) =>
  v.array(v.union(...names.map((name) => v.literal(name))));

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
  }),
  v.object({
    check: v.literal("event_type_config"),
    eventTypeId: v.string(),
    problems: problems(
      "id",
      "lengthInMinutes",
      "lengthInMinutesOptions",
      "lengthNotInOptions",
      "slotInterval",
      "bufferBefore",
      "bufferAfter",
      "minNoticeMinutes",
      "maxFutureMinutes",
      "timezone",
      "scheduleId"
    ),
  }),
  v.object({
    check: v.literal("schedule_config"),
    scheduleId: v.string(),
    problems: problems("timezone"),
  }),
  v.object({
    check: v.literal("resource_config"),
    resourceId: v.string(),
    problems: problems("timezone"),
  }),
  v.object({
    check: v.literal("date_override_config"),
    overrideId: v.string(),
    date: v.string(),
    type: v.string(),
    problems: problems("type", "customHours", "date"),
  }),
  v.object({
    check: v.literal("link_integrity"),
    resourceId: v.string(),
    eventTypeId: v.string(),
    problems: problems("resourceMissing", "eventTypeMissing", "crossOrganization", "duplicate"),
  }),
  v.object({
    check: v.literal("booking_integrity"),
    uid: v.string(),
    problems: problems("organizationMissing", "organizationMismatch", "poolWithoutItems"),
  }),
  v.object({
    check: v.literal("booking_eligibility"),
    uid: v.string(),
    status: bookingStatusValidator,
    start: v.number(),
    eventTypeId: v.string(),
    resourceIds: v.array(v.string()),
    problems: problems(
      "eventTypeMissing",
      "eventTypeInactive",
      "resourceMissing",
      "resourceInactive",
      "resourceNotLinked",
      "crossOrganization",
      "noStandalone"
    ),
  }),
  v.object({
    check: v.literal("booking_status_invalid"),
    uid: v.string(),
    // The stored value, which may be outside BOOKING_STATUSES.
    status: v.string(),
    problems: problems("status", "historyStatus"),
  })
);
type AuditIssue = typeof auditIssue.type;

/**
 * The schedule a host would resolve for a booking, as the reference host
 * does: the event type's schedule, else the organization's default schedule
 * (the one marked default, else the first).
 */
async function scheduleForBooking(
  ctx: QueryCtx,
  booking: Doc<"bookings">,
  cache: Map<string, Promise<Doc<"schedules"> | null>>
): Promise<Doc<"schedules"> | null> {
  const key = `${booking.eventTypeId}\u0000${booking.organizationId ?? ""}`;
  let schedule = cache.get(key);
  if (!schedule) {
    schedule = (async () => {
      const eventType = await ctx.db
        .query("event_types")
        .withIndex("by_external_id", (q) => q.eq("id", booking.eventTypeId))
        .unique();
      const own = eventType?.scheduleId
        ? await getScheduleByExternalId(ctx, eventType.scheduleId)
        : null;
      const organizationId = booking.organizationId;
      if (own || !organizationId) return own;
      const schedules = await ctx.db
        .query("schedules")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();
      return schedules.find((s) => s.isDefault) ?? schedules[0] ?? null;
    })();
    cache.set(key, schedule);
  }
  return await schedule;
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
  cache: Map<string, Promise<Doc<"schedules"> | null>>
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

function isCanonicalDate(value: string): boolean {
  try {
    return parseCivilDate(value) === value;
  } catch {
    return false;
  }
}

/** `load` runs once per key within one audit page. */
function perPage<V>(load: (key: string) => Promise<V>): (key: string) => Promise<V> {
  const cache = new Map<string, Promise<V>>();
  return (key) => {
    let value = cache.get(key);
    if (!value) {
      value = load(key);
      cache.set(key, value);
    }
    return value;
  };
}

/** Configuration rows by external id, tolerant of duplicates (`first`). */
function lookups(db: DatabaseReader) {
  const linkedPair = perPage((pair) => {
    const [resourceId, eventTypeId] = JSON.parse(pair) as [string, string];
    return isLinked(db, resourceId, eventTypeId);
  });
  return {
    eventType: perPage((id) => db.query("event_types").withIndex("by_external_id", (q) => q.eq("id", id)).first()),
    resource: perPage((id) => db.query("resources").withIndex("by_external_id", (q) => q.eq("id", id)).first()),
    schedule: perPage((id) => db.query("schedules").withIndex("by_external_id", (q) => q.eq("id", id)).first()),
    linked: (resourceId: string, eventTypeId: string) => linkedPair(JSON.stringify([resourceId, eventTypeId])),
  };
}

/** A booking's items (bundles); none for a single-resource booking. */
function bookingItems(db: DatabaseReader, bookingId: Id<"bookings">): Promise<Doc<"booking_items">[]> {
  return db
    .query("booking_items")
    .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
    .collect();
}

/** The resources a booking holds: its booking_items, else its resource. */
function heldResourceIds(booking: Doc<"bookings">, items: Doc<"booking_items">[]): string[] {
  return items.length > 0 ? items.map((item) => item.resourceId) : [booking.resourceId];
}

/**
 * Whether every resource a booking holds exists and belongs to
 * `organizationId`: only then may a missing booking organization become it.
 */
async function resourcesBelongTo(
  resource: (id: string) => Promise<Doc<"resources"> | null>,
  resourceIds: string[],
  organizationId: string
): Promise<boolean> {
  for (const resourceId of resourceIds) {
    if ((await resource(resourceId))?.organizationId !== organizationId) return false;
  }
  return true;
}
type Lookups = ReturnType<typeof lookups>;
type ProblemsOf<C extends AuditIssue["check"]> = Extract<AuditIssue, { check: C; problems: unknown }>["problems"];

/**
 * event_type_config: stored values the 0.5.0 event-type writes reject (the
 * predicates of input_validation.ts): the reserved ID "legacy" (the
 * eventTypeId of createReservation rows, which then lose their exemption
 * from the booking rules; see isLegacyReservation), lengths, options and
 * slot interval that are not whole minutes greater than 0, a length missing
 * from non-empty options, buffers and notice that are negative or not
 * finite, a horizon that is not greater than 0, a zone Intl rejects, a
 * scheduleId naming no schedule.
 */
async function eventTypeConfigIssue(eventType: Doc<"event_types">, find: Lookups): Promise<AuditIssue | null> {
  const found: ProblemsOf<"event_type_config"> = [];
  if (eventType.id === LEGACY_EVENT_TYPE_ID) found.push("id");
  const options = eventType.lengthInMinutesOptions;
  if (!isWholePositiveMinutes(eventType.lengthInMinutes)) found.push("lengthInMinutes");
  if (options?.some((option) => !isWholePositiveMinutes(option))) found.push("lengthInMinutesOptions");
  if (isLengthOutsideOptions(eventType.lengthInMinutes, options)) found.push("lengthNotInOptions");
  if (eventType.slotInterval !== undefined && !isWholePositiveMinutes(eventType.slotInterval)) found.push("slotInterval");
  for (const key of ["bufferBefore", "bufferAfter", "minNoticeMinutes"] as const) {
    const value = eventType[key];
    if (value !== undefined && !isNonNegativeMinutes(value)) found.push(key);
  }
  if (eventType.maxFutureMinutes !== undefined && !isPositiveMinutes(eventType.maxFutureMinutes)) {
    found.push("maxFutureMinutes");
  }
  if (!isValidTimeZone(eventType.timezone)) found.push("timezone");
  if (eventType.scheduleId && !(await find.schedule(eventType.scheduleId))) found.push("scheduleId");
  return found.length > 0 ? { check: "event_type_config", eventTypeId: eventType.id, problems: found } : null;
}

/** date_override_config: an unknown type, "custom" without hours, a date that is not a canonical calendar day. */
function dateOverrideIssue(override: Doc<"date_overrides">): AuditIssue | null {
  const found: ProblemsOf<"date_override_config"> = [];
  if (override.type !== "unavailable" && override.type !== "custom") found.push("type");
  if (override.type === "custom" && !override.customHours?.length) found.push("customHours");
  if (!isCanonicalDate(override.date)) found.push("date");
  return found.length > 0
    ? { check: "date_override_config", overrideId: override._id, date: override.date, type: override.type, problems: found }
    : null;
}

/**
 * link_integrity: a link whose resource or event type no longer exists, one
 * across organizations (the event type has one and the resource another),
 * or a second row of the same pair (the first row of a pair is not one).
 */
async function linkIssue(
  db: DatabaseReader,
  link: Doc<"resource_event_types">,
  find: Lookups
): Promise<AuditIssue | null> {
  const found: ProblemsOf<"link_integrity"> = [];
  const resource = await find.resource(link.resourceId);
  const eventType = await find.eventType(link.eventTypeId);
  if (!resource) found.push("resourceMissing");
  if (!eventType) found.push("eventTypeMissing");
  if (resource && eventType && !sharesOrganization(resource, eventType)) found.push("crossOrganization");
  const firstOfPair = await db
    .query("resource_event_types")
    .withIndex("by_resource_event_type", (q) =>
      q.eq("resourceId", link.resourceId).eq("eventTypeId", link.eventTypeId)
    )
    .first();
  if (firstOfPair && firstOfPair._id !== link._id) found.push("duplicate");
  return found.length > 0
    ? { check: "link_integrity", resourceId: link.resourceId, eventTypeId: link.eventTypeId, problems: found }
    : null;
}

/**
 * booking_integrity, for bookings of an event type with an organization
 * (legacy rows have no event type): `organizationMissing`, no
 * organizationId while every resource the booking holds belongs to the
 * event type's organization (backfillBookingOrganizations fills it);
 * `organizationMismatch`, another organizationId, or none while a resource
 * is missing or belongs to another organization (the backfill lists these
 * and leaves them; a move, a confirmation or a hold submitted as a request
 * gives the booking the event type's organization once the booking rules
 * pass). Also `poolWithoutItems`: an active booking without items on a pool
 * (isFungible), which moves reject.
 */
async function bookingIntegrityIssue(
  db: DatabaseReader,
  booking: Doc<"bookings">,
  find: Lookups
): Promise<AuditIssue | null> {
  const found: ProblemsOf<"booking_integrity"> = [];
  let items: Doc<"booking_items">[] | undefined;
  const loadItems = async () => (items ??= await bookingItems(db, booking._id));
  // A legacy row names no event type (unless one was created with the
  // reserved ID, whose rules it then follows).
  const eventTypeOrganizationId = (await find.eventType(booking.eventTypeId))?.organizationId;
  if (eventTypeOrganizationId !== undefined && booking.organizationId !== eventTypeOrganizationId) {
    const fillable =
      booking.organizationId === undefined &&
      (await resourcesBelongTo(find.resource, heldResourceIds(booking, await loadItems()), eventTypeOrganizationId));
    found.push(fillable ? "organizationMissing" : "organizationMismatch");
  }
  if (holdsActiveInventory(booking.status) && (await find.resource(booking.resourceId))?.isFungible === true) {
    if ((await loadItems()).length === 0) found.push("poolWithoutItems");
  }
  return found.length > 0 ? { check: "booking_integrity", uid: booking.uid, problems: found } : null;
}

/**
 * booking_eligibility: an active booking (pending, confirmed or
 * provisional; legacy rows are exempt, see isLegacyReservation) that fails
 * the booking rules today, so moving it, confirming it or submitting a hold
 * as a request is rejected (see bookingRuleProblems). The issue names the
 * event type and the resources the booking holds.
 */
async function bookingEligibilityIssue(
  db: DatabaseReader,
  booking: Doc<"bookings">,
  find: Lookups
): Promise<AuditIssue | null> {
  if (!holdsActiveInventory(booking.status) || (await isLegacyReservation(find.eventType, booking))) return null;
  const resourceIds = heldResourceIds(booking, await bookingItems(db, booking._id));
  const found = await bookingRuleProblems(find, booking, resourceIds);
  if (found.length === 0) return null;
  return {
    check: "booking_eligibility",
    uid: booking.uid,
    status: booking.status,
    start: booking.start,
    eventTypeId: booking.eventTypeId,
    resourceIds,
    problems: found,
  };
}

/**
 * booking_status_invalid: a status outside BOOKING_STATUSES on the booking
 * (`status`) or on one of its history rows (`historyStatus`; a history
 * `fromStatus` may also be "", the creation entry). The component writes
 * only these values; other ones come from dashboard edits or imports, and
 * Convex refuses to deploy the 0.5.0 schema while any row holds one.
 */
async function bookingStatusIssue(db: DatabaseReader, booking: Doc<"bookings">): Promise<AuditIssue | null> {
  const found: ProblemsOf<"booking_status_invalid"> = [];
  // Read as stored: the rows this check exists for do not match the schema's type.
  const status: unknown = booking.status;
  if (!isBookingStatus(status)) found.push("status");
  const history = await db
    .query("booking_history")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect();
  if (history.some(({ fromStatus, toStatus }) => !(fromStatus === "" || isBookingStatus(fromStatus)) || !isBookingStatus(toStatus))) {
    found.push("historyStatus");
  }
  return found.length > 0
    ? { check: "booking_status_invalid", uid: booking.uid, status: String(status), problems: found }
    : null;
}

/** schedule_config / resource_config: a zone Intl rejects. */
function zoneIssue(row: Doc<"schedules"> | Doc<"resources">, check: "schedule_config" | "resource_config"): AuditIssue | null {
  if (isValidTimeZone(row.timezone)) return null;
  return check === "schedule_config"
    ? { check, scheduleId: row.id, problems: ["timezone"] }
    : { check, resourceId: row.id, problems: ["timezone"] };
}

/** One page of `table` after the cursor, checked row by row. */
async function auditPage<T extends AuditTable>(
  db: DatabaseReader,
  table: T,
  args: { cursor?: string | null; limit: number },
  issueOf: (row: Doc<T>) => AuditIssue | null | Promise<AuditIssue | null>
) {
  const cursor = typeof args.cursor === "string" ? parseAuditCursor(db, table, args.cursor) : null;
  const rows = await rowsAfter(db, table, cursor, args.limit);
  const issues: AuditIssue[] = [];
  for (const row of rows) {
    const issue = await issueOf(row);
    if (issue) issues.push(issue);
  }
  const last = rows[rows.length - 1];
  return {
    issues,
    scanned: rows.length,
    continueCursor: last ? encodeAuditCursor(last) : (args.cursor ?? null),
    isDone: rows.length < args.limit,
  };
}

/**
 * Read-only upgrade audit, one check and one page of rows per call. Run
 * every check before upgrading to 0.5.0: each reports stored rows that
 * 0.5.0 rejects on write, reads differently or cannot move or confirm.
 * - "f10_weekday" (bookings): upcoming pending, confirmed or provisional
 *   bookings that 0.4.2 admitted on a weekday without opening hours
 *   (schedules at UTC+12 or beyond used the next weekday's hours). The
 *   schedule is the booking's event type's, else its organization's
 *   default, as in the reference host.
 * - "event_length_invalid" (event types): lengthInMinutes or
 *   lengthInMinutesOptions hold a value that is not a positive number. The
 *   availability queries reject such lengths since 0.4.3.
 * - "event_type_config" (event types), "schedule_config" (schedules),
 *   "resource_config" (resources), "date_override_config" (date overrides),
 *   "link_integrity" (resource ↔ event type links), "booking_integrity",
 *   "booking_eligibility" (bookings, with their items) and
 *   "booking_status_invalid" (bookings, with their history rows): each
 *   issue lists its `problems`; see the functions above.
 *
 * Start without a cursor and pass `continueCursor` back until `isDone`; the
 * cursor is the complete by_creation_time key, so rows with equal creation
 * times are neither skipped nor repeated, and rows created during a run are
 * visited too. `scanned` counts the rows read; `issues` lists the ones that
 * failed the check. Call it from a host internal function.
 */
export const audit = query({
  args: {
    check: v.union(
      v.literal("f10_weekday"),
      v.literal("event_length_invalid"),
      v.literal("event_type_config"),
      v.literal("schedule_config"),
      v.literal("resource_config"),
      v.literal("date_override_config"),
      v.literal("link_integrity"),
      v.literal("booking_integrity"),
      v.literal("booking_eligibility"),
      v.literal("booking_status_invalid")
    ),
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
      throwBookingError("INVALID_INPUT", `limit must be an integer from 1 to ${MAX_AUDIT_LIMIT}`);
    }
    const find = lookups(ctx.db);
    switch (args.check) {
      case "f10_weekday": {
        const now = Date.now();
        const schedules = new Map<string, Promise<Doc<"schedules"> | null>>();
        return await auditPage(ctx.db, "bookings", args, (booking) => f10WeekdayIssue(ctx, booking, now, schedules));
      }
      case "event_length_invalid":
        return await auditPage(ctx.db, "event_types", args, eventLengthIssue);
      case "event_type_config":
        return await auditPage(ctx.db, "event_types", args, (eventType) => eventTypeConfigIssue(eventType, find));
      case "schedule_config":
        return await auditPage(ctx.db, "schedules", args, (schedule) => zoneIssue(schedule, "schedule_config"));
      case "resource_config":
        return await auditPage(ctx.db, "resources", args, (resource) => zoneIssue(resource, "resource_config"));
      case "date_override_config":
        return await auditPage(ctx.db, "date_overrides", args, dateOverrideIssue);
      case "link_integrity":
        return await auditPage(ctx.db, "resource_event_types", args, (link) => linkIssue(ctx.db, link, find));
      case "booking_integrity":
        return await auditPage(ctx.db, "bookings", args, (booking) => bookingIntegrityIssue(ctx.db, booking, find));
      case "booking_eligibility":
        return await auditPage(ctx.db, "bookings", args, (booking) => bookingEligibilityIssue(ctx.db, booking, find));
      case "booking_status_invalid":
        return await auditPage(ctx.db, "bookings", args, (booking) => bookingStatusIssue(ctx.db, booking));
    }
  },
});

// ============================================
// BACKFILL (one-time repair after upgrading)
// ============================================

/**
 * Largest `limit` of one backfill call. A booking costs at most one patch
 * and, without organization, its items, plus its event type and resources
 * once per page.
 */
const MAX_BACKFILL_LIMIT = 500;

const organizationMismatch = v.object({
  uid: v.string(),
  // Absent for a booking without organization whose resources do not all
  // belong to the event type's organization.
  organizationId: v.optional(v.string()),
  eventTypeOrganizationId: v.string(),
});

/**
 * Fills a missing booking organizationId from the booking's event type, one
 * page of bookings per call. Until 0.4.3 bundles created without
 * `organizationId` stored none (and single bookings before 0.3.0), so they
 * were missing from organization lists and organization hooks.
 *
 * - `updated` counts the rows given their event type's organization
 *   (with `dryRun`, the rows that would be; nothing is written). A row is
 *   given it only when every resource it holds (every item of a bundle)
 *   exists and belongs to that organization.
 * - `skipped` counts rows that stay without one: legacy createReservation
 *   rows, and rows whose event type is deleted or has no organization.
 * - `mismatches` lists rows whose organization differs from their event
 *   type's, and rows without one whose resources do not all belong to the
 *   event type's organization (no `organizationId`). The backfill reports
 *   them and never rewrites them: stamping the event type's organization on
 *   another organization's booking would list it and send its hooks there.
 *   Moving such a booking, confirming it or submitting its hold as a
 *   request gives it the event type's organization, since those check the
 *   booking rules first (every resource then belongs to it).
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
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_BACKFILL_LIMIT) {
      throwBookingError("INVALID_INPUT", `limit must be an integer from 1 to ${MAX_BACKFILL_LIMIT}`);
    }
    const cursor =
      typeof args.cursor === "string"
        ? parseAuditCursor(ctx.db, "bookings", args.cursor, "backfill")
        : null;
    const bookings = await rowsAfter(ctx.db, "bookings", cursor, args.limit);

    // Event type id → its organization (undefined: deleted or none).
    const organizations = new Map<string, string | undefined>();
    const resource = perPage((id) =>
      ctx.db.query("resources").withIndex("by_external_id", (q) => q.eq("id", id)).first()
    );
    let updated = 0;
    let skipped = 0;
    const mismatches: Array<typeof organizationMismatch.type> = [];
    for (const booking of bookings) {
      // A legacy row names no event type (unless one was created with the
      // reserved ID, whose rules it then follows).
      if (!organizations.has(booking.eventTypeId)) {
        const eventType = await ctx.db
          .query("event_types")
          .withIndex("by_external_id", (q) => q.eq("id", booking.eventTypeId))
          .first();
        organizations.set(booking.eventTypeId, eventType?.organizationId);
      }
      const eventTypeOrganizationId = organizations.get(booking.eventTypeId);

      if (booking.organizationId === undefined) {
        if (eventTypeOrganizationId === undefined) {
          skipped++;
          continue;
        }
        const resourceIds = heldResourceIds(booking, await bookingItems(ctx.db, booking._id));
        if (!(await resourcesBelongTo(resource, resourceIds, eventTypeOrganizationId))) {
          mismatches.push({ uid: booking.uid, eventTypeOrganizationId });
          continue;
        }
        updated++;
        if (!args.dryRun) {
          await ctx.db.patch(booking._id, { organizationId: eventTypeOrganizationId });
        }
      } else if (
        eventTypeOrganizationId !== undefined &&
        booking.organizationId !== eventTypeOrganizationId
      ) {
        mismatches.push({
          uid: booking.uid,
          organizationId: booking.organizationId,
          eventTypeOrganizationId,
        });
      }
    }

    const last = bookings[bookings.length - 1];
    return {
      scanned: bookings.length,
      updated,
      skipped,
      mismatches,
      continueCursor: last ? encodeAuditCursor(last) : (args.cursor ?? null),
      isDone: bookings.length < args.limit,
    };
  },
});
