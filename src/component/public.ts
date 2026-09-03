import { mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
    getRequiredSlots,
    generateDaySlots,
    generateDaySlotsWithTimezone,
    isCandidateAvailable,
    isDayAvailable,
    assertValidRange,
    type SlotCandidate,
} from "./utils";
import { isAvailable } from "./availability";
import { computeAvailabilityForDate } from "./schedules";
import { releaseBookingSlots } from "./slot_helpers";
import {
    bookingDoc,
    cancelResult,
    eventTypeDoc,
    successResult,
    successWithAffectedUsers,
} from "./validators";

// Generate a secure random token (64 hex chars = 256 bits)
function generateSecureToken(): string {
  const segments: string[] = [];
  for (let i = 0; i < 8; i++) {
    segments.push(Math.random().toString(36).substring(2));
  }
  return segments.join('') + Date.now().toString(36);
}

/**
 * Resolves the busy slots currently held by ONE specific booking so that the
 * availability queries can treat them as free. Reschedule flow: a booking's own
 * slots must not make its overlapping new candidate times read as unavailable
 * (e.g. moving 09:00 → 09:30 with a 60-minute event).
 *
 * Returns the booking's slot map (dateStr → slot indices) or null when there is
 * nothing to exclude. Guards:
 * - unknown uid / different resource → null (never touch other resources)
 * - only statuses that actually hold slots (pending/confirmed/provisional):
 *   a cancelled booking already released its slots — excluding its indices
 *   again would free OTHER bookings occupying the same slots by now.
 *
 * Only valid for NON-fungible resources (busySlots bitmap, one holder per
 * slot) — pooled resources track quantity_availability, which this exclusion
 * does not touch.
 */
async function getExcludedSlotsForBooking(
  ctx: QueryCtx,
  resourceId: string,
  excludeBookingUid: string | undefined,
): Promise<Map<string, number[]> | null> {
  if (!excludeBookingUid) return null;
  const booking = await ctx.db
    .query("bookings")
    .withIndex("by_uid", (q) => q.eq("uid", excludeBookingUid))
    .unique();
  if (!booking) return null;
  if (booking.resourceId !== resourceId) return null;
  if (!["pending", "confirmed", "provisional"].includes(booking.status)) {
    return null;
  }
  return getRequiredSlots(booking.start, booking.end);
}

/**
 * Busy slot indices of ONE UTC date, minus the excluded booking's own slots
 * on that date.
 */
async function loadBusySlots(
  ctx: QueryCtx,
  resourceId: string,
  date: string,
  excludedByDate: Map<string, number[]> | null,
): Promise<number[]> {
  const availabilityDoc = await ctx.db
    .query("daily_availability")
    .withIndex("by_resource_date", (q) =>
      q.eq("resourceId", resourceId).eq("date", date)
    )
    .unique();
  const excludedSlots = excludedByDate?.get(date) ?? [];
  return (availabilityDoc?.busySlots ?? []).filter(
    (slot) => !excludedSlots.includes(slot)
  );
}

/**
 * Ensures `busyByDate` holds the busy slots of every UTC date in `dates`,
 * loading each date at most once.
 *
 * The availability queries take a LOCAL date, but daily_availability is keyed
 * by UTC date (that is how getRequiredSlots writes it). A local business day
 * whose hours cross UTC midnight — Pacific/Auckland 09:00 is 21:00Z of the
 * previous day, America/New_York 19:00 is 00:00Z of the next — puts its
 * candidates on the neighbouring UTC rows, so every candidate must be checked
 * against the rows of the dates its own `slotsByDate` names, never against
 * the single row of the requested local date.
 */
async function loadBusySlotsForDates(
  ctx: QueryCtx,
  resourceId: string,
  dates: Iterable<string>,
  excludedByDate: Map<string, number[]> | null,
  busyByDate: Map<string, number[]>,
): Promise<void> {
  for (const date of dates) {
    if (!busyByDate.has(date)) {
      busyByDate.set(date, await loadBusySlots(ctx, resourceId, date, excludedByDate));
    }
  }
}

/** The distinct UTC dates a list of candidates touches. */
function candidateDates(candidates: SlotCandidate[]): Set<string> {
  const dates = new Set<string>();
  for (const candidate of candidates) {
    for (const date of candidate.slotsByDate.keys()) {
      dates.add(date);
    }
  }
  return dates;
}

export const getEventType = query({
    args: {
        eventTypeId: v.string(),
    },
    returns: eventTypeDoc,
    handler: async (ctx, args) => {
        const eventType = await ctx.db
            .query("event_types")
            .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
            .unique();

        if (!eventType) {
            throw new Error(`Event type not found: ${args.eventTypeId}`);
        }

        return eventType;
    },
});

export const getAvailability = query({
    args: {
        resourceId: v.string(),
        start: v.number(),
        end: v.number(),
    },
    returns: v.boolean(),
    handler: async (ctx, args) => {
        return await isAvailable(ctx, args.resourceId, args.start, args.end);
    },
});

/**
 * Gets availability status for a date range
 * Optimized for month view: Returns boolean map, no slot objects
 *
 * TIMEZONE HANDLING:
 * - dateFrom/dateTo are expected to be ISO date strings (e.g., "2025-06-17")
 * - These are interpreted as UTC dates for consistency
 * - The resourceTimezone parameter (optional) can be used for timezone-aware availability
 */
export const getMonthAvailability = query({
    args: {
        resourceId: v.string(),
        dateFrom: v.string(), // "2025-06-17"
        dateTo: v.string(), // "2025-06-20"
        eventLength: v.number(), // Duration in minutes (e.g., 30)
        slotInterval: v.optional(v.number()), // Slot interval
        resourceTimezone: v.optional(v.string()), // IANA timezone (e.g., "Europe/Berlin")
        scheduleId: v.optional(v.string()), // Schedule ID for opening-hours-aware availability
        excludeBookingUid: v.optional(v.string()), // Treat this booking's own slots as free (reschedule flow)
    },
    returns: v.record(v.string(), v.boolean()),
    handler: async (ctx, args) => {
        const { resourceId, dateFrom, dateTo, eventLength } = args;

        // Parse dates with explicit UTC context to avoid timezone bugs
        // Adding T00:00:00.000Z ensures we get UTC midnight, not local midnight
        const startDate = new Date(dateFrom + "T00:00:00.000Z");
        const endDate = new Date(dateTo + "T00:00:00.000Z");

        // Slots held by the excluded booking (resolved once for the range).
        const excludedByDate = await getExcludedSlotsForBooking(
            ctx,
            resourceId,
            args.excludeBookingUid
        );

        // Result object: { "2025-06-17": true, "2025-06-18": false }
        const availabilityByDate: Record<string, boolean> = {};

        // Busy slots per UTC date, shared across the whole range so that each
        // daily_availability row is read at most once even though a local
        // day's candidates may touch the neighbouring UTC rows (see
        // loadBusySlotsForDates).
        const busyByDate = new Map<string, number[]>();

        // Iterate through each day in the range
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            // Extract date string in UTC context
            const dateStr = currentDate.toISOString().split("T")[0];

            // If a scheduleId is provided, use it to determine the available slots window
            let scheduleSlots: number[] | undefined;
            if (args.scheduleId) {
                const eff = await computeAvailabilityForDate(ctx, args.scheduleId, dateStr);
                scheduleSlots = eff.availableSlots;
            }

            // Decide availability via the SAME slot-generation path as
            // getDaySlots, so month- and day-view always agree.
            // Previously isDayAvailable() compared the schedule's LOCAL
            // (wall-clock) slot indices directly against UTC busySlots,
            // skipping the wall-clock→UTC conversion that
            // generateDaySlotsWithTimezone performs. For any non-UTC timezone
            // that made days read as free regardless of bookings (and could
            // produce false negatives with edge blockers).
            // In the schedule-aware path an EMPTY effective window (weekend
            // without weeklyHours, "unavailable" override) means the day is
            // NOT available — it must not fall through to the legacy
            // 9–17-UTC branch, which made weekends/vacation days read as
            // bookable in the month view. The legacy branch remains only for
            // schedule-less setups.
            let hasAvailability: boolean;
            if (args.resourceTimezone && scheduleSlots) {
                if (scheduleSlots.length === 0) {
                    hasAvailability = false;
                } else {
                    const possibleSlots = generateDaySlotsWithTimezone(
                        dateStr,
                        eventLength,
                        args.slotInterval ?? 15,
                        scheduleSlots,
                        args.resourceTimezone
                    );
                    // Each candidate is checked against the row(s) of ITS
                    // OWN UTC date(s) — the same keying getRequiredSlots
                    // uses when a booking is written.
                    await loadBusySlotsForDates(
                        ctx,
                        resourceId,
                        candidateDates(possibleSlots),
                        excludedByDate,
                        busyByDate
                    );
                    hasAvailability = possibleSlots.some((slot) =>
                        isCandidateAvailable(slot, busyByDate)
                    );
                }
            } else {
                // Legacy / no-timezone path: hardcoded UTC business hours,
                // all slots on `dateStr` itself.
                await loadBusySlotsForDates(
                    ctx,
                    resourceId,
                    [dateStr],
                    excludedByDate,
                    busyByDate
                );
                hasAvailability = isDayAvailable(
                    eventLength,
                    busyByDate.get(dateStr) ?? [],
                    args.slotInterval ?? 15,
                    scheduleSlots
                );
            }

            availabilityByDate[dateStr] = hasAvailability;

            // Move to next day (using UTC methods to avoid DST issues)
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return availabilityByDate;
    },
});

/**
 * Gets detailed slots for a SINGLE day
 * Used for day view / slot picker
 *
 * TIMEZONE HANDLING:
 * - date is expected to be an ISO date string (e.g., "2025-06-17")
 * - If resourceTimezone is provided, slots are generated in that timezone context
 * - If availableSlots are provided (from schedule), those are used instead of hardcoded business hours
 */
export const getDaySlots = query({
    args: {
        resourceId: v.string(),
        date: v.string(), // "2025-06-17"
        eventLength: v.number(), // Duration in minutes
        slotInterval: v.optional(v.number()), // Step between slots (default: 15)
        resourceTimezone: v.optional(v.string()), // IANA timezone (e.g., "Europe/Berlin")
        availableSlots: v.optional(v.array(v.number())), // Schedule-based available slot indices (in resource's local timezone)
        excludeBookingUid: v.optional(v.string()), // Treat this booking's own slots as free (reschedule flow)
    },
    returns: v.array(v.object({ time: v.string() })),
    handler: async (ctx, args) => {
        const { resourceId, date, eventLength, slotInterval, resourceTimezone, availableSlots } = args;

        // Generate all possible slots for this day
        let possibleSlots;

        if (resourceTimezone && availableSlots) {
            // Use timezone-aware slot generation with schedule-based hours.
            // An explicitly EMPTY schedule window means the day has no slots —
            // do not fall through to the legacy 9–17-UTC business hours
            // (consistency with getMonthAvailability; generateDaySlotsWithTimezone
            // returns [] for an empty window). The legacy branch remains only
            // for schedule-less setups.
            possibleSlots = generateDaySlotsWithTimezone(
                date,
                eventLength,
                slotInterval ?? 15,
                availableSlots,
                resourceTimezone
            );
        } else {
            // Fallback to legacy hardcoded business hours (UTC-based)
            possibleSlots = generateDaySlots(date, eventLength, slotInterval);
        }

        // The excluded booking's own slots do not count as busy.
        const excludedByDate = await getExcludedSlotsForBooking(
            ctx,
            resourceId,
            args.excludeBookingUid
        );

        // Busy slots of every UTC date the candidates touch — not just the
        // row of the requested local `date`: for a resource whose business
        // day crosses UTC midnight the morning candidates live on the
        // previous UTC row and the evening ones on the next (see
        // loadBusySlotsForDates).
        const busyByDate = new Map<string, number[]>();
        await loadBusySlotsForDates(
            ctx,
            resourceId,
            candidateDates(possibleSlots),
            excludedByDate,
            busyByDate
        );

        // Filter to only available slots
        const available = possibleSlots
            .filter((slot) => isCandidateAvailable(slot, busyByDate))
            .map((slot) => ({ time: slot.start }));

        return available;
    },
});

export const createReservation = mutation({
    args: {
        resourceId: v.string(),
        actorId: v.string(),
        start: v.number(),
        end: v.number(),
        // Resend config passed from main app (components can't access process.env)
        resendOptions: v.optional(v.object({
            apiKey: v.string(),
            fromEmail: v.optional(v.string()),
            baseUrl: v.optional(v.string()),
        })),
    },
    returns: v.id("bookings"),
    handler: async (ctx, args) => {
        const { resourceId, start, end, actorId } = args;

        // 0. Range guard — shared with every other write path.
        assertValidRange(start, end);

        // 1. Check availability first (read-before-write pattern)
        // Note: We re-check inside the transaction to ensure atomicity
        const available = await isAvailable(ctx, resourceId, start, end);
        if (!available) {
            throw new Error("Resource is not available for the requested time range.");
        }

        // 2. Calculate required slots
        const requiredSlots = getRequiredSlots(start, end);

        // 3. Update daily_availability for each day
        for (const [date, slots] of requiredSlots.entries()) {
            const existing = await ctx.db
                .query("daily_availability")
                .withIndex("by_resource_date", (q) =>
                    q.eq("resourceId", resourceId).eq("date", date)
                )
                .unique();

            if (existing) {
                // Double check conflict (redundant but safe)
                for (const slot of slots) {
                    if (existing.busySlots.includes(slot)) {
                        throw new Error(`Conflict detected on ${date} at slot ${slot}`);
                    }
                }

                // Merge new slots
                const updatedSlots = [...existing.busySlots, ...slots].sort((a, b) => a - b);
                await ctx.db.patch(existing._id, { busySlots: updatedSlots });
            } else {
                // Create new day record
                await ctx.db.insert("daily_availability", {
                    resourceId,
                    date,
                    busySlots: slots,
                });
            }
        }

        // 4. Create Booking Record
        // Using "confirmed" as default status, but with minimal metadata (legacy)
        const bookingId = await ctx.db.insert("bookings", {
            resourceId,
            actorId,
            start,
            end,
            status: "confirmed",
            // Fill required new fields with placeholders/defaults for backward compat
            uid: `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventTypeId: "legacy",
            timezone: "UTC",
            bookerName: "Legacy Booker",
            bookerEmail: actorId, // Assume actorId is email for legacy
            eventTitle: "Legacy Booking",
            location: { type: "unknown" },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // Trigger booking.created hook
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.created",
            payload: {
                bookingId,
                resourceId,
                start,
                end,
                status: "confirmed",
                bookerEmail: actorId,
            },
            resendOptions: args.resendOptions,
        });

        return bookingId;
    },
});

export const createBooking = mutation({
  args: {
    // Event details
    eventTypeId: v.string(),
    resourceId: v.string(),

    // Time selection
    start: v.number(),
    end: v.number(),
    timezone: v.string(),

    // Booker information
    booker: v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),

    // Location
    location: v.object({
      type: v.string(),
      value: v.optional(v.string()),
    }),

    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // 0. Basic range validation (shared guard): NaN/Infinity and end <= start
    // would otherwise silently reserve zero slots.
    assertValidRange(args.start, args.end);

    // 1. Fetch event type (for snapshot)
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
      .first();

    if (!eventType) throw new Error("Event type not found");

    // Validate event type is active
    if (eventType.isActive === false) {
      throw new Error("Event type is no longer active");
    }

    // 2. Validate resource exists and is active
    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
      .unique();

    if (!resource) throw new Error("Resource not found");

    if (resource.isActive === false) {
      throw new Error("Resource is no longer active");
    }

    // A single-resource booking books the resource on its own — not allowed
    // for add-ons (isStandalone: false); use createMultiResourceBooking with a
    // standalone resource instead.
    if (resource.isStandalone === false) {
      throw new Error(
        `Resource "${args.resourceId}" cannot be booked alone (isStandalone: false)`
      );
    }

    // 3. Validate resource is linked to event type
    const link = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource_event_type", (q) =>
        q.eq("resourceId", args.resourceId).eq("eventTypeId", args.eventTypeId)
      )
      .unique();

    if (!link) {
      throw new Error("Resource is not available for this event type");
    }

    // 4. Check availability per calendar day.
    // Uses getRequiredSlots so a range spanning UTC midnight blocks the
    // correct slots on each day. The previous `start % 86400000` chunk math
    // produced endChunk < startChunk across midnight, so the conflict loop
    // never ran and zero slots were reserved (double bookings possible).
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
            throw new Error("Time slot no longer available");
          }
        }
      }
    }

    // 5. Generate unique booking UID
    const uid = `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 6. Generate secure management token
    const managementToken = generateSecureToken();

    // 7. Determine initial status based on requiresConfirmation flag
    const initialStatus = eventType.requiresConfirmation ? "pending" : "confirmed";
    const now = Date.now();

    // 8. Create booking record
    const bookingId = await ctx.db.insert("bookings", {
      uid,
      managementToken,
      resourceId: args.resourceId,
      actorId: args.booker.email, // Use email as actorId
      eventTypeId: args.eventTypeId,
      // Scope the booking to the event type's organization so that
      // listBookings({ organizationId }) (index by_org) finds it — the same
      // scope the booking hooks receive.
      organizationId: eventType.organizationId,
      start: args.start,
      end: args.end,
      timezone: args.timezone,
      status: initialStatus,
      bookerName: args.booker.name,
      bookerEmail: args.booker.email,
      bookerPhone: args.booker.phone,
      bookerNotes: args.booker.notes,
      eventTitle: eventType.title,
      eventDescription: eventType.description,
      location: args.location,
      createdAt: now,
      updatedAt: now,
    });

    // 9. Record initial state in booking history
    await ctx.db.insert("booking_history", {
      bookingId,
      fromStatus: "",
      toStatus: initialStatus,
      changedBy: "system",
      reason: "Booking created",
      timestamp: now,
    });

    // 10. Mark slots as busy in daily_availability (per calendar day).
    for (const [date, slots] of requiredSlots.entries()) {
      const existing = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", args.resourceId).eq("date", date)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          busySlots: [...existing.busySlots, ...slots].sort((a, b) => a - b),
        });
      } else {
        await ctx.db.insert("daily_availability", {
          resourceId: args.resourceId,
          date,
          busySlots: slots,
        });
      }
    }

    // 11. Trigger booking.created hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.created",
      organizationId: eventType.organizationId,
      payload: {
        bookingId,
        resourceId: args.resourceId,
        eventTypeId: args.eventTypeId,
        start: args.start,
        end: args.end,
        timezone: args.timezone,
        status: initialStatus,
        bookerName: args.booker.name,
        bookerEmail: args.booker.email,
        eventTitle: eventType.title,
        uid,
        managementToken,
      },
      resendOptions: args.resendOptions,
    });

    // 12. Return full booking object (just written — cannot be missing)
    const doc = await ctx.db.get(bookingId);
    if (!doc) throw new Error("Booking not found after write");
    return doc;
  },
});

export const createProvisionalBooking = mutation({
  args: {
    eventTypeId: v.string(),
    resourceId: v.string(),
    start: v.number(),
    end: v.number(),
    timezone: v.string(),
    booker: v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    location: v.object({
      type: v.string(),
      value: v.optional(v.string()),
    }),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // Basic range validation — parallel to createBooking.
    assertValidRange(args.start, args.end);

    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
      .first();

    if (!eventType) throw new Error("Event type not found");
    if (eventType.isActive === false) {
      throw new Error("Event type is no longer active");
    }

    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
      .unique();

    if (!resource) throw new Error("Resource not found");
    if (resource.isActive === false) {
      throw new Error("Resource is no longer active");
    }
    // Parallel to createBooking: an add-on cannot be held on its own.
    if (resource.isStandalone === false) {
      throw new Error(
        `Resource "${args.resourceId}" cannot be booked alone (isStandalone: false)`
      );
    }

    const link = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource_event_type", (q) =>
        q.eq("resourceId", args.resourceId).eq("eventTypeId", args.eventTypeId)
      )
      .unique();

    if (!link) {
      throw new Error("Resource is not available for this event type");
    }

    // Check availability per calendar day (spans UTC midnight correctly) —
    // parallel to createBooking.
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
            throw new Error("Time slot no longer available");
          }
        }
      }
    }

    const uid = `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const managementToken = generateSecureToken();
    const now = Date.now();

    const bookingId = await ctx.db.insert("bookings", {
      uid,
      managementToken,
      resourceId: args.resourceId,
      actorId: args.booker.email,
      eventTypeId: args.eventTypeId,
      start: args.start,
      end: args.end,
      timezone: args.timezone,
      status: "provisional",
      bookerName: args.booker.name,
      bookerEmail: args.booker.email,
      bookerPhone: args.booker.phone,
      bookerNotes: args.booker.notes,
      eventTitle: eventType.title,
      eventDescription: eventType.description,
      location: args.location,
      organizationId: eventType.organizationId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("booking_history", {
      bookingId,
      fromStatus: "",
      toStatus: "provisional",
      changedBy: "system",
      reason: "Provisional booking created",
      timestamp: now,
    });

    for (const [date, slots] of requiredSlots.entries()) {
      const existing = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", args.resourceId).eq("date", date)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          busySlots: [...existing.busySlots, ...slots].sort((a, b) => a - b),
        });
      } else {
        await ctx.db.insert("daily_availability", {
          resourceId: args.resourceId,
          date,
          busySlots: slots,
        });
      }
    }

    const doc = await ctx.db.get(bookingId);
    if (!doc) throw new Error("Booking not found after write");
    return doc;
  },
});

export const getBooking = query({
  args: { bookingId: v.id("bookings") },
  returns: v.union(bookingDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bookingId);
  },
});

export const cancelReservation = mutation({
    args: {
        reservationId: v.id("bookings"),
        // Resend config passed from main app (components can't access process.env)
        resendOptions: v.optional(v.object({
            apiKey: v.string(),
            fromEmail: v.optional(v.string()),
            baseUrl: v.optional(v.string()),
        })),
    },
    returns: cancelResult,
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.reservationId);
        if (!booking) {
            throw new Error("Reservation not found");
        }

        if (booking.status === "cancelled") {
            // Idempotent: the slots were released by the first cancel, and
            // subtracting them again could free a later holder's slots.
            return { success: true, alreadyCancelled: true };
        }

        // 1. Calculate slots to free up
        const slotsToFree = getRequiredSlots(booking.start, booking.end);

        // 2. Update daily_availability
        for (const [date, slots] of slotsToFree.entries()) {
            const availability = await ctx.db
                .query("daily_availability")
                .withIndex("by_resource_date", (q) =>
                    q.eq("resourceId", booking.resourceId).eq("date", date)
                )
                .unique();

            if (availability) {
                const updatedSlots = availability.busySlots.filter(
                    (s) => !slots.includes(s)
                );
                await ctx.db.patch(availability._id, { busySlots: updatedSlots });
            }
        }

        // 3. Update booking status
        await ctx.db.patch(args.reservationId, { status: "cancelled" });

        // 4. Trigger booking.cancelled hook
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.cancelled",
            organizationId: booking.organizationId,
            payload: {
                bookingId: args.reservationId,
                resourceId: booking.resourceId,
                eventTypeId: booking.eventTypeId,
                start: booking.start,
                end: booking.end,
                timezone: booking.timezone,
                status: "cancelled",
                bookerEmail: booking.bookerEmail,
                bookerName: booking.bookerName,
                eventTitle: booking.eventTitle,
                previousStatus: booking.status,
            },
            resendOptions: args.resendOptions,
        });

        return { success: true, alreadyCancelled: false };
    },
});

export const expireProvisionalBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status === "cancelled") {
      return { success: true };
    }

    if (booking.status !== "provisional") {
      return { success: false, reason: `Booking is ${booking.status}` };
    }

    const now = Date.now();

    await ctx.db.insert("booking_history", {
      bookingId: args.bookingId,
      fromStatus: "provisional",
      toStatus: "cancelled",
      changedBy: "system",
      reason: args.reason ?? "Provisional booking expired",
      timestamp: now,
    });

    await releaseBookingSlots(ctx, booking.resourceId, booking.start, booking.end);

    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: args.reason ?? "Provisional booking expired",
      updatedAt: now,
    });

    return { success: true };
  },
});

export const createEventType = mutation({
  args: {
    id: v.string(),
    slug: v.string(),
    title: v.string(),
    lengthInMinutes: v.number(),
    lengthInMinutesOptions: v.optional(v.array(v.number())),
    slotInterval: v.optional(v.number()), // Frequency of slots
    description: v.optional(v.string()),
    timezone: v.string(),
    lockTimeZoneToggle: v.boolean(),
    locations: v.array(
      v.object({
        type: v.string(),
        address: v.optional(v.string()),
        public: v.optional(v.boolean()),
      })
    ),
    // New optional fields for expanded schema
    organizationId: v.optional(v.string()),
    scheduleId: v.optional(v.string()),
    bufferBefore: v.optional(v.number()),
    bufferAfter: v.optional(v.number()),
    minNoticeMinutes: v.optional(v.number()),
    maxFutureMinutes: v.optional(v.number()),
    requiresConfirmation: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("event_types"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    const now = Date.now();
    const data = {
      ...args,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...data, createdAt: existing.createdAt });
      return existing._id;
    } else {
      return await ctx.db.insert("event_types", data);
    }
  },
});

// ============================================
// EVENT TYPE LIST & DETAIL QUERIES
// ============================================

export const listEventTypes = query({
  args: {
    organizationId: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(eventTypeDoc),
  handler: async (ctx, args) => {
    let eventTypes;

    if (args.organizationId) {
      eventTypes = await ctx.db
        .query("event_types")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    } else {
      eventTypes = await ctx.db.query("event_types").collect();
    }

    if (args.activeOnly) {
      eventTypes = eventTypes.filter((et) => et.isActive !== false);
    }

    return eventTypes;
  },
});

export const getEventTypeBySlug = query({
  args: {
    slug: v.string(),
    organizationId: v.optional(v.string()),
  },
  returns: v.union(eventTypeDoc, v.null()),
  handler: async (ctx, args) => {
    const eventTypes = await ctx.db
      .query("event_types")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();

    if (args.organizationId) {
      return eventTypes.find((et) => et.organizationId === args.organizationId) ?? null;
    }

    return eventTypes[0] ?? null;
  },
});

export const updateEventType = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    lengthInMinutes: v.optional(v.number()),
    lengthInMinutesOptions: v.optional(v.array(v.number())),
    slotInterval: v.optional(v.number()),
    timezone: v.optional(v.string()),
    lockTimeZoneToggle: v.optional(v.boolean()),
    locations: v.optional(
      v.array(
        v.object({
          type: v.string(),
          address: v.optional(v.string()),
          public: v.optional(v.boolean()),
        })
      )
    ),
    scheduleId: v.optional(v.string()),
    bufferBefore: v.optional(v.number()),
    bufferAfter: v.optional(v.number()),
    minNoticeMinutes: v.optional(v.number()),
    maxFutureMinutes: v.optional(v.number()),
    requiresConfirmation: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("event_types"),
  handler: async (ctx, args) => {
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!eventType) {
      throw new Error(`Event type "${args.id}" not found`);
    }

    const { id: _id, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = { updatedAt: Date.now() };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(eventType._id, filteredUpdates);
    return eventType._id;
  },
});

export const deleteEventType = mutation({
  args: { id: v.string() },
  returns: successResult,
  handler: async (ctx, args) => {
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!eventType) {
      throw new Error(`Event type "${args.id}" not found`);
    }

    // Check for existing bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.id))
      .first();

    if (bookings) {
      throw new Error(
        "Cannot delete event type with existing bookings. Deactivate it instead."
      );
    }

    await ctx.db.delete(eventType._id);
    return { success: true };
  },
});

export const toggleEventTypeActive = mutation({
  args: {
    id: v.string(),
    isActive: v.boolean(),
  },
  returns: successWithAffectedUsers,
  handler: async (ctx, args) => {
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!eventType) {
      throw new Error(`Event type "${args.id}" not found`);
    }

    // Check for active presence (final safety guard)
    const TIMEOUT_MS = 10_000;
    const now = Date.now();

    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.id))
      .collect();

    const activePresence = presenceRecords.filter(
      (p) => now - p.updated <= TIMEOUT_MS
    );

    const uniqueUsers = [...new Set(activePresence.map((p) => p.user))];
    const affectedUsers = uniqueUsers.length;

    if (affectedUsers > 0) {
      console.warn(
        `[toggleEventTypeActive] Warning: ${affectedUsers} user(s) currently booking event type "${args.id}". ` +
        `Toggling status to ${args.isActive ? "active" : "inactive"} anyway. ` +
        `Users: ${uniqueUsers.join(", ")}`
      );
    }

    await ctx.db.patch(eventType._id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    return { success: true, affectedUsers };
  },
});

// ============================================
// BOOKING LIST & DETAIL QUERIES
// ============================================

export const getBookingByUid = query({
  args: { uid: v.string() },
  returns: v.union(bookingDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bookings")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .unique();
  },
});

/**
 * Lists bookings, newest `start` first, hiding provisional reservations
 * unless `status` asks for them.
 *
 * Pass `organizationId` or `resourceId`: those branches read the
 * `by_org_start` / `by_resource_start` indexes, so `dateFrom` / `dateTo`
 * narrow the index range itself and the scan is proportional to the window.
 * The `eventTypeId` branch uses `by_event_type` and range-filters in JS.
 *
 * With no selector at all the scan is bounded: only the 1000 most recently
 * *created* bookings are considered (then filtered, sorted and limited). That
 * branch is meant for small deployments, admin tooling and tests; a large
 * host should always pass a selector.
 */
export const listBookings = query({
  args: {
    organizationId: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    eventTypeId: v.optional(v.string()),
    status: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(bookingDoc),
  handler: async (ctx, args) => {
    let bookings;
    const { dateFrom, dateTo } = args;

    // Use the most specific index available
    if (args.organizationId) {
      const organizationId = args.organizationId;
      bookings = await ctx.db
        .query("bookings")
        .withIndex("by_org_start", (q) => {
          const byOrg = q.eq("organizationId", organizationId);
          const from = dateFrom !== undefined ? byOrg.gte("start", dateFrom) : byOrg;
          return dateTo !== undefined ? from.lte("start", dateTo) : from;
        })
        .order("desc")
        .collect();
    } else if (args.resourceId) {
      const resourceId = args.resourceId;
      bookings = await ctx.db
        .query("bookings")
        .withIndex("by_resource_start", (q) => {
          const byResource = q.eq("resourceId", resourceId);
          const from = dateFrom !== undefined ? byResource.gte("start", dateFrom) : byResource;
          return dateTo !== undefined ? from.lte("start", dateTo) : from;
        })
        .order("desc")
        .collect();
    } else if (args.eventTypeId) {
      bookings = await ctx.db
        .query("bookings")
        .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.eventTypeId!))
        .collect();
    } else {
      // No selector: bounded scan of the most recently created bookings (see docstring).
      bookings = await ctx.db.query("bookings").order("desc").take(1000);
    }

    // The ids that did not pick the index still narrow the result — a caller
    // asking for one resource's bookings of one event type must not get that
    // resource's bookings of every event type. (Redundant for the indexed id.)
    if (args.organizationId) {
      bookings = bookings.filter((b) => b.organizationId === args.organizationId);
    }
    if (args.resourceId) {
      bookings = bookings.filter((b) => b.resourceId === args.resourceId);
    }
    if (args.eventTypeId) {
      bookings = bookings.filter((b) => b.eventTypeId === args.eventTypeId);
    }

    // Hide provisional reservations from regular booking lists unless explicitly requested.
    if (!args.status) {
      bookings = bookings.filter((b) => b.status !== "provisional");
    }

    if (args.status) {
      bookings = bookings.filter((b) => b.status === args.status);
    }
    // Redundant for the org/resource branches (already an index range), still
    // needed for the event-type and no-selector branches.
    if (dateFrom !== undefined) {
      bookings = bookings.filter((b) => b.start >= dateFrom);
    }
    if (dateTo !== undefined) {
      bookings = bookings.filter((b) => b.start <= dateTo);
    }

    // Sort by start time descending (newest first). A no-op for the org/resource
    // branches (index order, stable sort keeps it); orders the other two.
    bookings.sort((a, b) => b.start - a.start);

    // Apply limit
    if (args.limit) {
      bookings = bookings.slice(0, args.limit);
    }

    return bookings;
  },
});

// ============================================
// TOKEN-BASED BOOKING ACCESS (Unauthenticated)
// ============================================

export const getBookingByToken = query({
  args: { uid: v.string(), token: v.string() },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .unique();

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.managementToken !== args.token) {
      throw new Error("Invalid token");
    }

    return booking;
  }
});

export const cancelBookingByToken = mutation({
  args: {
    uid: v.string(),
    token: v.string(),
    reason: v.optional(v.string()),
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    // 1. Find and verify booking
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .unique();

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.managementToken !== args.token) {
      throw new Error("Invalid token");
    }

    // 2. Check if booking can be cancelled (not already cancelled/completed/declined)
    if (["cancelled", "completed", "declined"].includes(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`);
    }

    const now = Date.now();

    // 3. Record history
    await ctx.db.insert("booking_history", {
      bookingId: booking._id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      changedBy: "user",
      reason: args.reason || "Cancelled by booker",
      timestamp: now,
    });

    // 4. Update booking
    await ctx.db.patch(booking._id, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: args.reason || "Cancelled by booker",
      updatedAt: now,
    });

    // 5. Release the slots in daily_availability
    const requiredSlots = getRequiredSlots(booking.start, booking.end);

    for (const [date, slots] of requiredSlots.entries()) {
      const availability = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", booking.resourceId).eq("date", date)
        )
        .unique();

      if (availability) {
        const updatedSlots = availability.busySlots.filter(
          (s) => !slots.includes(s)
        );
        await ctx.db.patch(availability._id, { busySlots: updatedSlots });
      }
    }

    // 6. Trigger booking.cancelled hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.cancelled",
      organizationId: booking.organizationId,
      payload: {
        bookingId: booking._id,
        booking: { ...booking, status: "cancelled" },
        previousStatus: booking.status,
        reason: args.reason || "Cancelled by booker",
        bookerEmail: booking.bookerEmail,
        bookerName: booking.bookerName,
        eventTitle: booking.eventTitle,
        start: booking.start,
        end: booking.end,
        timezone: booking.timezone,
      },
      resendOptions: args.resendOptions,
    });

    return { success: true };
  }
});

export const rescheduleBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    newStart: v.number(),
    newEnd: v.number(),
    reason: v.optional(v.string()),
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // 0. Range guard. Without it an inverted/NaN range maps to zero slots:
    // the old slots would be released and none reserved, leaving a live
    // "confirmed" booking that holds nothing.
    assertValidRange(args.newStart, args.newEnd);

    // 1. Get original booking
    const original = await ctx.db.get(args.bookingId);
    if (!original) {
      throw new Error("Booking not found");
    }

    // 2. Check if booking can be rescheduled (only pending or confirmed)
    if (!["pending", "confirmed"].includes(original.status)) {
      throw new Error(`Cannot reschedule booking with status: ${original.status}`);
    }

    // 3. Generate new UID
    const newUid = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 4. Determine new booking status
    // If original required confirmation, new one also requires it
    const newStatus = original.status === "pending" ? "pending" : "confirmed";

    // 5. Create new booking (copy most fields from original)
    const now = Date.now();
    const newBookingId = await ctx.db.insert("bookings", {
      uid: newUid,
      resourceId: original.resourceId,
      organizationId: original.organizationId,
      eventTypeId: original.eventTypeId,
      eventTitle: original.eventTitle,
      eventDescription: original.eventDescription,
      bookerName: original.bookerName,
      bookerEmail: original.bookerEmail,
      bookerPhone: original.bookerPhone,
      bookerNotes: original.bookerNotes,
      start: args.newStart,
      end: args.newEnd,
      timezone: original.timezone,
      status: newStatus,
      rescheduleUid: original.uid,  // Link to original
      actorId: original.actorId,
      location: original.location,
      managementToken: original.managementToken,  // Keep same token
      createdAt: now,
      updatedAt: now,
    });

    // 6. Cancel original booking
    await ctx.db.insert("booking_history", {
      bookingId: args.bookingId,
      fromStatus: original.status,
      toStatus: "cancelled",
      changedBy: "system",
      reason: "Rescheduled to new time",
      timestamp: now,
    });

    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "Rescheduled to new time",
      updatedAt: now,
    });

    // 7. Free up old slots in daily_availability
    const oldSlotsToFree = getRequiredSlots(original.start, original.end);
    for (const [date, slots] of oldSlotsToFree.entries()) {
      const availability = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", original.resourceId).eq("date", date)
        )
        .unique();

      if (availability) {
        const updatedSlots = availability.busySlots.filter(
          (s) => !slots.includes(s)
        );
        await ctx.db.patch(availability._id, { busySlots: updatedSlots });
      }
    }

    // 8. Mark new slots as busy in daily_availability
    const newRequiredSlots = getRequiredSlots(args.newStart, args.newEnd);
    for (const [date, slots] of newRequiredSlots.entries()) {
      const existing = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", original.resourceId).eq("date", date)
        )
        .unique();

      if (existing) {
        // Check for conflicts
        for (const slot of slots) {
          if (existing.busySlots.includes(slot)) {
            throw new Error(`Conflict detected on ${date} at slot ${slot}`);
          }
        }

        // Merge new slots
        const updatedSlots = [...existing.busySlots, ...slots].sort((a, b) => a - b);
        await ctx.db.patch(existing._id, { busySlots: updatedSlots });
      } else {
        // Create new day record
        await ctx.db.insert("daily_availability", {
          resourceId: original.resourceId,
          date,
          busySlots: slots,
        });
      }
    }

    // 9. Trigger booking.rescheduled hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.rescheduled",
      organizationId: original.organizationId,
      payload: {
        originalBookingId: args.bookingId,
        newBookingId,
        oldStart: original.start,
        oldEnd: original.end,
        newStart: args.newStart,
        newEnd: args.newEnd,
        bookerEmail: original.bookerEmail,
        bookerName: original.bookerName,
        eventTitle: original.eventTitle,
        timezone: original.timezone,
      },
      resendOptions: args.resendOptions,
    });

    // 10. Get and return the new booking (just written — cannot be missing)
    const newBooking = await ctx.db.get(newBookingId);
    if (!newBooking) throw new Error("Booking not found after write");
    return newBooking;
  },
});

export const rescheduleBookingByToken = mutation({
  args: {
    uid: v.string(),
    token: v.string(),
    newStart: v.number(),
    newEnd: v.number(),
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // 0. Range guard — see rescheduleBooking.
    assertValidRange(args.newStart, args.newEnd);

    // 1. Find and verify booking
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .unique();

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.managementToken !== args.token) {
      throw new Error("Invalid token");
    }

    // 2. Check if booking can be rescheduled
    if (!["pending", "confirmed"].includes(booking.status)) {
      throw new Error(`Cannot reschedule booking with status: ${booking.status}`);
    }

    // 3. Check availability for new time slot.
    // The booking's OWN slots are still marked busy at this point (they are
    // released in step 8), so they are excluded from the conflict check —
    // otherwise a move to an overlapping range (09:00 → 09:30 with a 60-minute
    // event) would be wrongly rejected. Only this booking's slots are excluded;
    // the per-day conflict check in step 9 runs after the release and remains
    // as a second guard.
    const ownSlots = getRequiredSlots(booking.start, booking.end);
    const available = await isAvailable(
      ctx,
      booking.resourceId,
      args.newStart,
      args.newEnd,
      ownSlots
    );
    if (!available) {
      throw new Error("Resource is not available for the requested time range");
    }

    // 4. Generate new UID for rescheduled booking
    const newUid = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 5. Determine new booking status
    const newStatus = booking.status === "pending" ? "pending" : "confirmed";

    // 6. Create new booking (copy most fields from original)
    const now = Date.now();
    const newBookingId = await ctx.db.insert("bookings", {
      uid: newUid,
      resourceId: booking.resourceId,
      organizationId: booking.organizationId,
      eventTypeId: booking.eventTypeId,
      eventTitle: booking.eventTitle,
      eventDescription: booking.eventDescription,
      bookerName: booking.bookerName,
      bookerEmail: booking.bookerEmail,
      bookerPhone: booking.bookerPhone,
      bookerNotes: booking.bookerNotes,
      start: args.newStart,
      end: args.newEnd,
      timezone: booking.timezone,
      status: newStatus,
      rescheduleUid: booking.uid,
      actorId: booking.actorId,
      location: booking.location,
      managementToken: booking.managementToken,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Cancel original booking
    await ctx.db.insert("booking_history", {
      bookingId: booking._id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      changedBy: "system",
      reason: "Rescheduled to new time",
      timestamp: now,
    });

    await ctx.db.patch(booking._id, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "Rescheduled to new time",
      updatedAt: now,
    });

    // 8. Free up old slots
    const oldSlotsToFree = getRequiredSlots(booking.start, booking.end);
    for (const [date, slots] of oldSlotsToFree.entries()) {
      const availability = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", booking.resourceId).eq("date", date)
        )
        .unique();

      if (availability) {
        const updatedSlots = availability.busySlots.filter(
          (s) => !slots.includes(s)
        );
        await ctx.db.patch(availability._id, { busySlots: updatedSlots });
      }
    }

    // 9. Mark new slots as busy
    const newRequiredSlots = getRequiredSlots(args.newStart, args.newEnd);
    for (const [date, slots] of newRequiredSlots.entries()) {
      const existing = await ctx.db
        .query("daily_availability")
        .withIndex("by_resource_date", (q) =>
          q.eq("resourceId", booking.resourceId).eq("date", date)
        )
        .unique();

      if (existing) {
        // Check for conflicts
        for (const slot of slots) {
          if (existing.busySlots.includes(slot)) {
            throw new Error(`Conflict detected on ${date} at slot ${slot}`);
          }
        }
        const updatedSlots = [...existing.busySlots, ...slots].sort((a, b) => a - b);
        await ctx.db.patch(existing._id, { busySlots: updatedSlots });
      } else {
        await ctx.db.insert("daily_availability", {
          resourceId: booking.resourceId,
          date,
          busySlots: slots,
        });
      }
    }

    // 10. Trigger booking.rescheduled hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.rescheduled",
      organizationId: booking.organizationId,
      payload: {
        originalBookingId: booking._id,
        newBookingId,
        oldStart: booking.start,
        oldEnd: booking.end,
        newStart: args.newStart,
        newEnd: args.newEnd,
        bookerEmail: booking.bookerEmail,
        bookerName: booking.bookerName,
        eventTitle: booking.eventTitle,
        timezone: booking.timezone,
      },
      resendOptions: args.resendOptions,
    });

    // The new booking was just written — cannot be missing.
    const newBooking = await ctx.db.get(newBookingId);
    if (!newBooking) throw new Error("Booking not found after write");
    return newBooking;
  }
});
