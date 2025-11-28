export declare const getEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
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
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
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
}>>;
export declare const getAvailability: import("convex/server").RegisteredQuery<"public", {
    end: number;
    start: number;
    resourceId: string;
}, Promise<boolean>>;
/**
 * Gets availability status for a date range
 * Optimized for month view: Returns boolean map, no slot objects
 */
export declare const getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
    slotInterval?: number | undefined;
    resourceId: string;
    eventLength: number;
    dateFrom: string;
    dateTo: string;
}, Promise<Record<string, boolean>>>;
/**
 * Gets detailed slots for a SINGLE day
 * Used for day view / slot picker
 */
export declare const getDaySlots: import("convex/server").RegisteredQuery<"public", {
    slotInterval?: number | undefined;
    resourceId: string;
    date: string;
    eventLength: number;
}, Promise<{
    time: string;
}[]>>;
export declare const createReservation: import("convex/server").RegisteredMutation<"public", {
    end: number;
    start: number;
    resourceId: string;
    actorId: string;
}, Promise<import("convex/values").GenericId<"bookings">>>;
export declare const createBooking: import("convex/server").RegisteredMutation<"public", {
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
    resourceId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    actorId: string;
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const getBooking: import("convex/server").RegisteredQuery<"public", {
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    actorId: string;
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const cancelReservation: import("convex/server").RegisteredMutation<"public", {
    reservationId: import("convex/values").GenericId<"bookings">;
}, Promise<void>>;
export declare const createEventType: import("convex/server").RegisteredMutation<"public", {
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
}, Promise<import("convex/values").GenericId<"event_types">>>;
export declare const listEventTypes: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    activeOnly?: boolean | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
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
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
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
}[]>>;
export declare const getEventTypeBySlug: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    slug: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
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
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
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
} | null>>;
export declare const updateEventType: import("convex/server").RegisteredMutation<"public", {
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
}, Promise<import("convex/values").GenericId<"event_types">>>;
export declare const deleteEventType: import("convex/server").RegisteredMutation<"public", {
    id: string;
}, Promise<{
    success: boolean;
}>>;
export declare const toggleEventTypeActive: import("convex/server").RegisteredMutation<"public", {
    id: string;
    isActive: boolean;
}, Promise<{
    success: boolean;
    affectedUsers: number;
}>>;
export declare const getBookingByUid: import("convex/server").RegisteredQuery<"public", {
    uid: string;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    actorId: string;
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const listBookings: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    eventTypeId?: string | undefined;
    resourceId?: string | undefined;
    dateFrom?: number | undefined;
    dateTo?: number | undefined;
    limit?: number | undefined;
    status?: string | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    actorId: string;
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
}[]>>;
//# sourceMappingURL=public.d.ts.map