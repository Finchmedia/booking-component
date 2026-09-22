import { internalQueryGeneric, internalMutationGeneric } from "convex/server";
import { v } from "convex/values";
/**
 * Creates server-only helpers for the booking component.
 *
 * Every returned function is internal: exporting it from a host Convex module
 * does not make it callable by browser clients. Access these helpers through
 * `internal.<module>.<function>`, or call `components.booking.*` directly.
 *
 * For public APIs, write host query/mutation functions that enforce your
 * authentication, organization ownership and booking policy before calling the
 * component. No public-function factory is provided.
 */
export function makeInternalBookingAPI(component) {
    return {
        // ============================================
        // EVENT TYPES
        // ============================================
        getEventType: internalQueryGeneric({
            args: { eventTypeId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getEventType, args);
            },
        }),
        getEventTypeBySlug: internalQueryGeneric({
            args: { slug: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getEventTypeBySlug, args);
            },
        }),
        listEventTypes: internalQueryGeneric({
            args: {
                organizationId: v.optional(v.string()),
                activeOnly: v.optional(v.boolean()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.listEventTypes, args);
            },
        }),
        createEventType: internalMutationGeneric({
            args: {
                id: v.string(),
                slug: v.string(),
                title: v.string(),
                lengthInMinutes: v.number(),
                lengthInMinutesOptions: v.optional(v.array(v.number())),
                slotInterval: v.optional(v.number()),
                description: v.optional(v.string()),
                timezone: v.string(),
                lockTimeZoneToggle: v.boolean(),
                locations: v.array(v.object({
                    type: v.string(),
                    address: v.optional(v.string()),
                    public: v.optional(v.boolean()),
                })),
                organizationId: v.optional(v.string()),
                scheduleId: v.optional(v.string()),
                bufferBefore: v.optional(v.number()),
                bufferAfter: v.optional(v.number()),
                minNoticeMinutes: v.optional(v.number()),
                maxFutureMinutes: v.optional(v.number()),
                requiresConfirmation: v.optional(v.boolean()),
                isActive: v.optional(v.boolean()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.createEventType, args);
            },
        }),
        updateEventType: internalMutationGeneric({
            args: {
                id: v.string(),
                title: v.optional(v.string()),
                slug: v.optional(v.string()),
                lengthInMinutes: v.optional(v.number()),
                lengthInMinutesOptions: v.optional(v.array(v.number())),
                slotInterval: v.optional(v.number()),
                description: v.optional(v.string()),
                timezone: v.optional(v.string()),
                lockTimeZoneToggle: v.optional(v.boolean()),
                locations: v.optional(v.array(v.object({
                    type: v.string(),
                    address: v.optional(v.string()),
                    public: v.optional(v.boolean()),
                }))),
                scheduleId: v.optional(v.string()),
                bufferBefore: v.optional(v.number()),
                bufferAfter: v.optional(v.number()),
                minNoticeMinutes: v.optional(v.number()),
                maxFutureMinutes: v.optional(v.number()),
                requiresConfirmation: v.optional(v.boolean()),
                isActive: v.optional(v.boolean()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.updateEventType, args);
            },
        }),
        deleteEventType: internalMutationGeneric({
            args: { id: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.deleteEventType, args);
            },
        }),
        toggleEventTypeActive: internalMutationGeneric({
            args: { id: v.string(), isActive: v.boolean() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.toggleEventTypeActive, args);
            },
        }),
        // ============================================
        // AVAILABILITY
        // ============================================
        getAvailability: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                start: v.number(),
                end: v.number(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getAvailability, args);
            },
        }),
        getMonthAvailability: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                dateFrom: v.string(),
                dateTo: v.string(),
                eventLength: v.number(),
                slotInterval: v.optional(v.number()),
                resourceTimezone: v.optional(v.string()),
                scheduleId: v.optional(v.string()),
                excludeBookingUid: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getMonthAvailability, args);
            },
        }),
        getDaySlots: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                date: v.string(),
                eventLength: v.number(),
                slotInterval: v.optional(v.number()),
                resourceTimezone: v.optional(v.string()),
                availableSlots: v.optional(v.array(v.number())),
                excludeBookingUid: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getDaySlots, args);
            },
        }),
        // ============================================
        // BOOKINGS
        // ============================================
        createReservation: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                actorId: v.string(),
                start: v.number(),
                end: v.number(),
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.createReservation, args);
            },
        }),
        createBooking: internalMutationGeneric({
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
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.createBooking, args);
            },
        }),
        createProvisionalBooking: internalMutationGeneric({
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
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.createProvisionalBooking, args);
            },
        }),
        getBooking: internalQueryGeneric({
            args: { bookingId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getBooking, {
                    bookingId: args.bookingId,
                });
            },
        }),
        getBookingByUid: internalQueryGeneric({
            args: { uid: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.getBookingByUid, args);
            },
        }),
        listBookings: internalQueryGeneric({
            args: {
                organizationId: v.optional(v.string()),
                resourceId: v.optional(v.string()),
                status: v.optional(v.string()),
                dateFrom: v.optional(v.number()),
                dateTo: v.optional(v.number()),
                eventTypeId: v.optional(v.string()),
                limit: v.optional(v.number()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.public.listBookings, args);
            },
        }),
        cancelReservation: internalMutationGeneric({
            args: {
                reservationId: v.string(),
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.cancelReservation, {
                    reservationId: args.reservationId,
                    resendOptions: args.resendOptions,
                });
            },
        }),
        expireProvisionalBooking: internalMutationGeneric({
            args: {
                bookingId: v.string(),
                reason: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.public.expireProvisionalBooking, {
                    bookingId: args.bookingId,
                    reason: args.reason,
                });
            },
        }),
        // ============================================
        // RESOURCES
        // ============================================
        getResource: internalQueryGeneric({
            args: { id: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resources.getResource, args);
            },
        }),
        listResources: internalQueryGeneric({
            args: {
                organizationId: v.string(),
                type: v.optional(v.string()),
                activeOnly: v.optional(v.boolean()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resources.listResources, args);
            },
        }),
        createResource: internalMutationGeneric({
            args: {
                id: v.string(),
                organizationId: v.string(),
                name: v.string(),
                type: v.string(),
                description: v.optional(v.string()),
                timezone: v.string(),
                quantity: v.optional(v.number()),
                isFungible: v.optional(v.boolean()),
                isStandalone: v.optional(v.boolean()),
                isActive: v.optional(v.boolean()),
                metadata: v.optional(v.record(v.string(), v.string())),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resources.createResource, args);
            },
        }),
        updateResource: internalMutationGeneric({
            args: {
                id: v.string(),
                name: v.optional(v.string()),
                type: v.optional(v.string()),
                description: v.optional(v.string()),
                timezone: v.optional(v.string()),
                quantity: v.optional(v.number()),
                isFungible: v.optional(v.boolean()),
                isStandalone: v.optional(v.boolean()),
                isActive: v.optional(v.boolean()),
                metadata: v.optional(v.record(v.string(), v.string())),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resources.updateResource, args);
            },
        }),
        deleteResource: internalMutationGeneric({
            args: { id: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resources.deleteResource, args);
            },
        }),
        toggleResourceActive: internalMutationGeneric({
            args: { id: v.string(), isActive: v.boolean() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resources.toggleResourceActive, args);
            },
        }),
        // ============================================
        // RESOURCE ↔ EVENT TYPE MAPPING
        // ============================================
        getEventTypesForResource: internalQueryGeneric({
            args: { resourceId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resource_event_types.getEventTypesForResource, args);
            },
        }),
        getResourcesForEventType: internalQueryGeneric({
            args: { eventTypeId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resource_event_types.getResourcesForEventType, args);
            },
        }),
        getResourceIdsForEventType: internalQueryGeneric({
            args: { eventTypeId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resource_event_types.getResourceIdsForEventType, args);
            },
        }),
        getEventTypeIdsForResource: internalQueryGeneric({
            args: { resourceId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resource_event_types.getEventTypeIdsForResource, args);
            },
        }),
        hasResourceEventTypeLink: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                eventTypeId: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.resource_event_types.hasResourceEventTypeLink, args);
            },
        }),
        linkResourceToEventType: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                eventTypeId: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resource_event_types.linkResourceToEventType, args);
            },
        }),
        unlinkResourceFromEventType: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                eventTypeId: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resource_event_types.unlinkResourceFromEventType, args);
            },
        }),
        setResourcesForEventType: internalMutationGeneric({
            args: {
                eventTypeId: v.string(),
                resourceIds: v.array(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resource_event_types.setResourcesForEventType, args);
            },
        }),
        setEventTypesForResource: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                eventTypeIds: v.array(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.resource_event_types.setEventTypesForResource, args);
            },
        }),
        // ============================================
        // SCHEDULES
        // ============================================
        getSchedule: internalQueryGeneric({
            args: { id: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.schedules.getSchedule, args);
            },
        }),
        listSchedules: internalQueryGeneric({
            args: { organizationId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.schedules.listSchedules, args);
            },
        }),
        getDefaultSchedule: internalQueryGeneric({
            args: { organizationId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.schedules.getDefaultSchedule, args);
            },
        }),
        createSchedule: internalMutationGeneric({
            args: {
                id: v.string(),
                organizationId: v.string(),
                name: v.string(),
                timezone: v.string(),
                isDefault: v.optional(v.boolean()),
                weeklyHours: v.array(v.object({
                    dayOfWeek: v.number(),
                    startTime: v.string(),
                    endTime: v.string(),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.schedules.createSchedule, args);
            },
        }),
        updateSchedule: internalMutationGeneric({
            args: {
                id: v.string(),
                name: v.optional(v.string()),
                timezone: v.optional(v.string()),
                isDefault: v.optional(v.boolean()),
                weeklyHours: v.optional(v.array(v.object({
                    dayOfWeek: v.number(),
                    startTime: v.string(),
                    endTime: v.string(),
                }))),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.schedules.updateSchedule, args);
            },
        }),
        deleteSchedule: internalMutationGeneric({
            args: { id: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.schedules.deleteSchedule, args);
            },
        }),
        getEffectiveAvailability: internalQueryGeneric({
            args: { scheduleId: v.string(), date: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.schedules.getEffectiveAvailability, args);
            },
        }),
        // Date Overrides
        listDateOverrides: internalQueryGeneric({
            args: {
                scheduleId: v.string(),
                dateFrom: v.optional(v.string()),
                dateTo: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.schedules.listDateOverrides, {
                    scheduleId: args.scheduleId,
                    dateFrom: args.dateFrom,
                    dateTo: args.dateTo,
                });
            },
        }),
        createDateOverride: internalMutationGeneric({
            args: {
                scheduleId: v.string(),
                date: v.string(),
                type: v.string(),
                customHours: v.optional(v.array(v.object({
                    startTime: v.string(),
                    endTime: v.string(),
                }))),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.schedules.createDateOverride, {
                    scheduleId: args.scheduleId,
                    date: args.date,
                    type: args.type,
                    customHours: args.customHours,
                });
            },
        }),
        deleteDateOverride: internalMutationGeneric({
            args: { overrideId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.schedules.deleteDateOverride, {
                    overrideId: args.overrideId,
                });
            },
        }),
        // ============================================
        // MULTI-RESOURCE BOOKING
        // ============================================
        checkMultiResourceAvailability: internalQueryGeneric({
            args: {
                resources: v.array(v.object({
                    resourceId: v.string(),
                    quantity: v.optional(v.number()),
                })),
                start: v.number(),
                end: v.number(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.multi_resource.checkMultiResourceAvailability, args);
            },
        }),
        createMultiResourceBooking: internalMutationGeneric({
            args: {
                eventTypeId: v.string(),
                organizationId: v.optional(v.string()),
                resources: v.array(v.object({
                    resourceId: v.string(),
                    quantity: v.optional(v.number()),
                })),
                start: v.number(),
                end: v.number(),
                timezone: v.string(),
                booker: v.object({
                    name: v.string(),
                    email: v.string(),
                    phone: v.optional(v.string()),
                    notes: v.optional(v.string()),
                }),
                location: v.optional(v.object({
                    type: v.string(),
                    value: v.optional(v.string()),
                })),
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.multi_resource.createMultiResourceBooking, args);
            },
        }),
        getBookingWithItems: internalQueryGeneric({
            args: { bookingId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.multi_resource.getBookingWithItems, {
                    bookingId: args.bookingId,
                });
            },
        }),
        cancelMultiResourceBooking: internalMutationGeneric({
            args: {
                bookingId: v.string(),
                reason: v.optional(v.string()),
                cancelledBy: v.optional(v.string()),
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.multi_resource.cancelMultiResourceBooking, {
                    bookingId: args.bookingId,
                    reason: args.reason,
                    cancelledBy: args.cancelledBy,
                    resendOptions: args.resendOptions,
                });
            },
        }),
        // ============================================
        // HOOKS
        // ============================================
        registerHook: internalMutationGeneric({
            args: {
                eventType: v.string(),
                functionHandle: v.string(),
                organizationId: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.hooks.registerHook, args);
            },
        }),
        unregisterHook: internalMutationGeneric({
            args: { hookId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.hooks.unregisterHook, {
                    hookId: args.hookId,
                });
            },
        }),
        transitionBookingState: internalMutationGeneric({
            args: {
                bookingId: v.string(),
                toStatus: v.string(),
                reason: v.optional(v.string()),
                changedBy: v.optional(v.string()),
                resendOptions: v.optional(v.object({
                    apiKey: v.string(),
                    fromEmail: v.optional(v.string()),
                })),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.hooks.transitionBookingState, {
                    bookingId: args.bookingId,
                    toStatus: args.toStatus,
                    reason: args.reason,
                    changedBy: args.changedBy,
                    resendOptions: args.resendOptions,
                });
            },
        }),
        getBookingHistory: internalQueryGeneric({
            args: { bookingId: v.string() },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.hooks.getBookingHistory, {
                    bookingId: args.bookingId,
                });
            },
        }),
        // ============================================
        // PRESENCE (Best-effort UI signals; not inventory locks)
        // ============================================
        heartbeat: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                slots: v.array(v.string()),
                user: v.string(),
                eventTypeId: v.optional(v.string()),
                data: v.optional(v.any()),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.presence.heartbeat, args);
            },
        }),
        leave: internalMutationGeneric({
            args: {
                resourceId: v.string(),
                slots: v.array(v.string()),
                user: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runMutation(component.presence.leave, args);
            },
        }),
        getPresence: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                slot: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.presence.list, args);
            },
        }),
        getDatePresence: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                date: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.presence.getDatePresence, args);
            },
        }),
        getActivePresenceCount: internalQueryGeneric({
            args: {
                resourceId: v.optional(v.string()),
                eventTypeId: v.optional(v.string()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.presence.getActivePresenceCount, args);
            },
        }),
        // ============================================
        // MAINTENANCE (Sandbox resets / debugging)
        // Internal only. Keep resets inaccessible to browser clients.
        // ============================================
        wipeAllBookingData: internalMutationGeneric({
            args: {},
            handler: async (ctx) => {
                return await ctx.runMutation(component.maintenance.wipeAllBookingData, {});
            },
        }),
        wipeAllData: internalMutationGeneric({
            args: {},
            handler: async (ctx) => {
                return await ctx.runMutation(component.maintenance.wipeAllData, {});
            },
        }),
        getDailyAvailability: internalQueryGeneric({
            args: {
                resourceId: v.string(),
                date: v.string(),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.maintenance.getDailyAvailability, args);
            },
        }),
    };
}
//# sourceMappingURL=index.js.map