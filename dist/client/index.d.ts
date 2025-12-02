import type { ComponentApi } from "../component/_generated/component.js";
/**
 * Creates a client API for the booking component.
 * This allows the main app to easily mount the component's functionality.
 *
 * Uses queryGeneric/mutationGeneric directly (not via parameters) so that
 * Convex codegen can properly extract FunctionReference types.
 *
 * @param component - The component API object (from components.booking)
 * @returns An object containing the public queries and mutations
 */
export declare function makeBookingAPI(component: ComponentApi): {
    getEventType: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
    }, Promise<any>>;
    getEventTypeBySlug: import("convex/server").RegisteredQuery<"public", {
        slug: string;
    }, Promise<any>>;
    listEventTypes: import("convex/server").RegisteredQuery<"public", {
        organizationId?: string | undefined;
        activeOnly?: boolean | undefined;
    }, Promise<any>>;
    createEventType: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        slotInterval?: number | undefined;
        description?: string | undefined;
        scheduleId?: string | undefined;
        bufferBefore?: number | undefined;
        bufferAfter?: number | undefined;
        minNoticeMinutes?: number | undefined;
        maxFutureMinutes?: number | undefined;
        requiresConfirmation?: boolean | undefined;
        isActive?: boolean | undefined;
        id: string;
        slug: string;
        title: string;
        lengthInMinutes: number;
        timezone: string;
        lockTimeZoneToggle: boolean;
        locations: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[];
    }, Promise<any>>;
    updateEventType: import("convex/server").RegisteredMutation<"public", {
        slug?: string | undefined;
        title?: string | undefined;
        lengthInMinutes?: number | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        slotInterval?: number | undefined;
        description?: string | undefined;
        timezone?: string | undefined;
        lockTimeZoneToggle?: boolean | undefined;
        locations?: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[] | undefined;
        scheduleId?: string | undefined;
        bufferBefore?: number | undefined;
        bufferAfter?: number | undefined;
        minNoticeMinutes?: number | undefined;
        maxFutureMinutes?: number | undefined;
        requiresConfirmation?: boolean | undefined;
        isActive?: boolean | undefined;
        id: string;
    }, Promise<any>>;
    deleteEventType: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<any>>;
    toggleEventTypeActive: import("convex/server").RegisteredMutation<"public", {
        id: string;
        isActive: boolean;
    }, Promise<any>>;
    getAvailability: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        start: number;
        end: number;
    }, Promise<any>>;
    getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
        slotInterval?: number | undefined;
        resourceId: string;
        dateFrom: string;
        dateTo: string;
        eventLength: number;
    }, Promise<any>>;
    getDaySlots: import("convex/server").RegisteredQuery<"public", {
        slotInterval?: number | undefined;
        resourceId: string;
        eventLength: number;
        date: string;
    }, Promise<any>>;
    createReservation: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        start: number;
        end: number;
        actorId: string;
    }, Promise<any>>;
    createBooking: import("convex/server").RegisteredMutation<"public", {
        eventTypeId: string;
        timezone: string;
        resourceId: string;
        start: number;
        end: number;
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
        location: {
            value?: string | undefined;
            type: string;
        };
    }, Promise<any>>;
    getBooking: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<any>>;
    getBookingByUid: import("convex/server").RegisteredQuery<"public", {
        uid: string;
    }, Promise<any>>;
    listBookings: import("convex/server").RegisteredQuery<"public", {
        eventTypeId?: string | undefined;
        organizationId?: string | undefined;
        resourceId?: string | undefined;
        dateFrom?: number | undefined;
        dateTo?: number | undefined;
        status?: string | undefined;
        limit?: number | undefined;
    }, Promise<any>>;
    cancelReservation: import("convex/server").RegisteredMutation<"public", {
        reservationId: string;
    }, Promise<any>>;
    getResource: import("convex/server").RegisteredQuery<"public", {
        id: string;
    }, Promise<any>>;
    listResources: import("convex/server").RegisteredQuery<"public", {
        type?: string | undefined;
        activeOnly?: boolean | undefined;
        organizationId: string;
    }, Promise<any>>;
    createResource: import("convex/server").RegisteredMutation<"public", {
        description?: string | undefined;
        isActive?: boolean | undefined;
        quantity?: number | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        id: string;
        type: string;
        organizationId: string;
        timezone: string;
        name: string;
    }, Promise<any>>;
    updateResource: import("convex/server").RegisteredMutation<"public", {
        type?: string | undefined;
        description?: string | undefined;
        timezone?: string | undefined;
        isActive?: boolean | undefined;
        name?: string | undefined;
        quantity?: number | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        id: string;
    }, Promise<any>>;
    deleteResource: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<any>>;
    toggleResourceActive: import("convex/server").RegisteredMutation<"public", {
        id: string;
        isActive: boolean;
    }, Promise<any>>;
    getEventTypesForResource: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
    }, Promise<any>>;
    getResourcesForEventType: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
    }, Promise<any>>;
    getResourceIdsForEventType: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
    }, Promise<any>>;
    getEventTypeIdsForResource: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
    }, Promise<any>>;
    hasResourceEventTypeLink: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
        resourceId: string;
    }, Promise<any>>;
    linkResourceToEventType: import("convex/server").RegisteredMutation<"public", {
        eventTypeId: string;
        resourceId: string;
    }, Promise<any>>;
    unlinkResourceFromEventType: import("convex/server").RegisteredMutation<"public", {
        eventTypeId: string;
        resourceId: string;
    }, Promise<any>>;
    setResourcesForEventType: import("convex/server").RegisteredMutation<"public", {
        eventTypeId: string;
        resourceIds: string[];
    }, Promise<any>>;
    setEventTypesForResource: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        eventTypeIds: string[];
    }, Promise<any>>;
    getSchedule: import("convex/server").RegisteredQuery<"public", {
        id: string;
    }, Promise<any>>;
    listSchedules: import("convex/server").RegisteredQuery<"public", {
        organizationId: string;
    }, Promise<any>>;
    getDefaultSchedule: import("convex/server").RegisteredQuery<"public", {
        organizationId: string;
    }, Promise<any>>;
    createSchedule: import("convex/server").RegisteredMutation<"public", {
        isDefault?: boolean | undefined;
        id: string;
        organizationId: string;
        timezone: string;
        name: string;
        weeklyHours: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }[];
    }, Promise<any>>;
    updateSchedule: import("convex/server").RegisteredMutation<"public", {
        timezone?: string | undefined;
        name?: string | undefined;
        isDefault?: boolean | undefined;
        weeklyHours?: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }[] | undefined;
        id: string;
    }, Promise<any>>;
    deleteSchedule: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<any>>;
    getEffectiveAvailability: import("convex/server").RegisteredQuery<"public", {
        scheduleId: string;
        date: string;
    }, Promise<any>>;
    listDateOverrides: import("convex/server").RegisteredQuery<"public", {
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
        scheduleId: string;
    }, Promise<any>>;
    createDateOverride: import("convex/server").RegisteredMutation<"public", {
        customHours?: {
            startTime: string;
            endTime: string;
        }[] | undefined;
        type: string;
        scheduleId: string;
        date: string;
    }, Promise<any>>;
    deleteDateOverride: import("convex/server").RegisteredMutation<"public", {
        overrideId: string;
    }, Promise<any>>;
    checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"public", {
        start: number;
        end: number;
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
    }, Promise<any>>;
    createMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        location?: {
            value?: string | undefined;
            type: string;
        } | undefined;
        eventTypeId: string;
        timezone: string;
        start: number;
        end: number;
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
    }, Promise<any>>;
    getBookingWithItems: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<any>>;
    cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
        reason?: string | undefined;
        cancelledBy?: string | undefined;
        bookingId: string;
    }, Promise<any>>;
    registerHook: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        eventType: string;
        functionHandle: string;
    }, Promise<any>>;
    unregisterHook: import("convex/server").RegisteredMutation<"public", {
        hookId: string;
    }, Promise<any>>;
    transitionBookingState: import("convex/server").RegisteredMutation<"public", {
        reason?: string | undefined;
        changedBy?: string | undefined;
        bookingId: string;
        toStatus: string;
    }, Promise<any>>;
    getBookingHistory: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<any>>;
    heartbeat: import("convex/server").RegisteredMutation<"public", {
        eventTypeId?: string | undefined;
        data?: any;
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<any>>;
    leave: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<any>>;
    getPresence: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        slot: string;
    }, Promise<any>>;
    getDatePresence: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        date: string;
    }, Promise<any>>;
    getActivePresenceCount: import("convex/server").RegisteredQuery<"public", {
        eventTypeId?: string | undefined;
        resourceId?: string | undefined;
    }, Promise<any>>;
};
//# sourceMappingURL=index.d.ts.map