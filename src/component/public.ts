import { createBookingEmailContext } from "./emails/context.js";
import { bookingEmailOptionsValidator, type BookingEmailOptions } from "../emails.js";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
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
import {
    getDateOverridesByDate,
    getExistingSchedule,
    getScheduleDaySlots,
} from "./schedules";
import { assertSingleBookable, assertStillBookable, terminateBooking } from "./booking_lifecycle";
import { deleteLinks } from "./resource_event_types";
import { generateManagementToken } from "./tokens";
import { parseCivilDate, type CivilDate } from "../shared/time.js";
import { throwBookingError } from "../shared/booking-errors.js";
import {
    assertDateOrder,
    assertEventLength,
    assertSlotIndices,
    assertTimeZone,
    isValidTimeZone,
} from "./input_validation";
import type { Doc } from "./_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import {
  assertSingleResourceSupported,
  holdsActiveInventory,
  isFungibleResource,
  reserveResourceSlots,
} from "./inventory_helpers";
import {
    bookingDoc,
    cancelResult,
    eventTypeDoc,
    successResult,
    successWithAffectedUsers,
} from "./validators";

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
 *
 * The uid is not a credential: excludeBookingUid is for trusted host code.
 * Client input goes through rescheduleContext (getRescheduleExclusion).
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
 * A booker's reschedule credential for the slot queries: the booking's uid
 * and management token, which a client may forward. Unlike
 * excludeBookingUid, which any caller could fill with a uid it saw, it proves
 * the right to move the booking.
 */
const rescheduleContextValidator = v.optional(
  v.object({ uid: v.string(), token: v.string() })
);

type RescheduleArgs = {
  excludeBookingUid?: string;
  rescheduleContext?: { uid: string; token: string };
};

/** The slot queries take one reschedule argument at most. */
function assertOneRescheduleArgument(args: RescheduleArgs): void {
  if (args.rescheduleContext !== undefined && args.excludeBookingUid !== undefined) {
    throwBookingError(
      "INVALID_INPUT",
      "Invalid reschedule arguments: pass rescheduleContext or excludeBookingUid, not both"
    );
  }
}

/**
 * The slots of the booking a slot query treats as free:
 * - `rescheduleContext`: a pending or confirmed booking on this resource
 *   whose uid and management token both match. Anything else (unknown uid,
 *   wrong token, a booking without a token, another status or resource)
 *   excludes nothing and is no error, so no other booking is ever freed.
 * - `excludeBookingUid`: for trusted host code (see getExcludedSlotsForBooking).
 * Neither value is logged or returned.
 */
async function getRescheduleExclusion(
  ctx: QueryCtx,
  resourceId: string,
  args: RescheduleArgs,
): Promise<Map<string, number[]> | null> {
  const context = args.rescheduleContext;
  if (context === undefined) {
    return await getExcludedSlotsForBooking(ctx, resourceId, args.excludeBookingUid);
  }
  const booking = await ctx.db
    .query("bookings")
    .withIndex("by_uid", (q) => q.eq("uid", context.uid))
    .unique();
  if (
    !booking ||
    booking.managementToken === undefined ||
    booking.managementToken !== context.token ||
    !["pending", "confirmed"].includes(booking.status) ||
    booking.resourceId !== resourceId
  ) {
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

/**
 * The schedule arguments of getMonthAvailability and getDaySlots, checked
 * (0.5.0). Valid shapes:
 * - none of them: the legacy 09:00–17:00 UTC window;
 * - `scheduleId`, optionally with `availableSlots` (getDaySlots), and with a
 *   `resourceTimezone` only if it equals the schedule's zone;
 * - `availableSlots` together with `resourceTimezone` (getDaySlots).
 * A partial shape (`resourceTimezone` alone; `availableSlots` without a
 * zone) and a zone that differs from the schedule's throw INVALID_INPUT
 * instead of reading closed days as open; an unknown `scheduleId` throws
 * SCHEDULE_NOT_FOUND. `""` counts as omitted for `scheduleId` and
 * `resourceTimezone`, as before.
 *
 * Returns the schedule (null without one) and the zone its hours are read
 * in, always defined for a schedule. For a schedule stored before 0.4.3 with
 * a zone Intl rejects, reads stay tolerant and logged: its hours are read in
 * a given resourceTimezone, else as UTC (0.4.3 took the legacy window, which
 * opened its closed days).
 */
async function resolveScheduleArgs(
  ctx: QueryCtx,
  functionName: "getMonthAvailability" | "getDaySlots",
  args: { scheduleId?: string; resourceTimezone?: string; availableSlots?: number[] },
): Promise<{ schedule: Doc<"schedules"> | null; timezone: string | undefined }> {
  const resourceTimezone = args.resourceTimezone || undefined;
  if (!args.scheduleId) {
    if (resourceTimezone !== undefined && args.availableSlots === undefined) {
      throwBookingError(
        "INVALID_INPUT",
        functionName === "getDaySlots"
          ? "Incomplete schedule arguments: resourceTimezone needs availableSlots or scheduleId (pass none of them for the legacy 09:00–17:00 UTC hours)"
          : "Incomplete schedule arguments: resourceTimezone needs scheduleId (pass neither for the legacy 09:00–17:00 UTC hours)"
      );
    }
    if (args.availableSlots !== undefined && resourceTimezone === undefined) {
      throwBookingError(
        "INVALID_INPUT",
        "Incomplete schedule arguments: availableSlots needs resourceTimezone or scheduleId (pass none of them for the legacy 09:00–17:00 UTC hours)"
      );
    }
    return { schedule: null, timezone: resourceTimezone };
  }

  const schedule = await getExistingSchedule(ctx, args.scheduleId);
  if (!isValidTimeZone(schedule.timezone)) {
    const timezone = resourceTimezone ?? "UTC";
    console.warn(
      `[booking] ${functionName}: schedule "${schedule.id}" has the invalid time zone "${schedule.timezone}"; reading its hours in ${timezone}. Set a valid zone with updateSchedule.`
    );
    return { schedule, timezone };
  }
  if (resourceTimezone !== undefined && resourceTimezone !== schedule.timezone) {
    throwBookingError(
      "INVALID_INPUT",
      `Invalid resourceTimezone "${resourceTimezone}": schedule "${schedule.id}" uses "${schedule.timezone}". Omit resourceTimezone to use the schedule's zone.`
    );
  }
  return { schedule, timezone: schedule.timezone };
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
            throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type not found: ${args.eventTypeId}`);
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
 * - dateFrom/dateTo are calendar dates ("2025-06-17"; "2025-6-17" is read as
 *   the same day). With a schedule they are the schedule's local days;
 *   without one, UTC days.
 * - With scheduleId, the schedule's hours are read in its own timezone;
 *   resourceTimezone may be omitted and must otherwise equal it. A schedule
 *   stored with a zone Intl rejects has its hours read as UTC, or in a given
 *   resourceTimezone (logged).
 * - Without scheduleId and resourceTimezone, the legacy 09:00–17:00 UTC
 *   window applies.
 *
 * RESCHEDULING: `rescheduleContext` ({ uid, token } of the booking being
 * moved) treats that booking's own slots as free when the token matches a
 * pending or confirmed booking on this resource, and is ignored otherwise.
 * `excludeBookingUid` does the same without a token and is for trusted host
 * code only: never forward it from a client, which could free any booking
 * whose uid it knows. Passing both throws.
 *
 * Rejects an eventLength that is not a positive number, impossible dates,
 * dateFrom after dateTo, resourceTimezone without scheduleId, a
 * resourceTimezone that differs from the schedule's, an unknown
 * scheduleId (see resolveScheduleArgs) and both reschedule arguments at once.
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
        excludeBookingUid: v.optional(v.string()), // Trusted host code only: treat this booking's own slots as free
        rescheduleContext: rescheduleContextValidator, // A booker's { uid, token }: treat that booking's own slots as free
    },
    returns: v.record(v.string(), v.boolean()),
    handler: async (ctx, args) => {
        const { resourceId, eventLength } = args;
        const dateFrom = parseCivilDate(args.dateFrom);
        const dateTo = parseCivilDate(args.dateTo);
        assertDateOrder(dateFrom, dateTo);
        assertEventLength(eventLength);
        assertOneRescheduleArgument(args);
        // The schedule and its overrides are read once for the whole range.
        const { schedule, timezone } = await resolveScheduleArgs(ctx, "getMonthAvailability", args);
        const pooledResource = await isFungibleResource(ctx, resourceId);
        const overridesByDate = schedule && !pooledResource
            ? await getDateOverridesByDate(ctx, schedule, dateFrom, dateTo)
            : undefined;

        // Parse dates with explicit UTC context to avoid timezone bugs
        // Adding T00:00:00.000Z ensures we get UTC midnight, not local midnight
        const startDate = new Date(dateFrom + "T00:00:00.000Z");
        const endDate = new Date(dateTo + "T00:00:00.000Z");

        // Slots held by the excluded booking (resolved once for the range).
        const excludedByDate = await getRescheduleExclusion(ctx, resourceId, args);

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
            // Extract date string in UTC context (canonical: the range was
            // validated by parseCivilDate, so years have four digits)
            const dateStr = currentDate.toISOString().split("T")[0] as CivilDate;

            if (pooledResource) {
                availabilityByDate[dateStr] = false;
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                continue;
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
            // queries without any schedule argument (resolveScheduleArgs
            // rejects partial ones and always gives a schedule a zone).
            let hasAvailability: boolean;
            if (schedule && timezone) {
                const scheduleSlots = await getScheduleDaySlots(ctx, schedule, dateStr, overridesByDate);
                if (scheduleSlots.length === 0) {
                    hasAvailability = false;
                } else {
                    const possibleSlots = generateDaySlotsWithTimezone(
                        dateStr,
                        eventLength,
                        args.slotInterval ?? 15,
                        scheduleSlots,
                        timezone
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
                // Legacy path (no schedule arguments): hardcoded UTC
                // business hours, all slots on `dateStr` itself.
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
                    args.slotInterval ?? 15
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
 * - date is a calendar date ("2025-06-17"; "2025-6-17" is read as the same day)
 * - availableSlots (local slot indices from a schedule) together with
 *   resourceTimezone generate the slots in that timezone
 * - scheduleId (optional) supplies what is missing: the schedule's effective
 *   hours for `date` when availableSlots is omitted, and the schedule's own
 *   timezone (a given resourceTimezone must equal it).
 *   `{ scheduleId }` alone equals getEffectiveAvailability followed by this
 *   query with availableSlots and the schedule's timezone. A schedule stored
 *   with a zone Intl rejects has its hours read as UTC, or in a given
 *   resourceTimezone (logged).
 * - Without any of the three, the legacy 09:00–17:00 UTC window applies.
 *
 * RESCHEDULING: `rescheduleContext` and `excludeBookingUid` as in
 * getMonthAvailability (the token-checked context for client input,
 * `excludeBookingUid` for trusted host code only).
 *
 * Rejects an eventLength that is not a positive number, impossible dates,
 * availableSlots outside 0–95, a partial shape (resourceTimezone or
 * availableSlots alone), a resourceTimezone that differs from the
 * schedule's, an unknown scheduleId (see resolveScheduleArgs) and both
 * reschedule arguments at once.
 */
export const getDaySlots = query({
    args: {
        resourceId: v.string(),
        date: v.string(), // "2025-06-17"
        eventLength: v.number(), // Duration in minutes
        slotInterval: v.optional(v.number()), // Step between slots (default: 15)
        resourceTimezone: v.optional(v.string()), // IANA timezone (e.g., "Europe/Berlin")
        availableSlots: v.optional(v.array(v.number())), // Schedule-based available slot indices (in resource's local timezone)
        excludeBookingUid: v.optional(v.string()), // Trusted host code only: treat this booking's own slots as free
        scheduleId: v.optional(v.string()), // Resolves the day's hours and/or the timezone from this schedule
        rescheduleContext: rescheduleContextValidator, // A booker's { uid, token }: treat that booking's own slots as free
    },
    returns: v.array(v.object({ time: v.string() })),
    handler: async (ctx, args) => {
        const { resourceId, eventLength, slotInterval } = args;
        const date = parseCivilDate(args.date);
        assertEventLength(eventLength);
        if (args.availableSlots) assertSlotIndices(args.availableSlots);
        assertOneRescheduleArgument(args);

        const { schedule, timezone: resourceTimezone } = await resolveScheduleArgs(ctx, "getDaySlots", args);
        if (await isFungibleResource(ctx, resourceId)) return [];

        let { availableSlots } = args;
        if (schedule) {
            availableSlots ??= await getScheduleDaySlots(ctx, schedule, date);
        }

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
        const excludedByDate = await getRescheduleExclusion(ctx, resourceId, args);

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
        resendOptions: v.optional(bookingEmailOptionsValidator),
    },
    returns: v.id("bookings"),
    handler: async (ctx, args) => {
        const { resourceId, start, end, actorId } = args;

        // 0. Range guard — shared with every other write path.
        assertValidRange(start, end);
        await assertSingleResourceSupported(ctx, resourceId);

        // 1. Check availability first (read-before-write pattern)
        // Note: We re-check inside the transaction to ensure atomicity
        const available = await isAvailable(ctx, resourceId, start, end);
        if (!available) {
            throwBookingError("SLOT_UNAVAILABLE", "Resource is not available for the requested time range.");
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
                        throwBookingError("SLOT_UNAVAILABLE", `Conflict detected on ${date} at slot ${slot}`);
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

        const notificationBooking = await ctx.db.get(bookingId);
        if (!notificationBooking) throw new Error("Booking not found after write");

        // Trigger booking.created hook
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.created",
            emailContext: createBookingEmailContext("confirmed", notificationBooking, args.resendOptions),
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
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    // 0–4. Range, pool, event type, resource, link and free slots — shared
    // with createProvisionalBooking, including the order of the checks.
    const { eventType, requiredSlots } = await assertSingleBookable(ctx, args);

    // 5. Generate unique booking UID
    const uid = `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 6. Generate secure management token
    const managementToken = generateManagementToken();

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
      // listBookings({ organizationId }) (index by_org_start) finds it — the same
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

    const doc = await ctx.db.get(bookingId);
    if (!doc) throw new Error("Booking not found after write");

    // 11. Trigger booking.created hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.created",
      emailContext: createBookingEmailContext(initialStatus === "pending" ? "pending" : "confirmed", doc, args.resendOptions),
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

    // 12. Return the captured booking.
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
    // The same checks, in the same order, as createBooking.
    const { eventType, requiredSlots } = await assertSingleBookable(ctx, args);

    const uid = `bk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const managementToken = generateManagementToken();
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

/**
 * The whole booking document, `managementToken` and booker contact details
 * included. The token lets its holder cancel and reschedule the booking, so a
 * host must not pass this result to a caller that only knows the id.
 */
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
        reason: v.optional(v.string()),
        cancelledBy: v.optional(v.string()), // History actor; default "unknown"
        // Resend config passed from main app (components can't access process.env)
        resendOptions: v.optional(bookingEmailOptionsValidator),
    },
    returns: cancelResult,
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.reservationId);
        if (!booking) {
            throwBookingError("BOOKING_NOT_FOUND", "Reservation not found");
        }

        if (booking.status === "cancelled") {
            // Idempotent: the slots were released by the first cancel, and
            // subtracting them again could free a later holder's slots.
            return { success: true, alreadyCancelled: true };
        }

        if (!holdsActiveInventory(booking.status)) {
            throwBookingError("INVALID_STATE", `Cannot cancel booking with status: ${booking.status}`);
        }

        // 3. Release, record history and stamp the cancellation
        await terminateBooking(ctx, booking, {
            to: "cancelled",
            reason: args.reason,
            changedBy: args.cancelledBy ?? "unknown",
            now: Date.now(),
        });

        // 4. Trigger booking.cancelled hook (v1 payload unchanged: no reason)
        await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
            eventType: "booking.cancelled",
            emailContext: createBookingEmailContext("cancelled", booking, args.resendOptions, { reason: args.reason }),
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
      throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    }

    if (booking.status === "cancelled") {
      return { success: true };
    }

    if (booking.status !== "provisional") {
      return { success: false, reason: `Booking is ${booking.status}` };
    }

    await terminateBooking(ctx, booking, {
      to: "cancelled",
      reason: args.reason ?? "Provisional booking expired",
      changedBy: "system",
      now: Date.now(),
    });

    return { success: true };
  },
});

/**
 * An event type's scheduleId names an existing schedule, or is "" (no
 * schedule, as the availability queries read it). Availability reads reject
 * an unknown id, and deleteSchedule refuses while event types use one.
 */
async function assertScheduleReference(ctx: QueryCtx, scheduleId: string | undefined): Promise<void> {
  if (scheduleId) await getExistingSchedule(ctx, scheduleId);
}

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
    assertTimeZone(args.timezone);
    await assertScheduleReference(ctx, args.scheduleId);
    const existing = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    const now = Date.now();

    if (existing) {
      // An upsert updates the given fields and keeps the others: an omitted
      // isActive does not reactivate a deactivated event type, and an
      // omitted organizationId keeps the stored one. It never moves an event
      // type to another organization; adopting one stored without
      // organization is allowed.
      if (
        existing.organizationId !== undefined &&
        args.organizationId !== undefined &&
        args.organizationId !== existing.organizationId
      ) {
        throwBookingError(
          "ORGANIZATION_MISMATCH",
          `Event type "${args.id}" belongs to another organization than "${args.organizationId}"`
        );
      }
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("event_types", {
      ...args,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
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
    if (args.timezone !== undefined) {
      assertTimeZone(args.timezone);
    }
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!eventType) {
      throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type "${args.id}" not found`);
    }
    await assertScheduleReference(ctx, args.scheduleId);

    // The arguments besides `id` are event_types columns (their types are
    // checked here); only the ones given are patched.
    const { id: _id, ...fields } = args;
    const updates: Partial<WithoutSystemFields<Doc<"event_types">>> = fields;
    const filteredUpdates: Partial<WithoutSystemFields<Doc<"event_types">>> = { updatedAt: Date.now() };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        Object.assign(filteredUpdates, { [key]: value });
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
      throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type "${args.id}" not found`);
    }

    // Check for existing bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_event_type_start", (q) => q.eq("eventTypeId", args.id))
      .first();

    if (bookings) {
      throwBookingError(
        "EVENT_TYPE_IN_USE",
        "Cannot delete event type with existing bookings. Deactivate it instead."
      );
    }

    // Its links go with it, so an event type created later with this id
    // starts without resources instead of inheriting the old ones.
    await deleteLinks(ctx, { eventTypeId: args.id });
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
      throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type "${args.id}" not found`);
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

/**
 * The whole booking document, `managementToken` and booker contact details
 * included. Knowing a uid must not be enough to obtain the token: a host that
 * serves this to browsers removes the token (and details the caller may not
 * see) unless the caller already proved ownership.
 */
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

type ListBookingsArgs = {
  organizationId?: string;
  resourceId?: string;
  eventTypeId?: string;
  status?: string;
  dateFrom?: number;
  dateTo?: number;
};

/**
 * listBookings' selector as an index range in `order`, with `dateFrom` /
 * `dateTo` narrowing `start`; null without a selector. As in the filters, an
 * empty id selects nothing.
 */
function bookingsInRange(ctx: QueryCtx, args: ListBookingsArgs, order: "asc" | "desc") {
  const { organizationId, resourceId, eventTypeId, dateFrom, dateTo } = args;
  const bookings = ctx.db.query("bookings");
  if (organizationId) {
    return bookings
      .withIndex("by_org_start", (q) => {
        const byOrg = q.eq("organizationId", organizationId);
        const from = dateFrom !== undefined ? byOrg.gte("start", dateFrom) : byOrg;
        return dateTo !== undefined ? from.lte("start", dateTo) : from;
      })
      .order(order);
  }
  if (resourceId) {
    return bookings
      .withIndex("by_resource_start", (q) => {
        const byResource = q.eq("resourceId", resourceId);
        const from = dateFrom !== undefined ? byResource.gte("start", dateFrom) : byResource;
        return dateTo !== undefined ? from.lte("start", dateTo) : from;
      })
      .order(order);
  }
  if (eventTypeId) {
    return bookings
      .withIndex("by_event_type_start", (q) => {
        const byEventType = q.eq("eventTypeId", eventTypeId);
        const from = dateFrom !== undefined ? byEventType.gte("start", dateFrom) : byEventType;
        return dateTo !== undefined ? from.lte("start", dateTo) : from;
      })
      .order(order);
  }
  return null;
}

function matchesListing(booking: Doc<"bookings">, args: ListBookingsArgs): boolean {
  // The ids that did not pick the index still narrow the result — a caller
  // asking for one resource's bookings of one event type must not get that
  // resource's bookings of every event type. (Redundant for the indexed id.)
  if (args.organizationId && booking.organizationId !== args.organizationId) return false;
  if (args.resourceId && booking.resourceId !== args.resourceId) return false;
  if (args.eventTypeId && booking.eventTypeId !== args.eventTypeId) return false;
  // Hide provisional reservations from regular booking lists unless explicitly requested.
  if (args.status ? booking.status !== args.status : booking.status === "provisional") return false;
  // Redundant for the index ranges, still needed for the no-selector branch.
  if (args.dateFrom !== undefined && !(booking.start >= args.dateFrom)) return false;
  if (args.dateTo !== undefined && !(booking.start <= args.dateTo)) return false;
  return true;
}

/**
 * The first `limit` matching bookings of `rows` (newest `start` first),
 * reading no further than needed. With `oldestFirstTies`, equal starts come
 * out oldest first although `rows` yields them newest first: each group is
 * buffered, so the rest of the group at the cut is read as well.
 */
async function firstMatching(
  rows: AsyncIterable<Doc<"bookings">>,
  args: ListBookingsArgs,
  limit: number,
  oldestFirstTies: boolean
): Promise<Doc<"bookings">[]> {
  const result: Doc<"bookings">[] = [];
  let group: Doc<"bookings">[] = [];
  for await (const booking of rows) {
    if (group.length > 0 && booking.start !== group[0].start) {
      result.push(...group.reverse());
      group = [];
      if (result.length >= limit) break;
    }
    if (!matchesListing(booking, args)) continue;
    if (oldestFirstTies) group.push(booking);
    else if (result.push(booking) >= limit) break;
  }
  result.push(...group.reverse());
  return result.slice(0, limit);
}

/**
 * Lists bookings, newest `start` first, hiding provisional reservations
 * unless `status` asks for them.
 *
 * Pass `organizationId`, `resourceId` or `eventTypeId` (tried in that order):
 * the branch reads the `by_org_start` / `by_resource_start` /
 * `by_event_type_start` index, so `dateFrom` / `dateTo` narrow the index range
 * itself and the scan is proportional to the window. With a positive integer
 * `limit` the scan also stops once `limit` bookings match, so it reads the
 * limit plus the rows the other filters skip (for `eventTypeId`, plus the rest
 * of the bookings sharing the last one's `start`). Without a limit it reads
 * the whole range. Other `limit` values keep their earlier meaning (0: no
 * limit). Bookings with equal `start` come newest-created first, except in
 * the `eventTypeId` branch, where they come oldest-created first.
 *
 * `resourceId` matches a booking's primary resource: a bundle is listed under
 * its first resource only, not under its other items (pools included).
 *
 * Bookings are returned whole, `managementToken` included (see getBookingByUid).
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
    const { limit } = args;
    // The eventTypeId branch used to read `by_event_type` (creation order) and
    // then sort by start, so its equal starts come oldest first.
    const oldestFirstTies = !args.organizationId && !args.resourceId && !!args.eventTypeId;

    if (limit !== undefined && Number.isInteger(limit) && limit > 0) {
      const rows = bookingsInRange(ctx, args, "desc");
      if (rows) return await firstMatching(rows, args, limit, oldestFirstTies);
    }

    const range = bookingsInRange(ctx, args, oldestFirstTies ? "asc" : "desc");
    // No selector: bounded scan of the most recently created bookings (see docstring).
    let bookings = range
      ? await range.collect()
      : await ctx.db.query("bookings").order("desc").take(1000);
    bookings = bookings.filter((booking) => matchesListing(booking, args));

    // Sort by start time descending (newest first). A no-op for the org/resource
    // branches (index order, stable sort keeps it); orders the other two.
    bookings.sort((a, b) => b.start - a.start);

    // Apply limit
    if (limit) {
      bookings = bookings.slice(0, limit);
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
      throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    }

    if (booking.managementToken !== args.token) {
      throwBookingError("INVALID_TOKEN", "Invalid token");
    }

    return booking;
  }
});

export const cancelBookingByToken = mutation({
  args: {
    uid: v.string(),
    token: v.string(),
    reason: v.optional(v.string()),
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    // 1. Find and verify booking
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .unique();

    if (!booking) {
      throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    }

    if (booking.managementToken !== args.token) {
      throwBookingError("INVALID_TOKEN", "Invalid token");
    }

    // 2. Check if booking can be cancelled (not already cancelled/completed/declined)
    if (!holdsActiveInventory(booking.status)) {
      throwBookingError("INVALID_STATE", `Cannot cancel booking with status: ${booking.status}`);
    }

    const reason = args.reason || "Cancelled by booker";

    // 3–5. Release every item (pooled add-ons and legacy bookings included),
    // record history and stamp the cancellation.
    await terminateBooking(ctx, booking, {
      to: "cancelled",
      reason,
      changedBy: "user",
      now: Date.now(),
    });

    // 6. Trigger booking.cancelled hook
    await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
      eventType: "booking.cancelled",
      emailContext: createBookingEmailContext("cancelled", booking, args.resendOptions, { reason }),
      organizationId: booking.organizationId,
      payload: {
        bookingId: booking._id,
        booking: { ...booking, status: "cancelled" },
        previousStatus: booking.status,
        reason,
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

/** A move is one Convex transaction, including inventory, history and hooks. */
async function moveBooking(
  ctx: MutationCtx,
  original: Doc<"bookings">,
  args: {
    newStart: number;
    newEnd: number;
    reason?: string;
    changedBy?: string;
    resendOptions?: BookingEmailOptions;
  },
): Promise<Doc<"bookings">> {
  assertValidRange(args.newStart, args.newEnd);
  if (!["pending", "confirmed"].includes(original.status)) {
    throwBookingError("INVALID_STATE", `Cannot reschedule booking with status: ${original.status}`);
  }
  const items = await ctx.db.query("booking_items")
    .withIndex("by_booking", q => q.eq("bookingId", original._id)).collect();
  const resources = items.length > 0
    ? items.map(item => ({ resourceId: item.resourceId, quantity: item.quantity }))
    : [{ resourceId: original.resourceId, quantity: 1 }];

  // A legacy single-resource record never used quantity counters. Do not silently
  // reinterpret it after a host has changed the resource into a pool.
  if (items.length === 0) await assertSingleResourceSupported(ctx, original.resourceId);

  // The destination follows the current booking rules, for every item, before
  // anything is released: a move after deactivation, unlinking or a change of
  // organization is rejected, by token and by id alike (no admin override).
  await assertStillBookable(ctx, original, items);

  // The original ends first: read-your-writes lets overlapping moves reuse
  // only its inventory. Any destination conflict aborts this mutation and
  // restores the original with ALL its items.
  const now = Date.now();
  const reason = args.reason ?? "Rescheduled to new time";
  const changedBy = args.changedBy ?? "system";
  await terminateBooking(ctx, original, { to: "cancelled", reason, changedBy, now });
  await reserveResourceSlots(ctx, resources, args.newStart, args.newEnd);

  const newUid = `bk_${now}_${Math.random().toString(36).slice(2, 9)}`;
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
    status: original.status,
    rescheduleUid: original.uid,
    actorId: original.actorId,
    location: original.location,
    managementToken: original.managementToken,
    createdAt: now,
    updatedAt: now,
  });
  for (const item of items) {
    await ctx.db.insert("booking_items", {
      bookingId: newBookingId,
      resourceId: item.resourceId,
      quantity: item.quantity,
    });
  }
  // Forward link: the original stays "cancelled" but names its successor, so
  // a move is told apart from a cancellation without reading the reason.
  await ctx.db.patch(original._id, { rescheduledToUid: newUid });
  await ctx.db.insert("booking_history", {
    bookingId: newBookingId,
    fromStatus: "",
    toStatus: original.status,
    changedBy,
    reason: `Rescheduled from ${original.uid}`,
    timestamp: now,
  });
  const booking = await ctx.db.get(newBookingId);
  if (!booking) throw new Error("Booking not found after write");
  await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
    eventType: "booking.rescheduled",
    emailContext: createBookingEmailContext("rescheduled", booking, args.resendOptions, {
      previousStart: original.start,
      previousEnd: original.end,
      reason: args.reason,
    }),
    organizationId: original.organizationId,
    payload: {
      originalBookingId: original._id,
      newBookingId,
      uid: newUid,
      managementToken: original.managementToken,
      oldStart: original.start,
      oldEnd: original.end,
      newStart: args.newStart,
      newEnd: args.newEnd,
      bookerEmail: original.bookerEmail,
      bookerName: original.bookerName,
      eventTitle: original.eventTitle,
      timezone: original.timezone,
      resources,
      isMultiResource: items.length > 0,
    },
    resendOptions: args.resendOptions,
  });
  return booking;
}

export const rescheduleBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    newStart: v.number(),
    newEnd: v.number(),
    reason: v.optional(v.string()),
    changedBy: v.optional(v.string()), // History actor of the move; default "system"
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    assertValidRange(args.newStart, args.newEnd);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    return await moveBooking(ctx, booking, args);
  },
});

export const rescheduleBookingByToken = mutation({
  args: {
    uid: v.string(),
    token: v.string(),
    newStart: v.number(),
    newEnd: v.number(),
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: bookingDoc,
  handler: async (ctx, args) => {
    assertValidRange(args.newStart, args.newEnd);
    const booking = await ctx.db.query("bookings")
      .withIndex("by_uid", q => q.eq("uid", args.uid)).unique();
    if (!booking) throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    if (booking.managementToken !== args.token) throwBookingError("INVALID_TOKEN", "Invalid token");
    return await moveBooking(ctx, booking, args);
  },
});
