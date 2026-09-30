import type { ComponentApi } from "../component/_generated/component.js";
export { allowedDurations, effectiveSlotInterval, type EventTypeDurations, } from "../shared/durations.js";
export { bookingHookEventV2, type BookingHookEventV2 } from "../shared/hook-events-v2.js";
export { BOOKING_STATUSES, bookingStatusValidator, isBookingStatus, type BookingStatus, } from "../shared/booking-status.js";
export { BOOKING_ERROR_CODES, isBookingError, isBookingErrorCode, type BookingErrorCode, type BookingErrorData, } from "../shared/booking-errors.js";
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
export declare function makeInternalBookingAPI(component: ComponentApi): {
    getEventType: import("convex/server").RegisteredQuery<"internal", {
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
    } | null>>;
    getEventTypeBySlug: import("convex/server").RegisteredQuery<"internal", {
        organizationId?: string | undefined;
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
    listEventTypes: import("convex/server").RegisteredQuery<"internal", {
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
    createEventType: import("convex/server").RegisteredMutation<"internal", {
        organizationId?: string | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        slotInterval?: number | undefined;
        bufferBefore?: number | undefined;
        bufferAfter?: number | undefined;
        minNoticeMinutes?: number | undefined;
        maxFutureMinutes?: number | undefined;
        scheduleId?: string | undefined;
        description?: string | undefined;
        isActive?: boolean | undefined;
        requiresConfirmation?: boolean | undefined;
        id: string;
        timezone: string;
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
    updateEventType: import("convex/server").RegisteredMutation<"internal", {
        timezone?: string | undefined;
        lengthInMinutes?: number | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        slotInterval?: number | undefined;
        bufferBefore?: number | null | undefined;
        bufferAfter?: number | null | undefined;
        minNoticeMinutes?: number | null | undefined;
        maxFutureMinutes?: number | null | undefined;
        scheduleId?: string | null | undefined;
        description?: string | null | undefined;
        isActive?: boolean | undefined;
        locations?: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[] | undefined;
        lockTimeZoneToggle?: boolean | undefined;
        requiresConfirmation?: boolean | undefined;
        slug?: string | undefined;
        title?: string | undefined;
        id: string;
    }, Promise<string>>;
    deleteEventType: import("convex/server").RegisteredMutation<"internal", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    toggleEventTypeActive: import("convex/server").RegisteredMutation<"internal", {
        id: string;
        isActive: boolean;
    }, Promise<{
        affectedUsers: number;
        success: boolean;
    }>>;
    getAvailability: import("convex/server").RegisteredQuery<"internal", {
        resourceId: string;
        start: number;
        end: number;
    }, Promise<boolean>>;
    getMonthAvailability: import("convex/server").RegisteredQuery<"internal", {
        slotInterval?: number | undefined;
        scheduleId?: string | undefined;
        excludeBookingUid?: string | undefined;
        rescheduleContext?: {
            token: string;
            uid: string;
        } | undefined;
        resourceTimezone?: string | undefined;
        resourceId: string;
        eventLength: number;
        dateFrom: string;
        dateTo: string;
    }, Promise<Record<string, boolean>>>;
    getDaySlots: import("convex/server").RegisteredQuery<"internal", {
        slotInterval?: number | undefined;
        scheduleId?: string | undefined;
        availableSlots?: number[] | undefined;
        excludeBookingUid?: string | undefined;
        rescheduleContext?: {
            token: string;
            uid: string;
        } | undefined;
        resourceTimezone?: string | undefined;
        resourceId: string;
        date: string;
        eventLength: number;
    }, Promise<{
        time: string;
    }[]>>;
    createReservation: import("convex/server").RegisteredMutation<"internal", {
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        resourceId: string;
        start: number;
        end: number;
        actorId: string;
    }, Promise<string>>;
    createBooking: import("convex/server").RegisteredMutation<"internal", {
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        resourceId: string;
        eventTypeId: string;
        start: number;
        end: number;
        timezone: string;
        location: {
            value?: string | undefined;
            type: string;
        };
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    createProvisionalBooking: import("convex/server").RegisteredMutation<"internal", {
        resourceId: string;
        eventTypeId: string;
        start: number;
        end: number;
        timezone: string;
        location: {
            value?: string | undefined;
            type: string;
        };
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    getBooking: import("convex/server").RegisteredQuery<"internal", {
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    getBookingByUid: import("convex/server").RegisteredQuery<"internal", {
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    listBookings: import("convex/server").RegisteredQuery<"internal", {
        organizationId?: string | undefined;
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
        status?: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed" | undefined;
        limit?: number | undefined;
        dateFrom?: number | undefined;
        dateTo?: number | undefined;
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    }[]>>;
    listBookingsPage: import("convex/server").RegisteredQuery<"internal", {
        organizationId?: string | undefined;
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
        status?: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed" | undefined;
        dateFrom?: number | undefined;
        dateTo?: number | undefined;
        includeProvisional?: boolean | undefined;
        paginationOpts: {
            id?: number;
            endCursor?: string | null;
            maximumRowsRead?: number;
            maximumBytesRead?: number;
            numItems: number;
            cursor: string | null;
        };
    }, Promise<{
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
            location: {
                type: string;
                value?: string;
            };
            managementToken?: string;
            organizationId?: string;
            rescheduleUid?: string;
            rescheduledToUid?: string;
            resourceId: string;
            start: number;
            status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
            timezone: string;
            uid: string;
            updatedAt: number;
        }>;
        pageStatus?: "SplitRecommended" | "SplitRequired" | null;
        splitCursor?: string | null;
    }>>;
    cancelReservation: import("convex/server").RegisteredMutation<"internal", {
        reason?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        cancelledBy?: string | undefined;
        reservationId: string;
    }, Promise<{
        alreadyCancelled: boolean;
        success: boolean;
    }>>;
    expireProvisionalBooking: import("convex/server").RegisteredMutation<"internal", {
        reason?: string | undefined;
        bookingId: string;
    }, Promise<{
        reason?: string;
        success: boolean;
    }>>;
    getResource: import("convex/server").RegisteredQuery<"internal", {
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
    listResources: import("convex/server").RegisteredQuery<"internal", {
        type?: string | undefined;
        activeOnly?: boolean | undefined;
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
    createResource: import("convex/server").RegisteredMutation<"internal", {
        description?: string | undefined;
        isActive?: boolean | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        metadata?: Record<string, string> | undefined;
        quantity?: number | undefined;
        type: string;
        id: string;
        organizationId: string;
        timezone: string;
        name: string;
    }, Promise<string>>;
    updateResource: import("convex/server").RegisteredMutation<"internal", {
        type?: string | undefined;
        timezone?: string | undefined;
        description?: string | undefined;
        isActive?: boolean | undefined;
        isFungible?: boolean | undefined;
        isStandalone?: boolean | undefined;
        metadata?: Record<string, string> | undefined;
        name?: string | undefined;
        quantity?: number | undefined;
        id: string;
    }, Promise<string>>;
    deleteResource: import("convex/server").RegisteredMutation<"internal", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    toggleResourceActive: import("convex/server").RegisteredMutation<"internal", {
        id: string;
        isActive: boolean;
    }, Promise<{
        affectedUsers: number;
        success: boolean;
    }>>;
    getEventTypesForResource: import("convex/server").RegisteredQuery<"internal", {
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
    getResourcesForEventType: import("convex/server").RegisteredQuery<"internal", {
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
    getResourceIdsForEventType: import("convex/server").RegisteredQuery<"internal", {
        eventTypeId: string;
    }, Promise<string[]>>;
    getEventTypeIdsForResource: import("convex/server").RegisteredQuery<"internal", {
        resourceId: string;
    }, Promise<string[]>>;
    hasResourceEventTypeLink: import("convex/server").RegisteredQuery<"internal", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<boolean>>;
    linkResourceToEventType: import("convex/server").RegisteredMutation<"internal", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<string>>;
    unlinkResourceFromEventType: import("convex/server").RegisteredMutation<"internal", {
        resourceId: string;
        eventTypeId: string;
    }, Promise<{
        existed: boolean;
        success: boolean;
    }>>;
    setResourcesForEventType: import("convex/server").RegisteredMutation<"internal", {
        eventTypeId: string;
        resourceIds: string[];
    }, Promise<{
        success: boolean;
    }>>;
    setEventTypesForResource: import("convex/server").RegisteredMutation<"internal", {
        resourceId: string;
        eventTypeIds: string[];
    }, Promise<{
        success: boolean;
    }>>;
    getSchedule: import("convex/server").RegisteredQuery<"internal", {
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
    listSchedules: import("convex/server").RegisteredQuery<"internal", {
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
    getDefaultSchedule: import("convex/server").RegisteredQuery<"internal", {
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
    createSchedule: import("convex/server").RegisteredMutation<"internal", {
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
    }, Promise<string>>;
    updateSchedule: import("convex/server").RegisteredMutation<"internal", {
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
    deleteSchedule: import("convex/server").RegisteredMutation<"internal", {
        id: string;
    }, Promise<{
        success: boolean;
    }>>;
    getEffectiveAvailability: import("convex/server").RegisteredQuery<"internal", {
        scheduleId: string;
        date: string;
    }, Promise<{
        availableSlots: Array<number>;
    }>>;
    listDateOverrides: import("convex/server").RegisteredQuery<"internal", {
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
    createDateOverride: import("convex/server").RegisteredMutation<"internal", {
        customHours?: {
            startTime: string;
            endTime: string;
        }[] | undefined;
        type: "unavailable" | "custom";
        scheduleId: string;
        date: string;
    }, Promise<string>>;
    deleteDateOverride: import("convex/server").RegisteredMutation<"internal", {
        overrideId: string;
    }, Promise<{
        success: boolean;
    }>>;
    checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"internal", {
        start: number;
        end: number;
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
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
    createMultiResourceBooking: import("convex/server").RegisteredMutation<"internal", {
        organizationId?: string | undefined;
        location?: {
            value?: string | undefined;
            type: string;
        } | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        eventTypeId: string;
        start: number;
        end: number;
        timezone: string;
        resources: {
            quantity?: number | undefined;
            resourceId: string;
        }[];
        booker: {
            phone?: string | undefined;
            notes?: string | undefined;
            name: string;
            email: string;
        };
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    }>>;
    getBookingWithItems: import("convex/server").RegisteredQuery<"internal", {
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
        rescheduledToUid?: string;
        resourceId: string;
        start: number;
        status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        timezone: string;
        uid: string;
        updatedAt: number;
    } | null>>;
    cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"internal", {
        reason?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        cancelledBy?: string | undefined;
        bookingId: string;
    }, Promise<{
        success: boolean;
    }>>;
    registerHook: import("convex/server").RegisteredMutation<"internal", {
        organizationId?: string | undefined;
        payloadVersion?: 2 | undefined;
        eventType: string;
        functionHandle: string;
    }, Promise<string>>;
    unregisterHook: import("convex/server").RegisteredMutation<"internal", {
        hookId: string;
    }, Promise<{
        success: boolean;
    }>>;
    transitionBookingState: import("convex/server").RegisteredMutation<"internal", {
        reason?: string | undefined;
        changedBy?: string | undefined;
        resendOptions?: {
            fromEmail?: string | undefined;
            baseUrl?: string | undefined;
            renderer?: string | undefined;
            apiKey: string;
        } | undefined;
        bookingId: string;
        toStatus: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    }, Promise<{
        success: boolean;
    }>>;
    getBookingHistory: import("convex/server").RegisteredQuery<"internal", {
        bookingId: string;
    }, Promise<{
        _creationTime: number;
        _id: string;
        bookingId: string;
        changedBy?: string;
        fromStatus: "" | "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
        reason?: string;
        timestamp: number;
        toStatus: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
    }[]>>;
    heartbeat: import("convex/server").RegisteredMutation<"internal", {
        eventTypeId?: string | undefined;
        data?: any;
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<null>>;
    leave: import("convex/server").RegisteredMutation<"internal", {
        resourceId: string;
        slots: string[];
        user: string;
    }, Promise<null>>;
    getPresence: import("convex/server").RegisteredQuery<"internal", {
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
    getDatePresence: import("convex/server").RegisteredQuery<"internal", {
        resourceId: string;
        date: string;
    }, Promise<{
        slot: string;
        updated: number;
        user: string;
    }[]>>;
    getActivePresenceCount: import("convex/server").RegisteredQuery<"internal", {
        resourceId?: string | undefined;
        eventTypeId?: string | undefined;
    }, Promise<{
        count: number;
        users: Array<string>;
    }>>;
    sweepOrphanedHolds: import("convex/server").RegisteredMutation<"internal", {
        cursor?: string | null | undefined;
        limit: number;
        dryRun: boolean;
    }, Promise<{
        continueCursor: string | null;
        deleted: number;
        isDone: boolean;
        rescheduled: number;
        scanned: number;
    }>>;
    wipeAllBookingData: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
        bookingHistory: number;
        bookingItems: number;
        bookings: number;
        dailyAvailability: number;
        quantityAvailability: number;
    }>>;
    wipeAllData: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
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
    getDailyAvailability: import("convex/server").RegisteredQuery<"internal", {
        resourceId: string;
        date: string;
    }, Promise<number[] | null>>;
    audit: import("convex/server").RegisteredQuery<"internal", {
        cursor?: string | null | undefined;
        check: "f10_weekday" | "event_length_invalid" | "event_type_config" | "schedule_config" | "resource_config" | "date_override_config" | "link_integrity" | "booking_integrity" | "booking_eligibility" | "booking_status_invalid";
        limit: number;
    }, Promise<{
        continueCursor: string | null;
        isDone: boolean;
        issues: Array<{
            check: "f10_weekday";
            date: string;
            scheduleId: string;
            start: number;
            uid: string;
        } | {
            check: "event_length_invalid";
            eventTypeId: string;
            lengthInMinutes: number;
            lengthInMinutesOptions?: Array<number>;
        } | {
            check: "event_type_config";
            eventTypeId: string;
            problems: Array<"id" | "lengthInMinutes" | "lengthInMinutesOptions" | "lengthNotInOptions" | "slotInterval" | "bufferBefore" | "bufferAfter" | "minNoticeMinutes" | "maxFutureMinutes" | "timezone" | "scheduleId">;
        } | {
            check: "schedule_config";
            problems: Array<"timezone">;
            scheduleId: string;
        } | {
            check: "resource_config";
            problems: Array<"timezone">;
            resourceId: string;
        } | {
            check: "date_override_config";
            date: string;
            overrideId: string;
            problems: Array<"type" | "customHours" | "date">;
            type: string;
        } | {
            check: "link_integrity";
            eventTypeId: string;
            problems: Array<"resourceMissing" | "eventTypeMissing" | "crossOrganization" | "duplicate">;
            resourceId: string;
        } | {
            check: "booking_integrity";
            problems: Array<"organizationMissing" | "organizationMismatch" | "poolWithoutItems">;
            uid: string;
        } | {
            check: "booking_eligibility";
            eventTypeId: string;
            problems: Array<"eventTypeMissing" | "eventTypeInactive" | "resourceMissing" | "resourceInactive" | "resourceNotLinked" | "crossOrganization" | "noStandalone">;
            resourceIds: Array<string>;
            start: number;
            status: "provisional" | "pending" | "confirmed" | "cancelled" | "declined" | "completed";
            uid: string;
        } | {
            check: "booking_status_invalid";
            problems: Array<"status" | "historyStatus">;
            status: string;
            uid: string;
        }>;
        scanned: number;
    }>>;
    backfillBookingOrganizations: import("convex/server").RegisteredMutation<"internal", {
        cursor?: string | null | undefined;
        limit: number;
        dryRun: boolean;
    }, Promise<{
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
            reason: "event_type_missing" | "event_type_without_organization" | "resource_missing" | "resource_organization_differs";
            resourceId?: string;
            resourceOrganizationId?: string;
            uid: string;
        }>;
        scanned: number;
        skipped: number;
        updated: number;
    }>>;
};
//# sourceMappingURL=index.d.ts.map