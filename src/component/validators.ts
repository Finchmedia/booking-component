// ============================================
// SHARED VALIDATORS
// ============================================
//
// Document and result validators used as `returns:` on the component's public
// functions, so the generated `ComponentApi` carries concrete return types
// across the component <-> host boundary instead of `any`.
//
// The document validators are DERIVED from schema.ts (table validator + the
// two Convex system fields) rather than hand-written, so they cannot drift
// from the tables. Convex object validators are exact — an extra stored field
// would fail at runtime on every read — and Convex enforces schema.ts on every
// write, so a validator built from the table validator is guaranteed to accept
// every stored row.
//
// Field-level decisions:
// - `bookings.status` stays `v.string()` (as in the schema). Do NOT narrow it
//   to a literal union here: a returns validator is enforced at runtime, so a
//   row outside the union would throw on read.
// - `quantity_availability.slotQuantities` is `v.any()` in the schema; anything
//   returning it must stay `v.any()`.
//
// Note: `.extend()` runs at module load inside the HOST app's convex runtime
// and exists since convex 1.29.0 — the package's peer floor must stay >= 1.29.

import { v } from "convex/values";
import schema from "./schema";

// ---- Document validators: table validator + Convex system fields ----------

export const resourceDoc = schema.tables.resources.validator.extend({
  _id: v.id("resources"),
  _creationTime: v.number(),
});

export const scheduleDoc = schema.tables.schedules.validator.extend({
  _id: v.id("schedules"),
  _creationTime: v.number(),
});

export const dateOverrideDoc = schema.tables.date_overrides.validator.extend({
  _id: v.id("date_overrides"),
  _creationTime: v.number(),
});

export const eventTypeDoc = schema.tables.event_types.validator.extend({
  _id: v.id("event_types"),
  _creationTime: v.number(),
});

export const resourceEventTypeDoc = schema.tables.resource_event_types.validator.extend({
  _id: v.id("resource_event_types"),
  _creationTime: v.number(),
});

export const dailyAvailabilityDoc = schema.tables.daily_availability.validator.extend({
  _id: v.id("daily_availability"),
  _creationTime: v.number(),
});

export const quantityAvailabilityDoc = schema.tables.quantity_availability.validator.extend({
  _id: v.id("quantity_availability"),
  _creationTime: v.number(),
});

export const bookingDoc = schema.tables.bookings.validator.extend({
  _id: v.id("bookings"),
  _creationTime: v.number(),
});

export const bookingItemDoc = schema.tables.booking_items.validator.extend({
  _id: v.id("booking_items"),
  _creationTime: v.number(),
});

export const bookingHistoryDoc = schema.tables.booking_history.validator.extend({
  _id: v.id("booking_history"),
  _creationTime: v.number(),
});

export const presenceDoc = schema.tables.presence.validator.extend({
  _id: v.id("presence"),
  _creationTime: v.number(),
});

export const presenceHeartbeatDoc = schema.tables.presence_heartbeats.validator.extend({
  _id: v.id("presence_heartbeats"),
  _creationTime: v.number(),
});

export const hookDoc = schema.tables.hooks.validator.extend({
  _id: v.id("hooks"),
  _creationTime: v.number(),
});

// ---- Composite documents --------------------------------------------------

/**
 * multi_resource.getBookingWithItems: the booking spread with its items, each
 * item carrying the resolved resource (or null when the resource is gone).
 */
export const bookingWithItemsDoc = bookingDoc.extend({
  items: v.array(bookingItemDoc.extend({ resource: v.union(resourceDoc, v.null()) })),
});

// ---- Small result objects shared by several mutations ---------------------

/** `{ success }` — delete / unregister / set-links / cancel-by-token style mutations. */
export const successResult = v.object({ success: v.boolean() });

/** `{ success, alreadyCancelled }` — cancelReservation (idempotent cancel). */
export const cancelResult = v.object({
  success: v.boolean(),
  alreadyCancelled: v.boolean(),
});

/** `{ success, affectedUsers }` — toggleResourceActive / toggleEventTypeActive. */
export const successWithAffectedUsers = v.object({
  success: v.boolean(),
  affectedUsers: v.number(),
});

/** `{ deleted }` — deleteAllLinksForResource / deleteAllLinksForEventType. */
export const deletedCount = v.object({ deleted: v.number() });
