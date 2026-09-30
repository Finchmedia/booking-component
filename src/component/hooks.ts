import { bookingEmailOptionsValidator, bookingEmailContextValidator, type BookingEmailKind } from "../emails.js";
import { createBookingEmailContext } from "./emails/context.js";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { FunctionHandle, WithoutSystemFields } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import {
  assertStillBookable,
  buildHookEventV2,
  terminateBooking,
  withEventTypeOrganization,
} from "./booking_lifecycle";
import { throwBookingError } from "../shared/booking-errors.js";
import { bookingStatusValidator, type BookingStatus } from "../shared/booking-status.js";
import type { BookingHookEventV2 } from "../shared/hook-events-v2.js";
import {
  bookingHistoryDoc,
  hookDoc,
  successResult,
} from "./validators";

// ============================================
// HOOK EVENT TYPES
// ============================================

export const HOOK_EVENTS = [
  "booking.created",
  "booking.pending",
  "booking.confirmed",
  "booking.cancelled",
  "booking.completed",
  "booking.declined",
  "booking.rescheduled",
  "presence.timeout",
] as const;

export type HookEventType = (typeof HOOK_EVENTS)[number];

/**
 * Whether `value` is a Convex function handle (`createFunctionHandle` output).
 * The scheduler runs any other string as a function path of THIS component,
 * so a hook could name the component's own functions. Mirrors Convex's
 * internal `isFunctionHandle`; a test pins real `createFunctionHandle` output.
 */
function isFunctionHandle(value: string): boolean {
  return value.startsWith("function://");
}

function assertFunctionHandle(value: string): void {
  if (!isFunctionHandle(value)) {
    throwBookingError(
      "INVALID_INPUT",
      `Invalid hook functionHandle "${value}": expected a function handle from createFunctionHandle`
    );
  }
}

// ============================================
// HOOK QUERIES
// ============================================

/**
 * Lists registered hooks, optionally narrowed to one event type and/or to
 * "this organization's or global (no organizationId)" hooks. The result is
 * always in creation order, whichever branch produced it.
 */
export const listHooks = query({
  args: {
    organizationId: v.optional(v.string()),
    eventType: v.optional(v.string()),
  },
  returns: v.array(hookDoc),
  handler: async (ctx, args) => {
    const eventType = args.eventType;
    let hooks = eventType
      ? await ctx.db
          .query("hooks")
          .withIndex("by_event", (q) => q.eq("eventType", eventType))
          .collect()
      : await ctx.db.query("hooks").collect();

    // "This org's or global (no organizationId)" is an OR, not an index range,
    // so it stays a JS filter.
    if (args.organizationId) {
      hooks = hooks.filter(
        (h) => h.organizationId === args.organizationId || !h.organizationId
      );
    }

    // `by_event` is [eventType, enabled], so the prefix scan above comes back
    // grouped by `enabled` (disabled first), not by creation time. Pin the
    // order so both branches agree; the hooks table is tiny.
    hooks.sort((a, b) => a._creationTime - b._creationTime);

    return hooks;
  },
});

export const getHook = query({
  args: { hookId: v.id("hooks") },
  returns: v.union(hookDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hookId);
  },
});

// ============================================
// HOOK MUTATIONS
// ============================================

/**
 * Registers a host function, given as a handle from `createFunctionHandle`,
 * for one lifecycle event (organization-scoped or global). The handle runs
 * with every matching payload, booker details included, so keep
 * registration server-side and administrator-only.
 *
 * `payloadVersion` selects the payload the handle receives as its args:
 * - omitted: version 1, whose shape depends on the emitting function and
 *   which mostly carries the management token (docs/hook-payloads-v1.md);
 * - 2: one envelope per event name, `bookingHookEventV2`, without the token
 *   (docs/hook-payloads-v2.md).
 */
export const registerHook = mutation({
  args: {
    eventType: v.string(),
    functionHandle: v.string(),
    organizationId: v.optional(v.string()),
    payloadVersion: v.optional(v.literal(2)),
  },
  returns: v.id("hooks"),
  handler: async (ctx, args) => {
    // Validate event type
    if (!HOOK_EVENTS.includes(args.eventType as HookEventType)) {
      throwBookingError(
        "INVALID_INPUT",
        `Invalid hook event type: ${args.eventType}. Valid types: ${HOOK_EVENTS.join(", ")}`
      );
    }
    assertFunctionHandle(args.functionHandle);

    return await ctx.db.insert("hooks", {
      eventType: args.eventType,
      functionHandle: args.functionHandle,
      organizationId: args.organizationId,
      enabled: true,
      createdAt: Date.now(),
      payloadVersion: args.payloadVersion,
    });
  },
});

export const updateHook = mutation({
  args: {
    hookId: v.id("hooks"),
    enabled: v.optional(v.boolean()),
    functionHandle: v.optional(v.string()),
  },
  returns: v.id("hooks"),
  handler: async (ctx, args) => {
    if (args.functionHandle !== undefined) {
      assertFunctionHandle(args.functionHandle);
    }
    const hook = await ctx.db.get(args.hookId);
    if (!hook) {
      throwBookingError("HOOK_NOT_FOUND", "Hook not found");
    }

    const updates: Partial<WithoutSystemFields<Doc<"hooks">>> = {};
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.functionHandle !== undefined)
      updates.functionHandle = args.functionHandle;

    await ctx.db.patch(args.hookId, updates);
    return args.hookId;
  },
});

export const unregisterHook = mutation({
  args: { hookId: v.id("hooks") },
  returns: successResult,
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.hookId);
    if (!hook) {
      throwBookingError("HOOK_NOT_FOUND", "Hook not found");
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
    // Version 1 payload, the emitter's own shape (frozen, see hook-payloads-v1.test.ts)
    payload: v.any(),
    emailContext: v.optional(bookingEmailContextValidator),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(bookingEmailOptionsValidator),
    // Version 2 payload (bookingHookEventV2, built by buildHookEventV2). Jobs
    // queued before 0.5.0 lack it; their version 2 hooks are skipped. Kept
    // v.any() so a payload problem can only fail the version 2 handler, never
    // the emails and version 1 hooks of the event.
    payloadV2: v.optional(v.any()),
  },
  // Only ever scheduled, and scheduled jobs keep no result: nothing to report.
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = args.payload as Record<string, unknown>;

    // ========================================
    // BUILT-IN: Send transactional emails
    // ========================================
    if (
      (args.eventType === "booking.created" || args.eventType === "booking.pending") &&
      payload.bookerEmail
    ) {
      const isPending =
        args.eventType === "booking.pending" || payload.status === "pending";
      if (isPending) {
        // Send "awaiting confirmation" email for pending bookings
        await ctx.scheduler.runAfter(0, internal.emails.sendBookingPending, {
          renderer: args.resendOptions?.renderer,
          emailContext: args.emailContext,
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
          renderer: args.resendOptions?.renderer,
          emailContext: args.emailContext,
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

    // Send confirmation/approval email when a booking becomes confirmed.
    if (args.eventType === "booking.confirmed" && payload.bookerEmail) {
      const emailFunction =
        payload.previousStatus === "provisional"
          ? internal.emails.sendBookingConfirmation
          : internal.emails.sendBookingApproved;
      const emailPayload =
        payload.previousStatus === "provisional"
          ? {
              renderer: args.resendOptions?.renderer,
              emailContext: args.emailContext,
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
            }
          : {
              renderer: args.resendOptions?.renderer,
              emailContext: args.emailContext,
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
            };
      await ctx.scheduler.runAfter(0, emailFunction, emailPayload);
    }

    // Send cancellation email
    if (args.eventType === "booking.cancelled" && payload.bookerEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingCancellation, {
        renderer: args.resendOptions?.renderer,
        emailContext: args.emailContext,
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
        renderer: args.resendOptions?.renderer,
        emailContext: args.emailContext,
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
        renderer: args.resendOptions?.renderer,
        emailContext: args.emailContext,
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
      // Rows registered before handles were checked may hold any string, which
      // would run a function of this component by name. unregisterHook removes them.
      if (!isFunctionHandle(hook.functionHandle)) {
        console.error(`Skipped hook ${hook._id}: functionHandle is not a function handle`);
        continue;
      }
      // Each registration gets the payload version it registered for.
      let payload: unknown = args.payload;
      if (hook.payloadVersion === 2) {
        if (args.payloadV2 === undefined) {
          console.warn(`Skipped hook ${hook._id}: this ${args.eventType} event was queued without a version 2 payload`);
          continue;
        }
        payload = args.payloadV2;
      }
      try {
        const handle = hook.functionHandle as FunctionHandle<"mutation">;
        await ctx.scheduler.runAfter(0, handle, payload as Record<string, unknown>);
      } catch (error) {
        // Log error but don't fail the main operation
        console.error(`Failed to trigger hook ${hook._id}:`, error);
      }
    }

    return null;
  },
});

// ============================================
// BOOKING STATE TRANSITIONS
// ============================================

const STATE_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  provisional: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled", "declined"],
  confirmed: ["cancelled", "completed"],
  cancelled: [], // Terminal state
  completed: [], // Terminal state
  declined: [], // Terminal state - admin rejected the booking request
};

export const transitionBookingState = mutation({
  args: {
    bookingId: v.id("bookings"),
    toStatus: bookingStatusValidator,
    reason: v.optional(v.string()),
    changedBy: v.optional(v.string()),
    // Resend config passed from main app (components can't access process.env)
    resendOptions: v.optional(bookingEmailOptionsValidator),
  },
  returns: successResult,
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) {
      throwBookingError("BOOKING_NOT_FOUND", "Booking not found");
    }

    const currentStatus = booking.status;
    const allowedTransitions = STATE_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(args.toStatus)) {
      throwBookingError(
        "INVALID_STATE",
        `Invalid state transition: ${currentStatus} -> ${args.toStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`
      );
    }

    // Completing a hold or a request follows the current booking rules:
    // confirming a provisional hold or approving a pending request, and
    // submitting a provisional hold as a request (provisional -> pending,
    // which tells the booker it awaits approval). After deactivation,
    // unlinking or a change of organization they are rejected. Cancelling,
    // declining and completing never are.
    if (args.toStatus === "confirmed" || args.toStatus === "pending") {
      const items = await ctx.db
        .query("booking_items")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect();
      await assertStillBookable(ctx, booking, items);
    }
    // Every transition notifies the event type's organization only, and
    // gives the booking that organization when another one or none was
    // stored before 0.5.0 (legacy rows and event types without organization
    // keep the stored one).
    const notified = await withEventTypeOrganization(ctx, booking);
    const organizationId = notified.organizationId;

    const now = Date.now();

    if (args.toStatus === "cancelled" || args.toStatus === "declined") {
      // Both end the booking: give the held slots back (per booking_item for
      // bundles, pooled resources included), record history and stamp the
      // cancellation fields — as every other cancel path does. Previously a
      // declined booking (and a cancellation through this state machine)
      // kept its slots busy forever, so the time could never be rebooked.
      await terminateBooking(ctx, booking, {
        to: args.toStatus,
        reason: args.reason,
        changedBy: args.changedBy,
        now,
      });
    } else {
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
      await ctx.db.patch(args.bookingId, {
        status: args.toStatus,
        updatedAt: now,
      });
    }

    // Capture notification data before a later mutation can change this booking.
    const emailKind: BookingEmailKind | undefined =
      args.toStatus === "confirmed"
        ? (currentStatus === "provisional" ? "confirmed" : "approved")
        : args.toStatus === "pending" || args.toStatus === "cancelled" || args.toStatus === "declined"
          ? args.toStatus
          : undefined;

    // Trigger hooks for the transition
    const hookEventType = `booking.${args.toStatus}` as string;
    if (HOOK_EVENTS.includes(hookEventType as HookEventType)) {
      await ctx.scheduler.runAfter(0, internal.hooks.triggerHooks, {
        eventType: hookEventType,
        emailContext: emailKind
          ? createBookingEmailContext(emailKind, notified, args.resendOptions, { reason: args.reason })
          : undefined,
        organizationId,
        payload: {
          bookingId: args.bookingId,
          booking: { ...notified, status: args.toStatus },
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
        // booking.<toStatus> of an allowed transition: pending, confirmed,
        // cancelled, completed or declined.
        payloadV2: await buildHookEventV2(ctx, hookEventType as BookingHookEventV2["event"], args.bookingId, {
          previousStatus: currentStatus,
          reason: args.reason,
          changedBy: args.changedBy,
        }),
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
  returns: v.array(bookingHistoryDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("booking_history")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
  },
});
