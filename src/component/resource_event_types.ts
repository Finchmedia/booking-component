import { mutation, query, type DatabaseReader } from "./_generated/server";
import { v } from "convex/values";
import {
  deletedCount,
  eventTypeDoc,
  resourceDoc,
  successResult,
} from "./validators";
import { throwBookingError } from "../shared/booking-errors.js";

// ============================================
// RESOURCE ↔ EVENT TYPE MAPPING
// Many-to-Many relationship with bidirectional indexes
// ============================================

/**
 * The link rows of one (resource, event type) pair. Component writes keep at
 * most one, but releases up to 0.4.2 wrote duplicates when a replace call
 * repeated an id, so reads take `.first()` and only the link mutations
 * `.collect()` the pair to collapse it.
 */
function linkRows(db: DatabaseReader, resourceId: string, eventTypeId: string) {
  return db
    .query("resource_event_types")
    .withIndex("by_resource_event_type", (q) =>
      q.eq("resourceId", resourceId).eq("eventTypeId", eventTypeId)
    );
}

/** Whether the pair is linked; tolerates duplicate rows and writes nothing. */
export async function isLinked(
  db: DatabaseReader,
  resourceId: string,
  eventTypeId: string
): Promise<boolean> {
  return (await linkRows(db, resourceId, eventTypeId).first()) !== null;
}

/** Each id once, in first-seen order. */
function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all event types linked to a resource
 * Usage: User selects Studio A → show available event types
 */
export const getEventTypesForResource = query({
  args: { resourceId: v.string() },
  returns: v.array(eventTypeDoc),
  handler: async (ctx, args) => {
    // Get all mappings for this resource
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource", (q) => q.eq("resourceId", args.resourceId))
      .collect();

    // Fetch event types (each once, even over duplicate link rows)
    const eventTypes = await Promise.all(
      unique(mappings.map((m) => m.eventTypeId)).map(async (eventTypeId) => {
        return await ctx.db
          .query("event_types")
          .withIndex("by_external_id", (q) => q.eq("id", eventTypeId))
          .unique();
      })
    );

    // Filter out nulls (deleted event types) and inactive event types.
    // Two steps: a compound predicate would not narrow `(Doc | null)[]`.
    return eventTypes
      .filter((et) => et !== null)
      .filter((et) => et.isActive !== false);
  },
});

/**
 * Get all resources linked to an event type
 * Usage: Admin views event type → show linked resources
 */
export const getResourcesForEventType = query({
  args: { eventTypeId: v.string() },
  returns: v.array(resourceDoc),
  handler: async (ctx, args) => {
    // Get all mappings for this event type
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.eventTypeId))
      .collect();

    // Fetch resources (each once, even over duplicate link rows)
    const resources = await Promise.all(
      unique(mappings.map((m) => m.resourceId)).map(async (resourceId) => {
        return await ctx.db
          .query("resources")
          .withIndex("by_external_id", (q) => q.eq("id", resourceId))
          .unique();
      })
    );

    // Filter out nulls (deleted resources)
    return resources.filter((r) => r !== null);
  },
});

/**
 * Check if a specific resource-event type link exists
 */
export const hasResourceEventTypeLink = query({
  args: {
    resourceId: v.string(),
    eventTypeId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await isLinked(ctx.db, args.resourceId, args.eventTypeId);
  },
});

/**
 * Get all resource IDs linked to an event type (lightweight)
 * Returns just IDs for cases where you don't need full resource data
 */
export const getResourceIdsForEventType = query({
  args: { eventTypeId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.eventTypeId))
      .collect();

    return unique(mappings.map((m) => m.resourceId));
  },
});

/**
 * Get all event type IDs linked to a resource (lightweight)
 */
export const getEventTypeIdsForResource = query({
  args: { resourceId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource", (q) => q.eq("resourceId", args.resourceId))
      .collect();

    return unique(mappings.map((m) => m.eventTypeId));
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Link a resource to an event type
 */
export const linkResourceToEventType = mutation({
  args: {
    resourceId: v.string(),
    eventTypeId: v.string(),
  },
  returns: v.id("resource_event_types"),
  handler: async (ctx, args) => {
    // Check if resource exists
    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
      .unique();

    if (!resource) {
      throwBookingError("RESOURCE_NOT_FOUND", `Resource "${args.resourceId}" not found`);
    }

    // Check if event type exists
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
      .unique();

    if (!eventType) {
      throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type "${args.eventTypeId}" not found`);
    }

    // Check if link already exists
    const [existing, ...duplicates] = await linkRows(
      ctx.db,
      args.resourceId,
      args.eventTypeId
    ).collect();

    if (existing) {
      // Link already exists: keep the first row, drop duplicates, return its ID
      for (const duplicate of duplicates) {
        await ctx.db.delete(duplicate._id);
      }
      return existing._id;
    }

    // Create the link
    return await ctx.db.insert("resource_event_types", {
      resourceId: args.resourceId,
      eventTypeId: args.eventTypeId,
    });
  },
});

/**
 * Unlink a resource from an event type
 */
export const unlinkResourceFromEventType = mutation({
  args: {
    resourceId: v.string(),
    eventTypeId: v.string(),
  },
  returns: v.object({ success: v.boolean(), existed: v.boolean() }),
  handler: async (ctx, args) => {
    const mappings = await linkRows(ctx.db, args.resourceId, args.eventTypeId).collect();

    if (mappings.length === 0) {
      // No link exists, nothing to do
      return { success: true, existed: false };
    }

    // Every row of the pair, duplicates included
    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }
    return { success: true, existed: true };
  },
});

/**
 * Set all resources for an event type (replace existing links)
 * Usage: Admin updates event type form with resource checkboxes
 */
export const setResourcesForEventType = mutation({
  args: {
    eventTypeId: v.string(),
    resourceIds: v.array(v.string()),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    // Check if event type exists
    const eventType = await ctx.db
      .query("event_types")
      .withIndex("by_external_id", (q) => q.eq("id", args.eventTypeId))
      .unique();

    if (!eventType) {
      throwBookingError("EVENT_TYPE_NOT_FOUND", `Event type "${args.eventTypeId}" not found`);
    }

    // Get current links
    const existingMappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.eventTypeId))
      .collect();

    const newResourceIds = new Set(args.resourceIds);
    const keptResourceIds = new Set<string>();

    // Delete removed links, and duplicate rows of kept ones
    for (const mapping of existingMappings) {
      if (!newResourceIds.has(mapping.resourceId) || keptResourceIds.has(mapping.resourceId)) {
        await ctx.db.delete(mapping._id);
      } else {
        keptResourceIds.add(mapping.resourceId);
      }
    }

    // Add new links (a repeated id only once)
    for (const resourceId of newResourceIds) {
      if (!keptResourceIds.has(resourceId)) {
        // Verify resource exists
        const resource = await ctx.db
          .query("resources")
          .withIndex("by_external_id", (q) => q.eq("id", resourceId))
          .unique();

        if (resource) {
          await ctx.db.insert("resource_event_types", {
            resourceId,
            eventTypeId: args.eventTypeId,
          });
        }
      }
    }

    return { success: true };
  },
});

/**
 * Set all event types for a resource (replace existing links)
 * Usage: Admin updates resource form with event type checkboxes
 */
export const setEventTypesForResource = mutation({
  args: {
    resourceId: v.string(),
    eventTypeIds: v.array(v.string()),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    // Check if resource exists
    const resource = await ctx.db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", args.resourceId))
      .unique();

    if (!resource) {
      throwBookingError("RESOURCE_NOT_FOUND", `Resource "${args.resourceId}" not found`);
    }

    // Get current links
    const existingMappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource", (q) => q.eq("resourceId", args.resourceId))
      .collect();

    const newEventTypeIds = new Set(args.eventTypeIds);
    const keptEventTypeIds = new Set<string>();

    // Delete removed links, and duplicate rows of kept ones
    for (const mapping of existingMappings) {
      if (!newEventTypeIds.has(mapping.eventTypeId) || keptEventTypeIds.has(mapping.eventTypeId)) {
        await ctx.db.delete(mapping._id);
      } else {
        keptEventTypeIds.add(mapping.eventTypeId);
      }
    }

    // Add new links (a repeated id only once)
    for (const eventTypeId of newEventTypeIds) {
      if (!keptEventTypeIds.has(eventTypeId)) {
        // Verify event type exists
        const eventType = await ctx.db
          .query("event_types")
          .withIndex("by_external_id", (q) => q.eq("id", eventTypeId))
          .unique();

        if (eventType) {
          await ctx.db.insert("resource_event_types", {
            resourceId: args.resourceId,
            eventTypeId,
          });
        }
      }
    }

    return { success: true };
  },
});

/**
 * Delete all links for a resource (used when deleting a resource)
 */
export const deleteAllLinksForResource = mutation({
  args: { resourceId: v.string() },
  returns: deletedCount,
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resource", (q) => q.eq("resourceId", args.resourceId))
      .collect();

    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }

    return { deleted: mappings.length };
  },
});

/**
 * Delete all links for an event type (used when deleting an event type)
 */
export const deleteAllLinksForEventType = mutation({
  args: { eventTypeId: v.string() },
  returns: deletedCount,
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_event_type", (q) => q.eq("eventTypeId", args.eventTypeId))
      .collect();

    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }

    return { deleted: mappings.length };
  },
});
