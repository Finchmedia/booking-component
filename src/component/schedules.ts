import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getDayOfWeekInTimezone } from "./utils";
import { dateOverrideDoc, scheduleDoc, successResult } from "./validators";

// ============================================
// TIME WINDOW VALIDATION
// ============================================
// Schedule/override writes used to accept any strings — `timeToSlot("garbage")`
// yields NaN and the day silently reads as an empty window; inverted windows
// (start >= end), dayOfWeek outside 0–6 and overlapping windows per day were
// stored without complaint. Validate at the component boundary instead.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses "HH:MM" (00:00–23:59, minutes on the 15-minute grid) to minutes since midnight. */
function parseTimeStrict(time: string, field: string): number {
  const match = TIME_RE.exec(time);
  if (!match) {
    throw new Error(
      `Invalid ${field} "${time}": expected "HH:MM" between 00:00 and 23:59`
    );
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  // The component works on a 15-minute slot grid; finer times would silently
  // be rounded down to the containing slot.
  if (minutes % 15 !== 0) {
    throw new Error(
      `Invalid ${field} "${time}": minutes must be on the 15-minute grid (00, 15, 30, 45)`
    );
  }
  return hours * 60 + minutes;
}

/**
 * Validates a set of time windows belonging to ONE day: each window must be
 * well-formed with startTime < endTime, and windows must not overlap
 * (adjacent windows sharing a boundary, e.g. …–12:00 + 12:00–…, are fine).
 */
function assertNonOverlappingWindows(
  windows: Array<{ startTime: string; endTime: string }>,
  label: string
): void {
  const parsed = windows.map((window, index) => ({
    start: parseTimeStrict(window.startTime, `${label} startTime`),
    end: parseTimeStrict(window.endTime, `${label} endTime`),
    index,
  }));
  for (const window of parsed) {
    if (window.start >= window.end) {
      const raw = windows[window.index];
      throw new Error(
        `Invalid ${label} window: startTime "${raw.startTime}" must be before endTime "${raw.endTime}"`
      );
    }
  }
  const sorted = [...parsed].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      const a = windows[sorted[i - 1].index];
      const b = windows[sorted[i].index];
      throw new Error(
        `Overlapping ${label} windows: ${a.startTime}–${a.endTime} and ${b.startTime}–${b.endTime}`
      );
    }
  }
}

/** Validates weeklyHours entries: dayOfWeek 0–6, valid non-overlapping windows per day. */
function assertValidWeeklyHours(
  weeklyHours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
): void {
  const byDay = new Map<number, Array<{ startTime: string; endTime: string }>>();
  for (const entry of weeklyHours) {
    if (!Number.isInteger(entry.dayOfWeek) || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
      throw new Error(
        `Invalid weeklyHours dayOfWeek ${entry.dayOfWeek}: expected an integer between 0 (Sunday) and 6 (Saturday)`
      );
    }
    const windows = byDay.get(entry.dayOfWeek) ?? [];
    windows.push({ startTime: entry.startTime, endTime: entry.endTime });
    byDay.set(entry.dayOfWeek, windows);
  }
  for (const [dayOfWeek, windows] of byDay.entries()) {
    assertNonOverlappingWindows(windows, `weeklyHours (dayOfWeek ${dayOfWeek})`);
  }
}

/** Validates a date override's customHours: valid non-overlapping windows. */
function assertValidCustomHours(
  customHours: Array<{ startTime: string; endTime: string }>
): void {
  assertNonOverlappingWindows(customHours, "customHours");
}

// ============================================
// SCHEDULE QUERIES
// ============================================

export const getSchedule = query({
  args: { id: v.string() },
  returns: v.union(scheduleDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("schedules")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();
  },
});

export const getScheduleById = query({
  args: { scheduleId: v.id("schedules") },
  returns: v.union(scheduleDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.scheduleId);
  },
});

export const listSchedules = query({
  args: { organizationId: v.string() },
  returns: v.array(scheduleDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("schedules")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getDefaultSchedule = query({
  args: { organizationId: v.string() },
  returns: v.union(scheduleDoc, v.null()),
  handler: async (ctx, args) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return schedules.find((s) => s.isDefault) ?? schedules[0] ?? null;
  },
});

// ============================================
// SCHEDULE MUTATIONS
// ============================================

export const createSchedule = mutation({
  args: {
    id: v.string(),
    organizationId: v.string(),
    name: v.string(),
    timezone: v.string(),
    isDefault: v.optional(v.boolean()),
    weeklyHours: v.array(
      v.object({
        dayOfWeek: v.number(),
        startTime: v.string(),
        endTime: v.string(),
      })
    ),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    assertValidWeeklyHours(args.weeklyHours);

    // Check for existing ID
    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (existing) {
      throw new Error(`Schedule with ID "${args.id}" already exists`);
    }

    // If this is default, unset other defaults
    if (args.isDefault) {
      const schedules = await ctx.db
        .query("schedules")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();

      for (const schedule of schedules) {
        if (schedule.isDefault) {
          await ctx.db.patch(schedule._id, { isDefault: false });
        }
      }
    }

    const now = Date.now();
    return await ctx.db.insert("schedules", {
      id: args.id,
      organizationId: args.organizationId,
      name: args.name,
      timezone: args.timezone,
      isDefault: args.isDefault ?? false,
      weeklyHours: args.weeklyHours,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSchedule = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    weeklyHours: v.optional(
      v.array(
        v.object({
          dayOfWeek: v.number(),
          startTime: v.string(),
          endTime: v.string(),
        })
      )
    ),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    if (args.weeklyHours !== undefined) {
      assertValidWeeklyHours(args.weeklyHours);
    }

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!schedule) {
      throw new Error(`Schedule "${args.id}" not found`);
    }

    // If setting as default, unset other defaults
    if (args.isDefault && !schedule.isDefault) {
      const schedules = await ctx.db
        .query("schedules")
        .withIndex("by_org", (q) =>
          q.eq("organizationId", schedule.organizationId)
        )
        .collect();

      for (const s of schedules) {
        if (s.isDefault && s._id !== schedule._id) {
          await ctx.db.patch(s._id, { isDefault: false });
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) updates.name = args.name;
    if (args.timezone !== undefined) updates.timezone = args.timezone;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;
    if (args.weeklyHours !== undefined) updates.weeklyHours = args.weeklyHours;

    await ctx.db.patch(schedule._id, updates);
    return schedule._id;
  },
});

export const deleteSchedule = mutation({
  args: { id: v.string() },
  returns: successResult,
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_external_id", (q) => q.eq("id", args.id))
      .unique();

    if (!schedule) {
      throw new Error(`Schedule "${args.id}" not found`);
    }

    // Delete associated date overrides
    const overrides = await ctx.db
      .query("date_overrides")
      .withIndex("by_schedule_date", (q) => q.eq("scheduleId", schedule._id))
      .collect();

    for (const override of overrides) {
      await ctx.db.delete(override._id);
    }

    await ctx.db.delete(schedule._id);
    return { success: true };
  },
});

// ============================================
// DATE OVERRIDE QUERIES
// ============================================

export const listDateOverrides = query({
  args: {
    scheduleId: v.id("schedules"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  returns: v.array(dateOverrideDoc),
  handler: async (ctx, args) => {
    // The index is [scheduleId, date] and ISO dates sort lexicographically ==
    // chronologically, so both the range and the ascending date order come
    // straight from the index.
    const { dateFrom, dateTo } = args;
    return await ctx.db
      .query("date_overrides")
      .withIndex("by_schedule_date", (q) => {
        const bySchedule = q.eq("scheduleId", args.scheduleId);
        const from = dateFrom !== undefined ? bySchedule.gte("date", dateFrom) : bySchedule;
        return dateTo !== undefined ? from.lte("date", dateTo) : from;
      })
      .collect();
  },
});

export const getDateOverride = query({
  args: {
    scheduleId: v.id("schedules"),
    date: v.string(),
  },
  returns: v.union(dateOverrideDoc, v.null()),
  handler: async (ctx, args) => {
    // Full-depth lookup. .first() keeps first-match semantics should a legacy
    // duplicate (scheduleId, date) row exist; .unique() would throw on it.
    return await ctx.db
      .query("date_overrides")
      .withIndex("by_schedule_date", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("date", args.date)
      )
      .first();
  },
});

// ============================================
// DATE OVERRIDE MUTATIONS
// ============================================

export const createDateOverride = mutation({
  args: {
    scheduleId: v.id("schedules"),
    date: v.string(),
    type: v.string(), // "unavailable" | "custom"
    customHours: v.optional(
      v.array(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
        })
      )
    ),
  },
  returns: v.id("date_overrides"),
  handler: async (ctx, args) => {
    if (args.customHours !== undefined) {
      assertValidCustomHours(args.customHours);
    }

    // Check for existing override on this date
    const existing = await ctx.db
      .query("date_overrides")
      .withIndex("by_schedule_date", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("date", args.date)
      )
      .first();
    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        type: args.type,
        customHours: args.customHours,
      });
      return existing._id;
    }

    return await ctx.db.insert("date_overrides", {
      scheduleId: args.scheduleId,
      date: args.date,
      type: args.type,
      customHours: args.customHours,
    });
  },
});

export const updateDateOverride = mutation({
  args: {
    overrideId: v.id("date_overrides"),
    type: v.optional(v.string()),
    customHours: v.optional(
      v.array(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
        })
      )
    ),
  },
  returns: v.id("date_overrides"),
  handler: async (ctx, args) => {
    if (args.customHours !== undefined) {
      assertValidCustomHours(args.customHours);
    }

    const override = await ctx.db.get(args.overrideId);
    if (!override) {
      throw new Error("Date override not found");
    }

    const updates: Record<string, unknown> = {};
    if (args.type !== undefined) updates.type = args.type;
    if (args.customHours !== undefined) updates.customHours = args.customHours;

    await ctx.db.patch(args.overrideId, updates);
    return args.overrideId;
  },
});

export const deleteDateOverride = mutation({
  args: { overrideId: v.id("date_overrides") },
  returns: successResult,
  handler: async (ctx, args) => {
    const override = await ctx.db.get(args.overrideId);
    if (!override) {
      throw new Error("Date override not found");
    }

    await ctx.db.delete(args.overrideId);
    return { success: true };
  },
});

// ============================================
// EFFECTIVE AVAILABILITY
// ============================================

/**
 * Convert time string "HH:MM" to slot index (0-95)
 */
function timeToSlot(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 4 + Math.floor(minutes / 15);
}

/**
 * Plain async helper that computes effective available slots for a scheduleId + date.
 * Exported so other component files (e.g. public.ts) can call it directly with ctx.db
 * instead of going through ctx.runQuery.
 */
export async function computeAvailabilityForDate(
  ctx: QueryCtx,
  scheduleId: string,
  date: string
): Promise<{ availableSlots: number[] }> {
  const schedule = await ctx.db
    .query("schedules")
    .withIndex("by_external_id", (q) => q.eq("id", scheduleId))
    .unique();

  if (!schedule) {
    // No schedule = default business hours (9-17)
    return { availableSlots: Array.from({ length: 32 }, (_, i) => i + 36) };
  }

  // Check for date override
  const override = await ctx.db
    .query("date_overrides")
    .withIndex("by_schedule_date", (q) =>
      q.eq("scheduleId", schedule._id).eq("date", date)
    )
    .first();

  if (override) {
    if (override.type === "unavailable") {
      return { availableSlots: [] };
    }
    if (override.customHours && override.customHours.length > 0) {
      const slots: number[] = [];
      for (const range of override.customHours) {
        const startSlot = timeToSlot(range.startTime);
        const endSlot = timeToSlot(range.endTime);
        for (let i = startSlot; i < endSlot; i++) {
          slots.push(i);
        }
      }
      return { availableSlots: slots };
    }
  }

  // Get day of week for the date in the schedule's timezone
  // This ensures correct day-of-week even when querying from different timezones
  const dayOfWeek = getDayOfWeekInTimezone(date, schedule.timezone);

  // Find weekly hours for this day
  const dayEntries = schedule.weeklyHours.filter(
    (h) => h.dayOfWeek === dayOfWeek
  );

  if (dayEntries.length === 0) {
    return { availableSlots: [] };
  }

  const slots: number[] = [];
  for (const entry of dayEntries) {
    const startSlot = timeToSlot(entry.startTime);
    const endSlot = timeToSlot(entry.endTime);
    for (let i = startSlot; i < endSlot; i++) {
      if (!slots.includes(i)) {
        slots.push(i);
      }
    }
  }

  return { availableSlots: slots.sort((a, b) => a - b) };
}

/**
 * Get the effective available slots for a resource on a specific date.
 * This considers the schedule's weekly hours and any date overrides.
 */
export const getEffectiveAvailability = query({
  args: {
    scheduleId: v.string(),
    date: v.string(),
  },
  returns: v.object({ availableSlots: v.array(v.number()) }),
  handler: async (ctx, args) =>
    computeAvailabilityForDate(ctx, args.scheduleId, args.date),
});
