import { v } from "convex/values";
import type { IndexRange } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  type DatabaseReader,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { presenceDoc } from "./validators";
import { throwBookingError } from "../shared/booking-errors.js";

const TIMEOUT_MS = 10_000; // Users are considered "gone" after 10 seconds

type HoldKey = { resourceId: string; slot: string; user: string };

function scheduleCleanup(ctx: MutationCtx, key: HoldKey) {
  return ctx.scheduler.runAfter(TIMEOUT_MS, internal.presence.cleanup, {
    resourceId: key.resourceId,
    slot: key.slot,
    user: key.user,
  });
}

/**
 * Whether the cleanup job a marker names can still run. `inProgress` counts as
 * live: production never reports it for a mutation, convex-test does while
 * the job runs.
 */
async function isCleanupJobLive(ctx: MutationCtx, jobId: Id<"_scheduled_functions">) {
  const job = await ctx.db.system.get(jobId);
  return job?.state.kind === "pending" || job?.state.kind === "inProgress";
}

/**
 * signals that a user is present in one or more slots (time slots).
 * Updates their timestamp and ensures a cleanup job is scheduled for each slot.
 * Accepts an array of slots to batch multiple heartbeats into a single transaction.
 *
 * A hold is identified by (user, slot, resourceId): the same user can hold
 * the same ISO slot on several resources at once (room + equipment), and
 * heartbeat/leave/cleanup for one resource must never touch the others'.
 */
export const heartbeat = mutation({
  args: {
    resourceId: v.string(),
    slots: v.array(v.string()),
    user: v.string(),
    eventTypeId: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Process each slot in the batch
    for (const slot of args.slots) {
      // 1. Update or create the presence record
      const existingPresence = await ctx.db
        .query("presence")
        .withIndex("by_user_and_slot_and_resourceId", (q) =>
          q.eq("user", args.user).eq("slot", slot).eq("resourceId", args.resourceId)
        )
        .first();

      if (existingPresence) {
        await ctx.db.patch(existingPresence._id, {
          updated: now,
          eventTypeId: args.eventTypeId,
          data: args.data ?? existingPresence.data,
        });
      } else {
        await ctx.db.insert("presence", {
          resourceId: args.resourceId,
          user: args.user,
          slot: slot,
          eventTypeId: args.eventTypeId,
          updated: now,
          data: args.data,
        });
      }

      // 2. Ensure a cleanup job is scheduled
      const existingHeartbeat = await ctx.db
        .query("presence_heartbeats")
        .withIndex("by_user_and_slot_and_resourceId", (q) =>
          q.eq("user", args.user).eq("slot", slot).eq("resourceId", args.resourceId)
        )
        .first();

      // A new hold gets its cleanup job here. An existing marker keeps its job
      // while that job can still run; a marker whose job was cancelled, failed
      // or is gone gets exactly one replacement, or the hold would never expire.
      if (!existingHeartbeat) {
        const scheduledId = await scheduleCleanup(ctx, { ...args, slot });
        await ctx.db.insert("presence_heartbeats", {
          resourceId: args.resourceId,
          user: args.user,
          slot: slot,
          markAsGone: scheduledId,
        });
      } else if (!(await isCleanupJobLive(ctx, existingHeartbeat.markAsGone))) {
        const scheduledId = await scheduleCleanup(ctx, { ...args, slot });
        await ctx.db.patch(existingHeartbeat._id, { markAsGone: scheduledId });
      }
    }

    return null;
  },
});

/**
 * Explicitly removes a user from one or more slots.
 * Called when a user navigates away or unmounts.
 * Accepts an array of slots to batch multiple leave operations into a single transaction.
 */
export const leave = mutation({
  args: {
    resourceId: v.string(),
    slots: v.array(v.string()),
    user: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Process each slot in the batch
    for (const slot of args.slots) {
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_user_and_slot_and_resourceId", (q) =>
          q.eq("user", args.user).eq("slot", slot).eq("resourceId", args.resourceId)
        )
        .first();

      const heartbeatDoc = await ctx.db
        .query("presence_heartbeats")
        .withIndex("by_user_and_slot_and_resourceId", (q) =>
          q.eq("user", args.user).eq("slot", slot).eq("resourceId", args.resourceId)
        )
        .first();

      if (presence) await ctx.db.delete(presence._id);

      // Cancel the marker's cleanup job with it. cleanup looks the marker up
      // by key, so a job left queued would adopt the marker of a rejoin on the
      // same key and keep a second chain alive. Only a pending job can be
      // cancelled; a finished, failed or cancelled one is left alone.
      if (heartbeatDoc) {
        const job = await ctx.db.system.get(heartbeatDoc.markAsGone);
        if (job?.state.kind === "pending") await ctx.scheduler.cancel(job._id);
        await ctx.db.delete(heartbeatDoc._id);
      }
    }

    return null;
  },
});

/**
 * Returns the (up to 20) most recently active users present in a slot.
 * The staleness cutoff (TIMEOUT_MS) is applied by the index range instead of
 * a JS post-filter, so stale rows the cleanup job hasn't removed yet are never
 * read. The returned set is unchanged from the post-filter version: the query
 * reads `updated` descending, so live rows always sorted ahead of stale ones
 * and `take(20)` already picked live rows first.
 */
export const list = query({
  args: {
    resourceId: v.string(),
    slot: v.string(),
  },
  returns: v.array(presenceDoc),
  handler: async (ctx, args) => {
    // `gte`: exactly TIMEOUT_MS old is still live, matching `markAsGone` and
    // the other reads (`now - updated <= TIMEOUT_MS`).
    const now = Date.now();
    return await ctx.db
      .query("presence")
      .withIndex("by_resourceId_and_slot_and_updated", (q) =>
        q
          .eq("resourceId", args.resourceId)
          .eq("slot", args.slot)
          .gte("updated", now - TIMEOUT_MS)
      )
      .order("desc") // Most recently active first
      .take(20);
  },
});

/**
 * Returns all active presence holds for a specific resource on a given date.
 * Uses range query optimization to efficiently fetch all slots with a date prefix.
 *
 * @param resourceId - The resource ID (e.g., "studio-a")
 * @param date - The date prefix in ISO format (e.g., "2025-11-28")
 * @returns Array of active presence records for that resource+date
 */
export const getDatePresence = query({
  args: {
    resourceId: v.string(),
    date: v.string(),
  },
  returns: v.array(
    v.object({
      slot: v.string(),
      user: v.string(),
      updated: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Range query on compound index: efficiently fetch all slots starting with date prefix
    // Example: date="2025-11-28" matches "2025-11-28T10:00:00.000Z", "2025-11-28T14:30:00.000Z", etc.
    // Using \u{FFFF} (char 65535) as upper bound ensures we capture all timestamps on that date
    const allPresence = await ctx.db
      .query("presence")
      .withIndex("by_resourceId_and_slot_and_updated", (q) =>
        q
          .eq("resourceId", args.resourceId)
          .gte("slot", args.date)
          .lt("slot", args.date + "\u{FFFF}")
      )
      .collect();

    // Filter out stale presence (only return active holds)
    const activePresence = allPresence.filter(
      (p) => now - p.updated <= TIMEOUT_MS
    );

    // Return simplified data (no internal IDs)
    return activePresence.map((p) => ({
      slot: p.slot,
      user: p.user,
      updated: p.updated,
    }));
  },
});

/**
 * Returns count of unique users with active presence for a resource or event type.
 * Used by admin UI to warn before deactivating resources/event types.
 *
 * @param resourceId - Optional resource ID to filter by
 * @param eventTypeId - Optional event type ID to filter by
 * @returns Object with count and array of unique user IDs
 */
export const getActivePresenceCount = query({
  args: {
    resourceId: v.optional(v.string()),
    eventTypeId: v.optional(v.string()),
  },
  returns: v.object({
    count: v.number(),
    users: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let presenceRecords;

    // Query based on what's provided. Deliberately no [resourceId, updated]
    // index: `updated` is rewritten on every heartbeat, and this is a rare
    // admin read — the JS staleness filter below is the cheaper trade.
    if (args.resourceId) {
      // Get all presence for this resource
      presenceRecords = await ctx.db
        .query("presence")
        .withIndex("by_resourceId_and_slot_and_updated", (q) =>
          q.eq("resourceId", args.resourceId!)
        )
        .collect();
    } else if (args.eventTypeId) {
      // Get all presence for this event type
      presenceRecords = await ctx.db
        .query("presence")
        .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", args.eventTypeId))
        .collect();
    } else {
      // No filter provided
      return { count: 0, users: [] };
    }

    // Filter to only active presence (within timeout window)
    const activePresence = presenceRecords.filter(
      (p) => now - p.updated <= TIMEOUT_MS
    );

    // Deduplicate by user (multi-slot bookings = 1 user, not N records)
    const uniqueUsers = [...new Set(activePresence.map((p) => p.user))];

    return {
      count: uniqueUsers.length,
      users: uniqueUsers,
    };
  },
});

/**
 * Internal mutation run by the scheduler.
 * Checks if a user has timed out. If so, deletes them.
 * If they are still active, reschedules itself.
 */
export const cleanup = internalMutation({
  args: {
    resourceId: v.string(),
    slot: v.string(),
    user: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user_and_slot_and_resourceId", (q) =>
        q.eq("user", args.user).eq("slot", args.slot).eq("resourceId", args.resourceId)
      )
      .first();

    const heartbeatDoc = await ctx.db
      .query("presence_heartbeats")
      .withIndex("by_user_and_slot_and_resourceId", (q) =>
        q.eq("user", args.user).eq("slot", args.slot).eq("resourceId", args.resourceId)
      )
      .first();

    if (!presence || !heartbeatDoc) {
      // Data missing, clean up whatever remains
      if (presence) await ctx.db.delete(presence._id);
      if (heartbeatDoc) await ctx.db.delete(heartbeatDoc._id);
      return null;
    }

    const now = Date.now();
    if (now - presence.updated > TIMEOUT_MS) {
      // User is truly gone. Delete everything.
      await ctx.db.delete(presence._id);
      await ctx.db.delete(heartbeatDoc._id);
    } else {
      // User is still here! They must have updated their presence recently.
      // Reschedule the check.
      const scheduledId = await ctx.scheduler.runAfter(
        TIMEOUT_MS,
        internal.presence.cleanup,
        args
      );
      await ctx.db.patch(heartbeatDoc._id, { markAsGone: scheduledId });
    }

    return null;
  },
});

// ============================================
// ORPHAN SWEEP (one-time repair after upgrading)
// ============================================

/**
 * Largest `limit` of one sweep call. Each marker costs at most one job read,
 * one presence read and either two deletes or one scheduled job plus a patch,
 * so a full page stays well inside the transaction limits.
 */
const MAX_SWEEP_LIMIT = 500;

/**
 * A marker's complete by_creation_time index key. Creation times can tie
 * (imported rows), so the time alone would skip or repeat rows at a page
 * boundary.
 */
type SweepCursor = { creationTime: number; id: Id<"presence_heartbeats"> };

function encodeSweepCursor(marker: Doc<"presence_heartbeats">): string {
  return JSON.stringify([marker._creationTime, marker._id]);
}

function parseSweepCursor(db: DatabaseReader, cursor: string): SweepCursor {
  let key: unknown;
  try {
    key = JSON.parse(cursor);
  } catch {
    key = null;
  }
  if (Array.isArray(key) && key.length === 2 && Number.isFinite(key[0]) && typeof key[1] === "string") {
    const id = db.normalizeId("presence_heartbeats", key[1]);
    if (id) return { creationTime: key[0], id };
  }
  throwBookingError("INVALID_INPUT", "Invalid sweep cursor");
}

/**
 * Up to `limit` markers after `cursor`, in by_creation_time order: the rest of
 * the cursor's tie group first, then the later creation times — the same split
 * the convex-helpers paginator uses. The key is compared by value, so a
 * cursor row deleted in the meantime is fine.
 */
async function markersAfter(
  db: DatabaseReader,
  cursor: SweepCursor | null,
  limit: number
): Promise<Doc<"presence_heartbeats">[]> {
  if (!cursor) {
    return await db.query("presence_heartbeats").withIndex("by_creation_time").take(limit);
  }
  const tieGroup = await db
    .query("presence_heartbeats")
    .withIndex("by_creation_time", (q) =>
      // Every index ends with _id; the typed builder stops at _creationTime.
      (
        q.eq("_creationTime", cursor.creationTime) as unknown as {
          gt(field: "_id", value: Id<"presence_heartbeats">): IndexRange;
        }
      ).gt("_id", cursor.id)
    )
    .take(limit);
  if (tieGroup.length === limit) return tieGroup;
  const later = await db
    .query("presence_heartbeats")
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", cursor.creationTime))
    .take(limit - tieGroup.length);
  return [...tieGroup, ...later];
}

/**
 * Repairs presence holds whose cleanup job can no longer run (cancelled,
 * failed or gone), one page of markers per call. A stale orphan loses its
 * presence row and marker; a fresh one gets one replacement cleanup job.
 * Markers with a live job are left alone. Only presence tables are touched.
 *
 * Steady-state operation creates no orphans; they need an external failure
 * such as a cancelled job. Run it once after upgrading from 0.4.2 or earlier,
 * from a host internalMutation: start without a cursor and pass
 * `continueCursor` back until `isDone`. `dryRun` counts without writing.
 * Markers created during a sweep sort after the cursor and are visited too;
 * they come with a live job, so they are left alone.
 */
export const sweepOrphanedHolds = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    rescheduled: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_SWEEP_LIMIT) {
      throwBookingError("INVALID_INPUT", `limit must be an integer from 1 to ${MAX_SWEEP_LIMIT}`);
    }
    const cursor =
      typeof args.cursor === "string" ? parseSweepCursor(ctx.db, args.cursor) : null;
    const markers = await markersAfter(ctx.db, cursor, args.limit);

    const now = Date.now();
    let deleted = 0;
    let rescheduled = 0;
    for (const marker of markers) {
      if (await isCleanupJobLive(ctx, marker.markAsGone)) continue;

      const presence = await ctx.db
        .query("presence")
        .withIndex("by_user_and_slot_and_resourceId", (q) =>
          q.eq("user", marker.user).eq("slot", marker.slot).eq("resourceId", marker.resourceId)
        )
        .first();

      if (!presence || now - presence.updated > TIMEOUT_MS) {
        deleted++;
        if (args.dryRun) continue;
        if (presence) await ctx.db.delete(presence._id);
        await ctx.db.delete(marker._id);
      } else {
        rescheduled++;
        if (args.dryRun) continue;
        const scheduledId = await scheduleCleanup(ctx, marker);
        await ctx.db.patch(marker._id, { markAsGone: scheduledId });
      }
    }

    const last = markers[markers.length - 1];
    return {
      scanned: markers.length,
      deleted,
      rescheduled,
      continueCursor: last ? encodeSweepCursor(last) : (args.cursor ?? null),
      isDone: markers.length < args.limit,
    };
  },
});
