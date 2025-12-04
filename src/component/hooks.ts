import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { FunctionHandle } from "convex/server";

// ============================================
// HOOK EVENT TYPES
// ============================================

export const HOOK_EVENTS = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.completed",
  "booking.declined",
  "booking.rescheduled",
  "presence.timeout",
] as const;

export type HookEventType = (typeof HOOK_EVENTS)[number];

// ============================================
// HOOK QUERIES
// ============================================

export const listHooks = query({
  args: {
    organizationId: v.optional(v.string()),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let hooks = await ctx.db.query("hooks").collect();

    if (args.organizationId) {
      hooks = hooks.filter(
        (h) => h.organizationId === args.organizationId || !h.organizationId
      );
    }

    if (args.eventType) {
      hooks = hooks.filter((h) => h.eventType === args.eventType);
    }

    return hooks;
  },
});

export const getHook = query({
  args: { hookId: v.id("hooks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hookId);
  },
});

// ============================================
// HOOK MUTATIONS
// ============================================

export const registerHook = mutation({
  args: {
    eventType: v.string(),
    functionHandle: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate event type
    if (!HOOK_EVENTS.includes(args.eventType as HookEventType)) {
      throw new Error(
        `Invalid hook event type: ${args.eventType}. Valid types: ${HOOK_EVENTS.join(", ")}`
      );
    }

    return await ctx.db.insert("hooks", {
      eventType: args.eventType,
      functionHandle: args.functionHandle,
      organizationId: args.organizationId,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const updateHook = mutation({
  args: {
    hookId: v.id("hooks"),
    enabled: v.optional(v.boolean()),
    functionHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const updates: Record<string, unknown> = {};
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.functionHandle !== undefined)
      updates.functionHandle = args.functionHandle;

    await ctx.db.patch(args.hookId, updates);
    return args.hookId;
  },
});

export const unregisterHook = mutation({
  args: { hookId: v.id("hooks") },
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    await ctx.db.delete(args.hookId);
    return { success: true };
  },
});

// ============================================
// INTERNAL: TRIGGER HOOKS
// ============================================

export const triggerHooks = internalMutation({
  args: {
    eventType: v.string(),
    organizationId: v.optional(v.string()),
    payload: v.any(),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as Record<string, unknown>;

    // ========================================
    // BUILT-IN: Send transactional emails
    // ========================================
    if (args.eventType === "booking.created" && payload.bookerEmail) {
      const isPending = payload.status === "pending";
      if (isPending) {
        // Send "awaiting confirmation" email for pending bookings
        await ctx.scheduler.runAfter(0, internal.emails.sendBookingPending, {
          to: payload.bookerEmail as string,
          bookerName: (payload.bookerName as string) ?? "Guest",
          eventTitle: (payload.eventTitle as string) ?? "Your Booking",
          start: payload.start as number,
          end: payload.end as number,
          timezone: (payload.timezone as string) ?? "UTC",
          bookingUid: payload.uid as string | undefined,
          managementToken: payload.managementToken as string | undefined,
          baseUrl: args.resendOptions?.baseUrl,
          resendApiKey: args.resendOptions?.apiKey,
          resendFromEmail: args.resendOptions?.fromEmail,
        });
      } else {
        // Send confirmation email for immediately confirmed bookings
        await ctx.scheduler.runAfter(0, internal.emails.sendBookingConfirmation, {
          to: payload.bookerEmail as string,
          bookerName: (payload.bookerName as string) ?? "Guest",
          eventTitle: (payload.eventTitle as string) ?? "Your Booking",
          start: payload.start as number,
          end: payload.end as number,
          timezone: (payload.timezone as string) ?? "UTC",
          resourceId: payload.resourceId as string | undefined,
          bookingUid: payload.uid as string | undefined,
          managementToken: payload.managementToken as string | undefined,
          baseUrl: args.resendOptions?.baseUrl,
          resendApiKey: args.resendOptions?.apiKey,
          resendFromEmail: args.resendOptions?.fromEmail,
        });
      }
    }

    // Send approval email when admin confirms a pending booking
    if (args.eventType === "booking.confirmed" && payload.bookerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingApproved, {
        to: payload.bookerEmail as string,
        bookerName: (payload.bookerName as string) ?? "Guest",
        eventTitle: (payload.eventTitle as string) ?? "Your Booking",
        start: payload.start as number,
        end: payload.end as number,
        timezone: (payload.timezone as string) ?? "UTC",
        bookingUid: payload.uid as string | undefined,
        managementToken: payload.managementToken as string | undefined,
        baseUrl: args.resendOptions?.baseUrl,
        resendApiKey: args.resendOptions?.apiKey,
        resendFromEmail: args.resendOptions?.fromEmail,
      });
    }

    // Send cancellation email
    if (args.eventType === "booking.cancelled" && payload.bookerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingCancellation, {
        to: payload.bookerEmail as string,
        bookerName: (payload.bookerName as string) ?? "Guest",
        eventTitle: (payload.eventTitle as string) ?? "Your Booking",
        start: payload.start as number,
        end: payload.end as number,
        timezone: (payload.timezone as string) ?? "UTC",
        reason: payload.reason as string | undefined,
        resendApiKey: args.resendOptions?.apiKey,
        resendFromEmail: args.resendOptions?.fromEmail,
      });
    }

    // Send declined email when admin rejects a pending booking
    if (args.eventType === "booking.declined" && payload.bookerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingDeclined, {
        to: payload.bookerEmail as string,
        bookerName: (payload.bookerName as string) ?? "Guest",
        eventTitle: (payload.eventTitle as string) ?? "Your Booking",
        start: payload.start as number,
        end: payload.end as number,
        timezone: (payload.timezone as string) ?? "UTC",
        reason: payload.reason as string | undefined,
        resendApiKey: args.resendOptions?.apiKey,
        resendFromEmail: args.resendOptions?.fromEmail,
      });
    }

    // Send rescheduled email
    if (args.eventType === "booking.rescheduled" && payload.bookerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingRescheduled, {
        to: payload.bookerEmail as string,
        bookerName: (payload.bookerName as string) ?? "Guest",
        eventTitle: (payload.eventTitle as string) ?? "Your Booking",
        oldStart: payload.oldStart as number,
        oldEnd: payload.oldEnd as number,
        newStart: payload.newStart as number,
        newEnd: payload.newEnd as number,
        timezone: (payload.timezone as string) ?? "UTC",
        bookingUid: payload.uid as string | undefined,
        managementToken: payload.managementToken as string | undefined,
        baseUrl: args.resendOptions?.baseUrl,
        resendApiKey: args.resendOptions?.apiKey,
        resendFromEmail: args.resendOptions?.fromEmail,
      });
    }

    // ========================================
    // CUSTOM: Trigger user-registered hooks
    // ========================================
    const allHooks = await ctx.db
      .query("hooks")
      .withIndex("by_event", (q) =>
        q.eq("eventType", args.eventType).eq("enabled", true)
      )
      .collect();

    // Filter by organization if specified
    const hooks = allHooks.filter((h) => {
      // Global hooks (no organizationId) apply to all
      if (!h.organizationId) return true;
      // Organization-specific hooks only apply to that org
      if (args.organizationId) return h.organizationId === args.organizationId;
      return false;
    });

    // Trigger each hook
    for (const hook of hooks) {
      try {
        const handle = hook.functionHandle as FunctionHandle<"mutation">;
        await ctx.scheduler.runAfter(0, handle, args.payload);
      } catch (error) {
        // Log error but don't fail the main operation
        console.error(`Failed to trigger hook ${hook._id}:`, error);
      }
    }

    return { triggeredCount: hooks.length, emailsSent: true };
  },
});

// ============================================
// BOOKING STATE TRANSITIONS
// ============================================

const STATE_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled", "declined"],
  confirmed: ["cancelled", "completed"],
  cancelled: [], // Terminal state
  completed: [], // Terminal state
  declined: [], // Terminal state - admin rejected the booking request
};

export const transitionBookingState = mutation({
  args: {
    bookingId: v.id("bookings"),
    toStatus: v.string(),
    reason: v.optional(v.string()),
    changedBy: v.optional(v.string()),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(v.object({
      apiKey: v.string(),
      fromEmail: v.optional(v.string()),
      baseUrl: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }

    const currentStatus = booking.status;
    const allowedTransitions = STATE_TRANSITIONS[currentStatus] ?? [];

    if (!allowedTransitions.includes(args.toStatus)) {
      throw new Error(
        `Invalid state transition: ${currentStatus} -> ${args.toStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`
      );
    }

    const now = Date.now();

    // Record history
    await ctx.db.insert("booking_history", {
      bookingId: args.bookingId,
      fromStatus: currentStatus,
      toStatus: args.toStatus,
      changedBy: args.changedBy,
      reason: args.reason,
      timestamp: now,
    });

    // Update booking
    const updates: Record<string, unknown> = {
      status: args.toStatus,
      updatedAt: now,
    };

    if (args.toStatus === "cancelled") {
      updates.cancelledAt = now;
      updates.cancellationReason = args.reason;
    }

    await ctx.db.patch(args.bookingId, updates);

    // Trigger hooks for the transition
    const hookEventType = `booking.${args.toStatus}` as string;
    if (HOOK_EVENTS.includes(hookEventType as HookEventType)) {
      await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
        eventType: hookEventType,
        organizationId: booking.organizationId,
        payload: {
          bookingId: args.bookingId,
          booking: { ...booking, status: args.toStatus },
          previousStatus: currentStatus,
          reason: args.reason,
          // Fields needed for email templates
          bookerEmail: booking.bookerEmail,
          bookerName: booking.bookerName,
          eventTitle: booking.eventTitle,
          start: booking.start,
          end: booking.end,
          timezone: booking.timezone,
          uid: booking.uid,
          managementToken: booking.managementToken,
        },
        resendOptions: args.resendOptions,
      });
    }

    return { success: true };
  },
});

// ============================================
// GET BOOKING HISTORY
// ============================================

export const getBookingHistory = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("booking_history")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
  },
});
