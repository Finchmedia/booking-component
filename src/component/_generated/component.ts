/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    hooks: {
      getBookingHistory: FunctionReference<
        "query",
        "internal",
        { bookingId: string },
        Array<{
          _creationTime: number;
          _id: string;
          bookingId: string;
          changedBy?: string;
          fromStatus:
            | ""
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          reason?: string;
          timestamp: number;
          toStatus:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
        }>,
        Name
      >;
      getHook: FunctionReference<
        "query",
        "internal",
        { hookId: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          enabled: boolean;
          eventType: string;
          functionHandle: string;
          organizationId?: string;
          payloadVersion?: 2;
        } | null,
        Name
      >;
      listHooks: FunctionReference<
        "query",
        "internal",
        { eventType?: string; organizationId?: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          enabled: boolean;
          eventType: string;
          functionHandle: string;
          organizationId?: string;
          payloadVersion?: 2;
        }>,
        Name
      >;
      registerHook: FunctionReference<
        "mutation",
        "internal",
        {
          eventType: string;
          functionHandle: string;
          organizationId?: string;
          payloadVersion?: 2;
        },
        string,
        Name
      >;
      transitionBookingState: FunctionReference<
        "mutation",
        "internal",
        {
          bookingId: string;
          changedBy?: string;
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          toStatus:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
        },
        { success: boolean },
        Name
      >;
      unregisterHook: FunctionReference<
        "mutation",
        "internal",
        { hookId: string },
        { success: boolean },
        Name
      >;
      updateHook: FunctionReference<
        "mutation",
        "internal",
        { enabled?: boolean; functionHandle?: string; hookId: string },
        string,
        Name
      >;
    };
    maintenance: {
      audit: FunctionReference<
        "query",
        "internal",
        {
          check:
            | "f10_weekday"
            | "event_length_invalid"
            | "event_type_config"
            | "schedule_config"
            | "resource_config"
            | "date_override_config"
            | "link_integrity"
            | "booking_integrity"
            | "booking_eligibility"
            | "booking_status_invalid";
          cursor?: string | null;
          limit: number;
        },
        {
          continueCursor: string | null;
          isDone: boolean;
          issues: Array<
            | {
                check: "f10_weekday";
                date: string;
                scheduleId: string;
                start: number;
                uid: string;
              }
            | {
                check: "event_length_invalid";
                eventTypeId: string;
                lengthInMinutes: number;
                lengthInMinutesOptions?: Array<number>;
              }
            | {
                check: "event_type_config";
                eventTypeId: string;
                problems: Array<
                  | "id"
                  | "lengthInMinutes"
                  | "lengthInMinutesOptions"
                  | "lengthNotInOptions"
                  | "slotInterval"
                  | "bufferBefore"
                  | "bufferAfter"
                  | "minNoticeMinutes"
                  | "maxFutureMinutes"
                  | "timezone"
                  | "scheduleId"
                >;
              }
            | {
                check: "schedule_config";
                problems: Array<"timezone">;
                scheduleId: string;
              }
            | {
                check: "resource_config";
                problems: Array<"timezone">;
                resourceId: string;
              }
            | {
                check: "date_override_config";
                date: string;
                overrideId: string;
                problems: Array<"type" | "customHours" | "date">;
                type: string;
              }
            | {
                check: "link_integrity";
                eventTypeId: string;
                problems: Array<
                  | "resourceMissing"
                  | "eventTypeMissing"
                  | "crossOrganization"
                  | "duplicate"
                >;
                resourceId: string;
              }
            | {
                check: "booking_integrity";
                problems: Array<
                  | "organizationMissing"
                  | "organizationMismatch"
                  | "poolWithoutItems"
                >;
                uid: string;
              }
            | {
                check: "booking_eligibility";
                eventTypeId: string;
                problems: Array<
                  | "eventTypeMissing"
                  | "eventTypeInactive"
                  | "resourceMissing"
                  | "resourceInactive"
                  | "resourceNotLinked"
                  | "crossOrganization"
                  | "noStandalone"
                >;
                resourceIds: Array<string>;
                start: number;
                status:
                  | "provisional"
                  | "pending"
                  | "confirmed"
                  | "cancelled"
                  | "declined"
                  | "completed";
                uid: string;
              }
            | {
                check: "booking_status_invalid";
                problems: Array<"status" | "historyStatus">;
                status: string;
                uid: string;
              }
          >;
          scanned: number;
        },
        Name
      >;
      backfillBookingOrganizations: FunctionReference<
        "mutation",
        "internal",
        { cursor?: string | null; dryRun: boolean; limit: number },
        {
          continueCursor: string | null;
          isDone: boolean;
          mismatches: Array<{
            eventTypeOrganizationId: string;
            organizationId: string;
            uid: string;
          }>;
          needsReview: Array<{
            eventTypeId: string;
            eventTypeOrganizationId?: string;
            reason:
              | "event_type_missing"
              | "event_type_without_organization"
              | "resource_missing"
              | "resource_organization_differs";
            resourceId?: string;
            resourceOrganizationId?: string;
            uid: string;
          }>;
          scanned: number;
          skipped: number;
          updated: number;
        },
        Name
      >;
      getDailyAvailability: FunctionReference<
        "query",
        "internal",
        { date: string; resourceId: string },
        null | Array<number>,
        Name
      >;
      wipeAllBookingData: FunctionReference<
        "mutation",
        "internal",
        {},
        {
          bookingHistory: number;
          bookingItems: number;
          bookings: number;
          dailyAvailability: number;
          quantityAvailability: number;
        },
        Name
      >;
      wipeAllData: FunctionReference<
        "mutation",
        "internal",
        {},
        {
          bookingHistory: number;
          bookingItems: number;
          bookings: number;
          dailyAvailability: number;
          dateOverrides: number;
          eventTypes: number;
          hooks: number;
          quantityAvailability: number;
          resourceEventTypes: number;
          resources: number;
          schedules: number;
        },
        Name
      >;
    };
    multi_resource: {
      cancelMultiResourceBooking: FunctionReference<
        "mutation",
        "internal",
        {
          bookingId: string;
          cancelledBy?: string;
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
        },
        { success: boolean },
        Name
      >;
      checkMultiResourceAvailability: FunctionReference<
        "query",
        "internal",
        {
          end: number;
          resources: Array<{ quantity?: number; resourceId: string }>;
          start: number;
        },
        {
          available: boolean;
          resources: Array<{
            available: boolean;
            availableQuantity: number;
            conflicts: Array<number>;
            requestedQuantity: number;
            resourceId: string;
          }>;
        },
        Name
      >;
      createMultiResourceBooking: FunctionReference<
        "mutation",
        "internal",
        {
          booker: {
            email: string;
            name: string;
            notes?: string;
            phone?: string;
          };
          end: number;
          eventTypeId: string;
          location?: { type: string; value?: string };
          organizationId?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          resources: Array<{ quantity?: number; resourceId: string }>;
          start: number;
          timezone: string;
        },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      getBookingWithItems: FunctionReference<
        "query",
        "internal",
        { bookingId: string },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          items: Array<{
            _creationTime: number;
            _id: string;
            bookingId: string;
            quantity: number;
            resource: {
              _creationTime: number;
              _id: string;
              createdAt: number;
              description?: string;
              id: string;
              isActive: boolean;
              isFungible?: boolean;
              isStandalone?: boolean;
              metadata?: Record<string, string>;
              name: string;
              organizationId: string;
              quantity?: number;
              timezone: string;
              type: string;
              updatedAt: number;
            } | null;
            resourceId: string;
          }>;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        } | null,
        Name
      >;
    };
    presence: {
      getActivePresenceCount: FunctionReference<
        "query",
        "internal",
        { eventTypeId?: string; resourceId?: string },
        { count: number; users: Array<string> },
        Name
      >;
      getDatePresence: FunctionReference<
        "query",
        "internal",
        { date: string; resourceId: string },
        Array<{ slot: string; updated: number; user: string }>,
        Name
      >;
      heartbeat: FunctionReference<
        "mutation",
        "internal",
        {
          data?: any;
          eventTypeId?: string;
          resourceId: string;
          slots: Array<string>;
          user: string;
        },
        null,
        Name
      >;
      leave: FunctionReference<
        "mutation",
        "internal",
        { resourceId: string; slots: Array<string>; user: string },
        null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { resourceId: string; slot: string },
        Array<{
          _creationTime: number;
          _id: string;
          data?: any;
          eventTypeId?: string;
          resourceId: string;
          slot: string;
          updated: number;
          user: string;
        }>,
        Name
      >;
      sweepOrphanedHolds: FunctionReference<
        "mutation",
        "internal",
        { cursor?: string | null; dryRun: boolean; limit: number },
        {
          continueCursor: string | null;
          deleted: number;
          isDone: boolean;
          rescheduled: number;
          scanned: number;
        },
        Name
      >;
    };
    public: {
      cancelBookingByToken: FunctionReference<
        "mutation",
        "internal",
        {
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          token: string;
          uid: string;
        },
        { success: boolean },
        Name
      >;
      cancelReservation: FunctionReference<
        "mutation",
        "internal",
        {
          cancelledBy?: string;
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          reservationId: string;
        },
        { alreadyCancelled: boolean; success: boolean },
        Name
      >;
      createBooking: FunctionReference<
        "mutation",
        "internal",
        {
          booker: {
            email: string;
            name: string;
            notes?: string;
            phone?: string;
          };
          end: number;
          eventTypeId: string;
          location: { type: string; value?: string };
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          resourceId: string;
          start: number;
          timezone: string;
        },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      createEventType: FunctionReference<
        "mutation",
        "internal",
        {
          bufferAfter?: number;
          bufferBefore?: number;
          description?: string;
          id: string;
          isActive?: boolean;
          lengthInMinutes: number;
          lengthInMinutesOptions?: Array<number>;
          locations: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle: boolean;
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          organizationId?: string;
          requiresConfirmation?: boolean;
          scheduleId?: string;
          slotInterval?: number;
          slug: string;
          timezone: string;
          title: string;
        },
        string,
        Name
      >;
      createProvisionalBooking: FunctionReference<
        "mutation",
        "internal",
        {
          booker: {
            email: string;
            name: string;
            notes?: string;
            phone?: string;
          };
          end: number;
          eventTypeId: string;
          location: { type: string; value?: string };
          resourceId: string;
          start: number;
          timezone: string;
        },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      createReservation: FunctionReference<
        "mutation",
        "internal",
        {
          actorId: string;
          end: number;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          resourceId: string;
          start: number;
        },
        string,
        Name
      >;
      deleteEventType: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        { success: boolean },
        Name
      >;
      expireProvisionalBooking: FunctionReference<
        "mutation",
        "internal",
        { bookingId: string; reason?: string },
        { reason?: string; success: boolean },
        Name
      >;
      getAvailability: FunctionReference<
        "query",
        "internal",
        { end: number; resourceId: string; start: number },
        boolean,
        Name
      >;
      getBooking: FunctionReference<
        "query",
        "internal",
        { bookingId: string },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        } | null,
        Name
      >;
      getBookingByToken: FunctionReference<
        "query",
        "internal",
        { token: string; uid: string },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      getBookingByUid: FunctionReference<
        "query",
        "internal",
        { uid: string },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        } | null,
        Name
      >;
      getDaySlots: FunctionReference<
        "query",
        "internal",
        {
          availableSlots?: Array<number>;
          date: string;
          eventLength: number;
          excludeBookingUid?: string;
          rescheduleContext?: { token: string; uid: string };
          resourceId: string;
          resourceTimezone?: string;
          scheduleId?: string;
          slotInterval?: number;
        },
        Array<{ time: string }>,
        Name
      >;
      getEventType: FunctionReference<
        "query",
        "internal",
        { eventTypeId: string },
        {
          _creationTime: number;
          _id: string;
          bufferAfter?: number;
          bufferBefore?: number;
          createdAt?: number;
          description?: string;
          id: string;
          isActive?: boolean;
          lengthInMinutes: number;
          lengthInMinutesOptions?: Array<number>;
          locations: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle: boolean;
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          organizationId?: string;
          requiresConfirmation?: boolean;
          scheduleId?: string;
          slotInterval?: number;
          slug: string;
          timezone: string;
          title: string;
          updatedAt?: number;
        } | null,
        Name
      >;
      getEventTypeBySlug: FunctionReference<
        "query",
        "internal",
        { organizationId?: string; slug: string },
        {
          _creationTime: number;
          _id: string;
          bufferAfter?: number;
          bufferBefore?: number;
          createdAt?: number;
          description?: string;
          id: string;
          isActive?: boolean;
          lengthInMinutes: number;
          lengthInMinutesOptions?: Array<number>;
          locations: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle: boolean;
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          organizationId?: string;
          requiresConfirmation?: boolean;
          scheduleId?: string;
          slotInterval?: number;
          slug: string;
          timezone: string;
          title: string;
          updatedAt?: number;
        } | null,
        Name
      >;
      getMonthAvailability: FunctionReference<
        "query",
        "internal",
        {
          dateFrom: string;
          dateTo: string;
          eventLength: number;
          excludeBookingUid?: string;
          rescheduleContext?: { token: string; uid: string };
          resourceId: string;
          resourceTimezone?: string;
          scheduleId?: string;
          slotInterval?: number;
        },
        Record<string, boolean>,
        Name
      >;
      listBookings: FunctionReference<
        "query",
        "internal",
        {
          dateFrom?: number;
          dateTo?: number;
          eventTypeId?: string;
          limit?: number;
          organizationId?: string;
          resourceId?: string;
          status?:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
        },
        Array<{
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        }>,
        Name
      >;
      listBookingsPage: FunctionReference<
        "query",
        "internal",
        {
          dateFrom?: number;
          dateTo?: number;
          eventTypeId?: string;
          includeProvisional?: boolean;
          organizationId?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          resourceId?: string;
          status?:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            actorId: string;
            bookerEmail: string;
            bookerName: string;
            bookerNotes?: string;
            bookerPhone?: string;
            cancellationReason?: string;
            cancelledAt?: number;
            createdAt: number;
            end: number;
            eventDescription?: string;
            eventTitle: string;
            eventTypeId: string;
            location: { type: string; value?: string };
            managementToken?: string;
            organizationId?: string;
            rescheduleUid?: string;
            rescheduledToUid?: string;
            resourceId: string;
            start: number;
            status:
              | "provisional"
              | "pending"
              | "confirmed"
              | "cancelled"
              | "declined"
              | "completed";
            timezone: string;
            uid: string;
            updatedAt: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listEventTypes: FunctionReference<
        "query",
        "internal",
        { activeOnly?: boolean; organizationId?: string },
        Array<{
          _creationTime: number;
          _id: string;
          bufferAfter?: number;
          bufferBefore?: number;
          createdAt?: number;
          description?: string;
          id: string;
          isActive?: boolean;
          lengthInMinutes: number;
          lengthInMinutesOptions?: Array<number>;
          locations: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle: boolean;
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          organizationId?: string;
          requiresConfirmation?: boolean;
          scheduleId?: string;
          slotInterval?: number;
          slug: string;
          timezone: string;
          title: string;
          updatedAt?: number;
        }>,
        Name
      >;
      rescheduleBooking: FunctionReference<
        "mutation",
        "internal",
        {
          bookingId: string;
          changedBy?: string;
          newEnd: number;
          newStart: number;
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
        },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      rescheduleBookingByToken: FunctionReference<
        "mutation",
        "internal",
        {
          newEnd: number;
          newStart: number;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
            renderer?: string;
          };
          token: string;
          uid: string;
        },
        {
          _creationTime: number;
          _id: string;
          actorId: string;
          bookerEmail: string;
          bookerName: string;
          bookerNotes?: string;
          bookerPhone?: string;
          cancellationReason?: string;
          cancelledAt?: number;
          createdAt: number;
          end: number;
          eventDescription?: string;
          eventTitle: string;
          eventTypeId: string;
          location: { type: string; value?: string };
          managementToken?: string;
          organizationId?: string;
          rescheduleUid?: string;
          rescheduledToUid?: string;
          resourceId: string;
          start: number;
          status:
            | "provisional"
            | "pending"
            | "confirmed"
            | "cancelled"
            | "declined"
            | "completed";
          timezone: string;
          uid: string;
          updatedAt: number;
        },
        Name
      >;
      toggleEventTypeActive: FunctionReference<
        "mutation",
        "internal",
        { id: string; isActive: boolean },
        { affectedUsers: number; success: boolean },
        Name
      >;
      updateEventType: FunctionReference<
        "mutation",
        "internal",
        {
          bufferAfter?: null | number;
          bufferBefore?: null | number;
          description?: null | string;
          id: string;
          isActive?: boolean;
          lengthInMinutes?: number;
          lengthInMinutesOptions?: Array<number>;
          locations?: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle?: boolean;
          maxFutureMinutes?: null | number;
          minNoticeMinutes?: null | number;
          requiresConfirmation?: boolean;
          scheduleId?: null | string;
          slotInterval?: number;
          slug?: string;
          timezone?: string;
          title?: string;
        },
        string,
        Name
      >;
    };
    resource_event_types: {
      deleteAllLinksForEventType: FunctionReference<
        "mutation",
        "internal",
        { eventTypeId: string },
        { deleted: number },
        Name
      >;
      deleteAllLinksForResource: FunctionReference<
        "mutation",
        "internal",
        { resourceId: string },
        { deleted: number },
        Name
      >;
      getEventTypeIdsForResource: FunctionReference<
        "query",
        "internal",
        { resourceId: string },
        Array<string>,
        Name
      >;
      getEventTypesForResource: FunctionReference<
        "query",
        "internal",
        { resourceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          bufferAfter?: number;
          bufferBefore?: number;
          createdAt?: number;
          description?: string;
          id: string;
          isActive?: boolean;
          lengthInMinutes: number;
          lengthInMinutesOptions?: Array<number>;
          locations: Array<{
            address?: string;
            public?: boolean;
            type: string;
          }>;
          lockTimeZoneToggle: boolean;
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          organizationId?: string;
          requiresConfirmation?: boolean;
          scheduleId?: string;
          slotInterval?: number;
          slug: string;
          timezone: string;
          title: string;
          updatedAt?: number;
        }>,
        Name
      >;
      getResourceIdsForEventType: FunctionReference<
        "query",
        "internal",
        { eventTypeId: string },
        Array<string>,
        Name
      >;
      getResourcesForEventType: FunctionReference<
        "query",
        "internal",
        { eventTypeId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          description?: string;
          id: string;
          isActive: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
          updatedAt: number;
        }>,
        Name
      >;
      hasResourceEventTypeLink: FunctionReference<
        "query",
        "internal",
        { eventTypeId: string; resourceId: string },
        boolean,
        Name
      >;
      linkResourceToEventType: FunctionReference<
        "mutation",
        "internal",
        { eventTypeId: string; resourceId: string },
        string,
        Name
      >;
      setEventTypesForResource: FunctionReference<
        "mutation",
        "internal",
        { eventTypeIds: Array<string>; resourceId: string },
        { success: boolean },
        Name
      >;
      setResourcesForEventType: FunctionReference<
        "mutation",
        "internal",
        { eventTypeId: string; resourceIds: Array<string> },
        { success: boolean },
        Name
      >;
      unlinkResourceFromEventType: FunctionReference<
        "mutation",
        "internal",
        { eventTypeId: string; resourceId: string },
        { existed: boolean; success: boolean },
        Name
      >;
    };
    resources: {
      createResource: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          id: string;
          isActive?: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
        },
        string,
        Name
      >;
      deleteResource: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        { success: boolean },
        Name
      >;
      getQuantityAvailability: FunctionReference<
        "query",
        "internal",
        { date: string; resourceId: string },
        { bookedQuantities: Record<string, number>; totalQuantity: number },
        Name
      >;
      getResource: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          description?: string;
          id: string;
          isActive: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
          updatedAt: number;
        } | null,
        Name
      >;
      getResourceAvailability: FunctionReference<
        "query",
        "internal",
        { date: string; resourceId: string },
        Array<number>,
        Name
      >;
      getResourceById: FunctionReference<
        "query",
        "internal",
        { resourceId: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          description?: string;
          id: string;
          isActive: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
          updatedAt: number;
        } | null,
        Name
      >;
      listResources: FunctionReference<
        "query",
        "internal",
        { activeOnly?: boolean; organizationId: string; type?: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          description?: string;
          id: string;
          isActive: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
          updatedAt: number;
        }>,
        Name
      >;
      listResourcesByType: FunctionReference<
        "query",
        "internal",
        { organizationId: string; type: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          description?: string;
          id: string;
          isActive: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name: string;
          organizationId: string;
          quantity?: number;
          timezone: string;
          type: string;
          updatedAt: number;
        }>,
        Name
      >;
      toggleResourceActive: FunctionReference<
        "mutation",
        "internal",
        { id: string; isActive: boolean },
        { affectedUsers: number; success: boolean },
        Name
      >;
      updateResource: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          id: string;
          isActive?: boolean;
          isFungible?: boolean;
          isStandalone?: boolean;
          metadata?: Record<string, string>;
          name?: string;
          quantity?: number;
          timezone?: string;
          type?: string;
        },
        string,
        Name
      >;
    };
    schedules: {
      createDateOverride: FunctionReference<
        "mutation",
        "internal",
        {
          customHours?: Array<{ endTime: string; startTime: string }>;
          date: string;
          scheduleId: string;
          type: "unavailable" | "custom";
        },
        string,
        Name
      >;
      createSchedule: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          isDefault?: boolean;
          name: string;
          organizationId: string;
          timezone: string;
          weeklyHours: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        },
        string,
        Name
      >;
      deleteDateOverride: FunctionReference<
        "mutation",
        "internal",
        { overrideId: string },
        { success: boolean },
        Name
      >;
      deleteSchedule: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        { success: boolean },
        Name
      >;
      getDateOverride: FunctionReference<
        "query",
        "internal",
        { date: string; scheduleId: string },
        {
          _creationTime: number;
          _id: string;
          customHours?: Array<{ endTime: string; startTime: string }>;
          date: string;
          scheduleId: string;
          type: string;
        } | null,
        Name
      >;
      getDefaultSchedule: FunctionReference<
        "query",
        "internal",
        { organizationId: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          id: string;
          isDefault: boolean;
          name: string;
          organizationId: string;
          timezone: string;
          updatedAt: number;
          weeklyHours: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        } | null,
        Name
      >;
      getEffectiveAvailability: FunctionReference<
        "query",
        "internal",
        { date: string; scheduleId: string },
        { availableSlots: Array<number> },
        Name
      >;
      getSchedule: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          id: string;
          isDefault: boolean;
          name: string;
          organizationId: string;
          timezone: string;
          updatedAt: number;
          weeklyHours: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        } | null,
        Name
      >;
      getScheduleById: FunctionReference<
        "query",
        "internal",
        { scheduleId: string },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          id: string;
          isDefault: boolean;
          name: string;
          organizationId: string;
          timezone: string;
          updatedAt: number;
          weeklyHours: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        } | null,
        Name
      >;
      listDateOverrides: FunctionReference<
        "query",
        "internal",
        { dateFrom?: string; dateTo?: string; scheduleId: string },
        Array<{
          _creationTime: number;
          _id: string;
          customHours?: Array<{ endTime: string; startTime: string }>;
          date: string;
          scheduleId: string;
          type: string;
        }>,
        Name
      >;
      listSchedules: FunctionReference<
        "query",
        "internal",
        { organizationId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          id: string;
          isDefault: boolean;
          name: string;
          organizationId: string;
          timezone: string;
          updatedAt: number;
          weeklyHours: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        }>,
        Name
      >;
      updateDateOverride: FunctionReference<
        "mutation",
        "internal",
        {
          customHours?: Array<{ endTime: string; startTime: string }>;
          overrideId: string;
          type?: "unavailable" | "custom";
        },
        string,
        Name
      >;
      updateSchedule: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          isDefault?: boolean;
          name?: string;
          timezone?: string;
          weeklyHours?: Array<{
            dayOfWeek: number;
            endTime: string;
            startTime: string;
          }>;
        },
        string,
        Name
      >;
    };
  };
