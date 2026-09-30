import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { assertValidRange, getRequiredSlots } from "./utils";
import { assertSingleResourceSupported } from "./inventory_helpers";
import { isLinked, sharesOrganization } from "./resource_event_types";
import { releaseAllSlotsForBooking } from "./slot_helpers";
import { throwBookingError } from "../shared/booking-errors.js";

// ============================================
// BOOKING LIFECYCLE
// ============================================
// Steps several entry points share. Payloads, hooks and error texts of the
// individual entry points stay with them.

// ============================================
// BOOKING RULES
// ============================================
// What a booking needs from the current configuration, checked by every
// creation (createBooking, createProvisionalBooking,
// createMultiResourceBooking per item), by both moves (for the destination,
// over all items, before anything is released) and by confirmations
// (pending or provisional -> confirmed):
// - the event type exists and is active;
// - every resource exists, is active, is linked to the event type and
//   belongs to the event type's organization when it has one;
// - at least one resource is standalone (not an add-on, isStandalone: false).
// Cancelling, declining and expiring never check them, and deactivating or
// unlinking configuration never ends an existing booking. Legacy
// createReservation rows (eventTypeId "legacy") keep the legacy path's
// rules: none beyond the pool guard.
//
// "single" texts are the ones createBooking has always used; "bundle" texts
// name the offending ids.

type RuleTexts = "single" | "bundle";

/** `Event type` / `Resource`, followed by the quoted id in bundle texts. */
function subject(kind: "Event type" | "Resource", id: string, texts: RuleTexts): string {
  return texts === "bundle" ? `${kind} "${id}"` : kind;
}

/** The event type of a booking: it exists and is active. */
export async function loadBookableEventType(
  ctx: QueryCtx,
  eventTypeId: string,
  texts: RuleTexts,
): Promise<Doc<"event_types">> {
  const eventType = await ctx.db
    .query("event_types")
    .withIndex("by_external_id", (q) => q.eq("id", eventTypeId))
    .first();

  if (!eventType) {
    throwBookingError("EVENT_TYPE_NOT_FOUND", `${subject("Event type", eventTypeId, texts)} not found`);
  }
  if (eventType.isActive === false) {
    throwBookingError("EVENT_TYPE_INACTIVE", `${subject("Event type", eventTypeId, texts)} is no longer active`);
  }
  return eventType;
}

/**
 * The resources of a booking under `eventType`, in the order given: each
 * exists, is active, is linked and shares the event type's organization, and
 * one of them is standalone. For "single" the one resource must be
 * standalone itself, checked before its link, as createBooking always did.
 */
export async function assertResourcesBookable(
  ctx: QueryCtx,
  eventType: Doc<"event_types">,
  resourceIds: string[],
  texts: RuleTexts,
): Promise<void> {
  let hasStandaloneResource = false;
  for (const resourceId of resourceIds) {
    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", resourceId))
      .unique();

    const name = subject("Resource", resourceId, texts);
    if (!resource) throwBookingError("RESOURCE_NOT_FOUND", `${name} not found`);
    if (resource.isActive === false) {
      throwBookingError("RESOURCE_INACTIVE", `${name} is no longer active`);
    }

    // A single-resource booking books the resource on its own — not allowed
    // for add-ons (isStandalone: false); use createMultiResourceBooking with a
    // standalone resource instead.
    if (texts === "single" && resource.isStandalone === false) {
      throwBookingError(
        "RESOURCE_NOT_STANDALONE",
        `Resource "${resourceId}" cannot be booked alone (isStandalone: false)`
      );
    }

    if (!(await isLinked(ctx.db, resourceId, eventType.id))) {
      throwBookingError("RESOURCE_NOT_LINKED", `${name} is not available for this event type`);
    }
    if (!sharesOrganization(resource, eventType)) {
      throwBookingError(
        "ORGANIZATION_MISMATCH",
        `${name} belongs to another organization than the event type`
      );
    }
    if (resource.isStandalone !== false) hasStandaloneResource = true;
  }

  // An add-on (e.g. rental equipment) needs a standalone companion, and only
  // resources that passed the checks above count as one.
  if (!hasStandaloneResource) {
    const ids = resourceIds.map((id) => `"${id}"`).join(", ");
    throwBookingError(
      "RESOURCE_NOT_STANDALONE",
      `Resource ${ids} cannot be booked alone (isStandalone: false): add a standalone resource to the booking`
    );
  }
}

/**
 * The booking rules for an existing booking against the current
 * configuration: its event type and every resource it holds (all
 * booking_items of a bundle, else its resource). Moves call it for the
 * destination before releasing anything; confirmations before confirming.
 */
export async function assertStillBookable(
  ctx: QueryCtx,
  booking: Doc<"bookings">,
  items: Array<{ resourceId: string }>,
): Promise<void> {
  // A legacy createReservation row has no event type; it keeps the legacy
  // path's rules.
  if (booking.eventTypeId === "legacy") return;
  const texts = items.length > 0 ? "bundle" : "single";
  const eventType = await loadBookableEventType(ctx, booking.eventTypeId, texts);
  await assertResourcesBookable(
    ctx,
    eventType,
    items.length > 0 ? items.map((item) => item.resourceId) : [booking.resourceId],
    texts,
  );
}

/**
 * The checks createBooking and createProvisionalBooking share, in the order
 * hosts see their errors: range, pool, event type (exists, active), resource
 * (exists, active, standalone), link, organization, free slots. Returns the
 * event type and the slots to hold per UTC date.
 */
export async function assertSingleBookable(
  ctx: QueryCtx,
  args: { eventTypeId: string; resourceId: string; start: number; end: number },
): Promise<{ eventType: Doc<"event_types">; requiredSlots: Map<string, number[]> }> {
  // Basic range validation (shared guard): NaN/Infinity and end <= start
  // would otherwise silently reserve zero slots.
  assertValidRange(args.start, args.end);
  await assertSingleResourceSupported(ctx, args.resourceId);

  const eventType = await loadBookableEventType(ctx, args.eventTypeId, "single");
  await assertResourcesBookable(ctx, eventType, [args.resourceId], "single");

  // Availability per calendar day. getRequiredSlots maps a range spanning
  // UTC midnight to the correct slots of each day (the former
  // `start % 86400000` chunk math reserved nothing across midnight).
  const requiredSlots = getRequiredSlots(args.start, args.end);
  for (const [date, slots] of requiredSlots.entries()) {
    const dayAvailability = await ctx.db
      .query("daily_availability")
      .withIndex("by_resource_date", (q) =>
        q.eq("resourceId", args.resourceId).eq("date", date)
      )
      .unique();

    if (dayAvailability) {
      for (const slot of slots) {
        if (dayAvailability.busySlots.includes(slot)) {
          throwBookingError("SLOT_UNAVAILABLE", "Time slot no longer available");
        }
      }
    }
  }

  return { eventType, requiredSlots };
}

/**
 * Ends an active booking (provisional, pending or confirmed; the caller has
 * checked): releases everything it holds, records one history row and stamps
 * status, cancelledAt, updatedAt and cancellationReason.
 *
 * Releases from the pre-cancel snapshot BEFORE patching the status:
 * releaseAllSlotsForBooking returns early for terminal statuses, so a
 * re-read of the patched row would silently keep the inventory busy.
 */
export async function terminateBooking(
  ctx: MutationCtx,
  booking: Doc<"bookings">,
  opts: { to: "cancelled" | "declined"; reason?: string; changedBy?: string; now: number },
): Promise<void> {
  await releaseAllSlotsForBooking(ctx, booking);
  await ctx.db.insert("booking_history", {
    bookingId: booking._id,
    fromStatus: booking.status,
    toStatus: opts.to,
    changedBy: opts.changedBy,
    reason: opts.reason,
    timestamp: opts.now,
  });
  await ctx.db.patch(booking._id, {
    status: opts.to,
    cancelledAt: opts.now,
    cancellationReason: opts.reason,
    updatedAt: opts.now,
  });
}
