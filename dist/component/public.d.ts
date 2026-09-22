export declare const getEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    organizationId?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    id: string;
    timezone: string;
    slug: string;
    title: string;
    lengthInMinutes: number;
    lockTimeZoneToggle: boolean;
    locations: {
        address?: string | undefined;
        public?: boolean | undefined;
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
    scheduleId?: string | undefined;
    slotInterval?: number | undefined;
    resourceTimezone?: string | undefined;
    excludeBookingUid?: string | undefined;
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
    availableSlots?: number[] | undefined;
    resourceTimezone?: string | undefined;
    excludeBookingUid?: string | undefined;
    date: string;
    resourceId: string;
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
    actorId: string;
    start: number;
    end: number;
}, Promise<import("convex/values").GenericId<"bookings">>>;
export declare const createBooking: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    timezone: string;
    resourceId: string;
    eventTypeId: string;
    start: number;
    end: number;
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
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
}>>;
export declare const createProvisionalBooking: import("convex/server").RegisteredMutation<"public", {
    timezone: string;
    resourceId: string;
    eventTypeId: string;
    start: number;
    end: number;
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
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
}>>;
export declare const getBooking: import("convex/server").RegisteredQuery<"public", {
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
} | null>>;
export declare const cancelReservation: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    reservationId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
    alreadyCancelled: boolean;
}>>;
export declare const expireProvisionalBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
    reason?: undefined;
} | {
    success: boolean;
    reason: string;
}>>;
export declare const createEventType: import("convex/server").RegisteredMutation<"public", {
    organizationId?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    scheduleId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    id: string;
    timezone: string;
    slug: string;
    title: string;
    lengthInMinutes: number;
    lockTimeZoneToggle: boolean;
    locations: {
        address?: string | undefined;
        public?: boolean | undefined;
        type: string;
    }[];
}, Promise<import("convex/values").GenericId<"event_types">>>;
export declare const listEventTypes: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    activeOnly?: boolean | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    organizationId?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    id: string;
    timezone: string;
    slug: string;
    title: string;
    lengthInMinutes: number;
    lockTimeZoneToggle: boolean;
    locations: {
        address?: string | undefined;
        public?: boolean | undefined;
        type: string;
    }[];
}[]>>;
export declare const getEventTypeBySlug: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    slug: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
    organizationId?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    createdAt?: number | undefined;
    updatedAt?: number | undefined;
    scheduleId?: string | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    bufferBefore?: number | undefined;
    bufferAfter?: number | undefined;
    minNoticeMinutes?: number | undefined;
    maxFutureMinutes?: number | undefined;
    requiresConfirmation?: boolean | undefined;
    id: string;
    timezone: string;
    slug: string;
    title: string;
    lengthInMinutes: number;
    lockTimeZoneToggle: boolean;
    locations: {
        address?: string | undefined;
        public?: boolean | undefined;
        type: string;
    }[];
} | null>>;
export declare const updateEventType: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    timezone?: string | undefined;
    isActive?: boolean | undefined;
    scheduleId?: string | undefined;
    slug?: string | undefined;
    title?: string | undefined;
    lengthInMinutes?: number | undefined;
    lengthInMinutesOptions?: number[] | undefined;
    slotInterval?: number | undefined;
    lockTimeZoneToggle?: boolean | undefined;
    locations?: {
        address?: string | undefined;
        public?: boolean | undefined;
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
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
} | null>>;
/**
 * Lists bookings, newest `start` first, hiding provisional reservations
 * unless `status` asks for them.
 *
 * Pass `organizationId` or `resourceId`: those branches read the
 * `by_org_start` / `by_resource_start` indexes, so `dateFrom` / `dateTo`
 * narrow the index range itself and the scan is proportional to the window.
 * The `eventTypeId` branch uses `by_event_type` and range-filters in JS.
 *
 * With no selector at all the scan is bounded: only the 1000 most recently
 * *created* bookings are considered (then filtered, sorted and limited). That
 * branch is meant for small deployments, admin tooling and tests; a large
 * host should always pass a selector.
 */
export declare const listBookings: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    resourceId?: string | undefined;
    eventTypeId?: string | undefined;
    status?: string | undefined;
    dateFrom?: number | undefined;
    dateTo?: number | undefined;
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
}[]>>;
export declare const getBookingByToken: import("convex/server").RegisteredQuery<"public", {
    uid: string;
    token: string;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
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
    bookingId: import("convex/values").GenericId<"bookings">;
    newStart: number;
    newEnd: number;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
}>>;
export declare const rescheduleBookingByToken: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    uid: string;
    newStart: number;
    newEnd: number;
    token: string;
}, Promise<{
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    timezone: string;
    createdAt: number;
    updatedAt: number;
    resourceId: string;
    eventTypeId: string;
    actorId: string;
    start: number;
    end: number;
    status: string;
    uid: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    location: {
        value?: string | undefined;
        type: string;
    };
}>>;
//# sourceMappingURL=public.d.ts.map