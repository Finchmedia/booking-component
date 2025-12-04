export declare const getEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    description?: string | undefined;
    slotInterval?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    organizationId?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    title: string;
    timezone: string;
    id: string;
    lengthInMinutes: number;
    slug: string;
    lockTimeZoneToggle: boolean;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
}>>;
export declare const getAvailability: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    start: number;
    end: number;
}, Promise<boolean>>;
/**
 * Gets availability status for a date range
 * Optimized for month view: Returns boolean map, no slot objects
 *
 * TIMEZONE HANDLING:
 * - dateFrom/dateTo are expected to be ISO date strings (e.g., "2025-06-17")
 * - These are interpreted as UTC dates for consistency
 * - The resourceTimezone parameter (optional) can be used for timezone-aware availability
 */
export declare const getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
    slotInterval?: number | undefined;
    resourceTimezone?: string | undefined;
    resourceId: string;
    dateFrom: string;
    dateTo: string;
    eventLength: number;
}, Promise<Record<string, boolean>>>;
/**
 * Gets detailed slots for a SINGLE day
 * Used for day view / slot picker
 *
 * TIMEZONE HANDLING:
 * - date is expected to be an ISO date string (e.g., "2025-06-17")
 * - If resourceTimezone is provided, slots are generated in that timezone context
 * - If availableSlots are provided (from schedule), those are used instead of hardcoded business hours
 */
export declare const getDaySlots: import("convex/server").RegisteredQuery<"public", {
    slotInterval?: number | undefined;
    resourceTimezone?: string | undefined;
    availableSlots?: number[] | undefined;
    resourceId: string;
    date: string;
    eventLength: number;
}, Promise<{
    time: string;
}[]>>;
export declare const createReservation: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    resourceId: string;
    start: number;
    end: number;
    actorId: string;
}, Promise<import("convex/values").GenericId<"bookings">>>;
export declare const createBooking: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
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
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const getBooking: import("convex/server").RegisteredQuery<"public", {
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const cancelReservation: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    reservationId: import("convex/values").GenericId<"bookings">;
}, Promise<void>>;
export declare const createEventType: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    slotInterval?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    organizationId?: string | undefined;
    isActive?: boolean | undefined;
    scheduleId?: string | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    title: string;
    timezone: string;
    id: string;
    lengthInMinutes: number;
    slug: string;
    lockTimeZoneToggle: boolean;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
}, Promise<import("convex/values").GenericId<"event_types">>>;
export declare const listEventTypes: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    activeOnly?: boolean | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    description?: string | undefined;
    slotInterval?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    organizationId?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    title: string;
    timezone: string;
    id: string;
    lengthInMinutes: number;
    slug: string;
    lockTimeZoneToggle: boolean;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
}[]>>;
export declare const getEventTypeBySlug: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    slug: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    description?: string | undefined;
    slotInterval?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    organizationId?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    title: string;
    timezone: string;
    id: string;
    lengthInMinutes: number;
    slug: string;
    lockTimeZoneToggle: boolean;
    locations: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[];
} | null>>;
export declare const updateEventType: import("convex/server").RegisteredMutation<"public", {
    title?: string | undefined;
    description?: string | undefined;
    timezone?: string | undefined;
    slotInterval?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    lengthInMinutes?: number | undefined;
    isActive?: boolean | undefined;
    scheduleId?: string | undefined;
    slug?: string | undefined;
    lockTimeZoneToggle?: boolean | undefined;
    locations?: {
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[] | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
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
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const listBookings: import("convex/server").RegisteredQuery<"public", {
    eventTypeId?: string | undefined;
    resourceId?: string | undefined;
    organizationId?: string | undefined;
    status?: string | undefined;
    dateFrom?: number | undefined;
    dateTo?: number | undefined;
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
}[]>>;
export declare const getBookingByToken: import("convex/server").RegisteredQuery<"public", {
    uid: string;
    token: string;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
}>>;
export declare const cancelBookingByToken: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    uid: string;
    token: string;
}, Promise<{
    success: boolean;
}>>;
export declare const rescheduleBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    newStart: number;
    newEnd: number;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const rescheduleBookingByToken: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    uid: string;
    token: string;
    newStart: number;
    newEnd: number;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    managementToken?: string | undefined;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    resourceId: string;
    timezone: string;
    uid: string;
    start: number;
    end: number;
    location: {
        value?: string | undefined;
        type: string;
    };
    createdAt: number;
    updatedAt: number;
    actorId: string;
    status: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
//# sourceMappingURL=public.d.ts.map