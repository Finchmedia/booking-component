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
          fromStatus: string;
          reason?: string;
          timestamp: number;
          toStatus: string;
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
        }>,
        Name
      >;
      registerHook: FunctionReference<
        "mutation",
        "internal",
        { eventType: string; functionHandle: string; organizationId?: string },
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
          };
          toStatus: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          resourceTimezone?: string;
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
        },
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
          status?: string;
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
          resourceId: string;
          start: number;
          status: string;
          timezone: string;
          uid: string;
          updatedAt: number;
        }>,
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
          newEnd: number;
          newStart: number;
          reason?: string;
          resendOptions?: {
            apiKey: string;
            baseUrl?: string;
            fromEmail?: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          resourceId: string;
          start: number;
          status: string;
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
          bufferAfter?: number;
          bufferBefore?: number;
          description?: string;
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
          maxFutureMinutes?: number;
          minNoticeMinutes?: number;
          requiresConfirmation?: boolean;
          scheduleId?: string;
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
        { bookedQuantities: any; totalQuantity: number },
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
          type: string;
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
          type?: string;
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
