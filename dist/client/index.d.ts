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
    }, Promise<{
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
    }>>;
    getEventTypeBySlug: import("convex/server").RegisteredQuery<"public", {
        slug: string;
    }, Promise<{
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
    } | null>>;
    listEventTypes: import("convex/server").RegisteredQuery<"public", {
        organizationId?: string | undefined;
        activeOnly?: boolean | undefined;
    }, Promise<{
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
    }[]>>;
    createEventType: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        bufferAfter?: number | undefined;
        bufferBefore?: number | undefined;
        description?: string | undefined;
        isActive?: boolean | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        maxFutureMinutes?: number | undefined;
        minNoticeMinutes?: number | undefined;
        requiresConfirmation?: boolean | undefined;
        scheduleId?: string | undefined;
        slotInterval?: number | undefined;
        timezone: string;
        id: string;
        lengthInMinutes: number;
        locations: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[];
        lockTimeZoneToggle: boolean;
        slug: string;
        title: string;
    }, Promise<string>>;
    updateEventType: import("convex/server").RegisteredMutation<"public", {
        timezone?: string | undefined;
        bufferAfter?: number | undefined;
        bufferBefore?: number | undefined;
        description?: string | undefined;
        isActive?: boolean | undefined;
        lengthInMinutes?: number | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        locations?: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[] | undefined;
        lockTimeZoneToggle?: boolean | undefined;
        maxFutureMinutes?: number | undefined;
        minNoticeMinutes?: number | undefined;
        requiresConfirmation?: boolean | undefined;
        scheduleId?: string | undefined;
        slotInterval?: number | undefined;
        slug?: string | undefined;
        title?: string | undefined;
        id: string;
    }, Promise<string>>;
    deleteEventType: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    toggleEventTypeActive: import("convex/server").RegisteredMutation<"public", {
        id: string;
        isActive: boolean;
    }, Promise<{
        affectedUsers: number;
        success: boolean;
    }>>;
    getAvailability: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        end: number;
        start: number;
    }, Promise<boolean>>;
    getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
        scheduleId?: string | undefined;
        slotInterval?: number | undefined;
        excludeBookingUid?: string | undefined;
        resourceTimezone?: string | undefined;
        resourceId: string;
        eventLength: number;
        dateFrom: string;
        dateTo: string;
    }, Promise<Record<string, boolean>>>;
    getDaySlots: import("convex/server").RegisteredQuery<"public", {
        slotInterval?: number | undefined;
        availableSlots?: number[] | undefined;
        excludeBookingUid?: string | undefined;
        resourceTimezone?: string | undefined;
        date: string;
        resourceId: string;
        eventLength: number;
    }, Promise<{
        time: string;
    }[]>>;
    createReservation: import("convex/server").RegisteredMutation<"public", {
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        resourceId: string;
        end: number;
        start: number;
        actorId: string;
    }, Promise<string>>;
    createBooking: import("convex/server").RegisteredMutation<"public", {
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        resourceId: string;
        end: number;
        start: number;
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
        eventTypeId: string;
        location: {
            value?: string | undefined;
            type: string;
        };
        timezone: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    createProvisionalBooking: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        end: number;
        start: number;
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
        eventTypeId: string;
        location: {
            value?: string | undefined;
            type: string;
        };
        timezone: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    getBooking: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    getBookingByUid: import("convex/server").RegisteredQuery<"public", {
        uid: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    listBookings: import("convex/server").RegisteredQuery<"public", {
        organizationId?: string | undefined;
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
        dateFrom?: number | undefined;
        dateTo?: number | undefined;
        limit?: number | undefined;
        status?: string | undefined;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    }[]>>;
    cancelReservation: import("convex/server").RegisteredMutation<"public", {
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        reservationId: string;
    }, Promise<{
        alreadyCancelled: boolean;
        success: boolean;
    }>>;
    expireProvisionalBooking: import("convex/server").RegisteredMutation<"public", {
        reason?: string | undefined;
        bookingId: string;
    }, Promise<{
        reason?: string;
        success: boolean;
    }>>;
    getResource: import("convex/server").RegisteredQuery<"public", {
        id: string;
    }, Promise<{
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
    } | null>>;
    listResources: import("convex/server").RegisteredQuery<"public", {
        activeOnly?: boolean | undefined;
        type?: string | undefined;
        organizationId: string;
    }, Promise<{
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
    }[]>>;
    createResource: import("convex/server").RegisteredMutation<"public", {
        description?: string | undefined;
        isActive?: boolean | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        metadata?: Record<string, string> | undefined;
        quantity?: number | undefined;
        organizationId: string;
        timezone: string;
        id: string;
        name: string;
        type: string;
    }, Promise<string>>;
    updateResource: import("convex/server").RegisteredMutation<"public", {
        timezone?: string | undefined;
        description?: string | undefined;
        isActive?: boolean | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        metadata?: Record<string, string> | undefined;
        name?: string | undefined;
        quantity?: number | undefined;
        type?: string | undefined;
        id: string;
    }, Promise<string>>;
    deleteResource: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    toggleResourceActive: import("convex/server").RegisteredMutation<"public", {
        id: string;
        isActive: boolean;
    }, Promise<{
        affectedUsers: number;
        success: boolean;
    }>>;
    getEventTypesForResource: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
    }, Promise<{
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
    }[]>>;
    getResourcesForEventType: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
    }, Promise<{
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
    }[]>>;
    getResourceIdsForEventType: import("convex/server").RegisteredQuery<"public", {
        eventTypeId: string;
    }, Promise<string[]>>;
    getEventTypeIdsForResource: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
    }, Promise<string[]>>;
    hasResourceEventTypeLink: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<boolean>>;
    linkResourceToEventType: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<string>>;
    unlinkResourceFromEventType: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<{
        existed: boolean;
        success: boolean;
    }>>;
    setResourcesForEventType: import("convex/server").RegisteredMutation<"public", {
        eventTypeId: string;
        resourceIds: string[];
    }, Promise<{
        success: boolean;
    }>>;
    setEventTypesForResource: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        eventTypeIds: string[];
    }, Promise<{
        success: boolean;
    }>>;
    getSchedule: import("convex/server").RegisteredQuery<"public", {
        id: string;
    }, Promise<{
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
    } | null>>;
    listSchedules: import("convex/server").RegisteredQuery<"public", {
        organizationId: string;
    }, Promise<{
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
    }[]>>;
    getDefaultSchedule: import("convex/server").RegisteredQuery<"public", {
        organizationId: string;
    }, Promise<{
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
    } | null>>;
    createSchedule: import("convex/server").RegisteredMutation<"public", {
        isDefault?: boolean | undefined;
        organizationId: string;
        timezone: string;
        id: string;
        name: string;
        weeklyHours: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }[];
    }, Promise<string>>;
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
    }, Promise<string>>;
    deleteSchedule: import("convex/server").RegisteredMutation<"public", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    getEffectiveAvailability: import("convex/server").RegisteredQuery<"public", {
        date: string;
        scheduleId: string;
    }, Promise<{
        availableSlots: Array<number>;
    }>>;
    listDateOverrides: import("convex/server").RegisteredQuery<"public", {
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
        scheduleId: string;
    }, Promise<{
        _creationTime: number;
        _id: string;
        customHours?: Array<{
            endTime: string;
            startTime: string;
        }>;
        date: string;
        scheduleId: string;
        type: string;
    }[]>>;
    createDateOverride: import("convex/server").RegisteredMutation<"public", {
        customHours?: {
            startTime: string;
            endTime: string;
        }[] | undefined;
        date: string;
        scheduleId: string;
        type: string;
    }, Promise<string>>;
    deleteDateOverride: import("convex/server").RegisteredMutation<"public", {
        overrideId: string;
    }, Promise<{
        success: boolean;
    }>>;
    checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"public", {
        end: number;
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
        start: number;
    }, Promise<{
        available: boolean;
        resources: Array<{
            available: boolean;
            availableQuantity: number;
            conflicts: Array<number>;
            requestedQuantity: number;
            resourceId: string;
        }>;
    }>>;
    createMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        location?: {
            value?: string | undefined;
            type: string;
        } | undefined;
        end: number;
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
        start: number;
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
        eventTypeId: string;
        timezone: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    getBookingWithItems: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<{
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
        location: {
            type: string;
            value?: string;
        };
        managementToken?: string;
        organizationId?: string;
        rescheduleUid?: string;
        resourceId: string;
        start: number;
        status: string;
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
        reason?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        cancelledBy?: string | undefined;
        bookingId: string;
    }, Promise<{
        success: boolean;
    }>>;
    registerHook: import("convex/server").RegisteredMutation<"public", {
        organizationId?: string | undefined;
        eventType: string;
        functionHandle: string;
    }, Promise<string>>;
    unregisterHook: import("convex/server").RegisteredMutation<"public", {
        hookId: string;
    }, Promise<{
        success: boolean;
    }>>;
    transitionBookingState: import("convex/server").RegisteredMutation<"public", {
        changedBy?: string | undefined;
        reason?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            apiKey: string;
        } | undefined;
        bookingId: string;
        toStatus: string;
    }, Promise<{
        success: boolean;
    }>>;
    getBookingHistory: import("convex/server").RegisteredQuery<"public", {
        bookingId: string;
    }, Promise<{
        _creationTime: number;
        _id: string;
        bookingId: string;
        changedBy?: string;
        fromStatus: string;
        reason?: string;
        timestamp: number;
        toStatus: string;
    }[]>>;
    heartbeat: import("convex/server").RegisteredMutation<"public", {
        eventTypeId?: string | undefined;
        data?: any;
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<null>>;
    leave: import("convex/server").RegisteredMutation<"public", {
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<null>>;
    getPresence: import("convex/server").RegisteredQuery<"public", {
        resourceId: string;
        slot: string;
    }, Promise<{
        _creationTime: number;
        _id: string;
        data?: any;
        eventTypeId?: string;
        resourceId: string;
        slot: string;
        updated: number;
        user: string;
    }[]>>;
    getDatePresence: import("convex/server").RegisteredQuery<"public", {
        date: string;
        resourceId: string;
    }, Promise<{
        slot: string;
        updated: number;
        user: string;
    }[]>>;
    getActivePresenceCount: import("convex/server").RegisteredQuery<"public", {
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
    }, Promise<{
        count: number;
        users: Array<string>;
    }>>;
    wipeAllBookingData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
        bookingHistory: number;
        bookingItems: number;
        bookings: number;
        dailyAvailability: number;
        quantityAvailability: number;
    }>>;
    wipeAllData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
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
    }>>;
    getDailyAvailability: import("convex/server").RegisteredQuery<"public", {
        date: string;
        resourceId: string;
    }, Promise<number[] | null>>;
};
//# sourceMappingURL=index.d.ts.map