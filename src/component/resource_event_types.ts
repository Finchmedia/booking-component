import { mutation, query, type DatabaseReader, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
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
    .withIndex("by_resourceId_and_eventTypeId", (q) =>
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

/**
 * Whether a resource may serve an event type's bookings as far as
 * organizations go: an event type with an organization takes only that
 * organization's resources; one without (a global or legacy event type) takes
 * any. Links and every booking check use this rule.
 */
export function sharesOrganization(
  resource: Doc<"resources">,
  eventType: Doc<"event_types">
): boolean {
  return eventType.organizationId === undefined || resource.organizationId === eventType.organizationId;
}

/** Rejects a link across organizations (see sharesOrganization). */
function assertLinkable(resource: Doc<"resources">, eventType: Doc<"event_types">): void {
  if (!sharesOrganization(resource, eventType)) {
    throwBookingError(
      "ORGANIZATION_MISMATCH",
      `Resource "${resource.id}" of organization "${resource.organizationId}" cannot be linked to event type "${eventType.id}" of organization "${eventType.organizationId}"`
    );
  }
}

/**
 * Before an event type without organization is adopted into
 * `organizationId` (createEventType on its id): the links stay, so every
 * linked resource must belong to that organization, as the link mutations
 * require. Links whose resource no longer exists do not count
 * (link_integrity lists them).
 */
export async function assertLinksAdoptable(
  db: DatabaseReader,
  eventTypeId: string,
  organizationId: string
): Promise<void> {
  const links = await db
    .query("resource_event_types")
    .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", eventTypeId))
    .collect();
  for (const resourceId of unique(links.map((link) => link.resourceId))) {
    const resource = await db
      .query("resources")
      .withIndex("by_external_id", (q) => q.eq("id", resourceId))
      .first();
    if (resource && resource.organizationId !== organizationId) {
      throwBookingError(
        "ORGANIZATION_MISMATCH",
        `Event type "${eventTypeId}" cannot join organization "${organizationId}": its linked resource "${resource.id}" belongs to organization "${resource.organizationId}". Unlink it first`
      );
    }
  }
}

/**
 * Deletes every link row of a resource or of an event type and returns how
 * many there were. deleteResource and deleteEventType call it, so an id
 * created again later starts unlinked.
 */
export async function deleteLinks(
  ctx: MutationCtx,
  of: { resourceId: string } | { eventTypeId: string }
): Promise<number> {
  const links = await ("resourceId" in of
    ? ctx.db
        .query("resource_event_types")
        .withIndex("by_resourceId", (q) => q.eq("resourceId", of.resourceId))
    : ctx.db
        .query("resource_event_types")
        .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", of.eventTypeId))
  ).collect();
  for (const link of links) {
    await ctx.db.delete(link._id);
  }
  return links.length;
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
      .withIndex("by_resourceId", (q) => q.eq("resourceId", args.resourceId))
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
      .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", args.eventTypeId))
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
      .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", args.eventTypeId))
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
      .withIndex("by_resourceId", (q) => q.eq("resourceId", args.resourceId))
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

    assertLinkable(resource, eventType);

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

    // Every requested resource that exists must share the event type's
    // organization; one that does not rejects the whole call. Unknown ids are
    // skipped, as before.
    const newResourceIds = new Set(args.resourceIds);
    const existingResourceIds = new Set<string>();
    for (const resourceId of newResourceIds) {
      const resource = await ctx.db
        .query("resources")
        .withIndex("by_external_id", (q) => q.eq("id", resourceId))
        .unique();
      if (resource) {
        assertLinkable(resource, eventType);
        existingResourceIds.add(resourceId);
      }
    }

    // Get current links
    const existingMappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_eventTypeId", (q) => q.eq("eventTypeId", args.eventTypeId))
      .collect();

    const keptResourceIds = new Set<string>();

    // Delete removed links, and duplicate rows of kept ones
    for (const mapping of existingMappings) {
      if (!newResourceIds.has(mapping.resourceId) || keptResourceIds.has(mapping.resourceId)) {
        await ctx.db.delete(mapping._id);
      } else {
        keptResourceIds.add(mapping.resourceId);
      }
    }

    // Add new links (a repeated id only once; unknown ids skipped)
    for (const resourceId of existingResourceIds) {
      if (!keptResourceIds.has(resourceId)) {
        await ctx.db.insert("resource_event_types", {
          resourceId,
          eventTypeId: args.eventTypeId,
        });
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

    // Every requested event type that exists must accept the resource's
    // organization; one that does not rejects the whole call. Unknown ids are
    // skipped, as before.
    const newEventTypeIds = new Set(args.eventTypeIds);
    const existingEventTypeIds = new Set<string>();
    for (const eventTypeId of newEventTypeIds) {
      const eventType = await ctx.db
        .query("event_types")
        .withIndex("by_external_id", (q) => q.eq("id", eventTypeId))
        .unique();
      if (eventType) {
        assertLinkable(resource, eventType);
        existingEventTypeIds.add(eventTypeId);
      }
    }

    // Get current links
    const existingMappings = await ctx.db
      .query("resource_event_types")
      .withIndex("by_resourceId", (q) => q.eq("resourceId", args.resourceId))
      .collect();

    const keptEventTypeIds = new Set<string>();

    // Delete removed links, and duplicate rows of kept ones
    for (const mapping of existingMappings) {
      if (!newEventTypeIds.has(mapping.eventTypeId) || keptEventTypeIds.has(mapping.eventTypeId)) {
        await ctx.db.delete(mapping._id);
      } else {
        keptEventTypeIds.add(mapping.eventTypeId);
      }
    }

    // Add new links (a repeated id only once; unknown ids skipped)
    for (const eventTypeId of existingEventTypeIds) {
      if (!keptEventTypeIds.has(eventTypeId)) {
        await ctx.db.insert("resource_event_types", {
          resourceId: args.resourceId,
          eventTypeId,
        });
      }
    }

    return { success: true };
  },
});

/**
 * Delete all links for a resource. deleteResource does this itself since
 * 0.5.0; this removes link rows that earlier deletes left behind.
 */
export const deleteAllLinksForResource = mutation({
  args: { resourceId: v.string() },
  returns: deletedCount,
  handler: async (ctx, args) => {
    return { deleted: await deleteLinks(ctx, { resourceId: args.resourceId }) };
  },
});

/**
 * Delete all links for an event type. deleteEventType does this itself since
 * 0.5.0; this removes link rows that earlier deletes left behind.
 */
export const deleteAllLinksForEventType = mutation({
  args: { eventTypeId: v.string() },
  returns: deletedCount,
  handler: async (ctx, args) => {
    return { deleted: await deleteLinks(ctx, { eventTypeId: args.eventTypeId }) };
  },
});
