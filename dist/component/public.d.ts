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
 * - dateFrom/dateTo are calendar dates ("2025-06-17"; "2025-6-17" is read as
 *   the same day). With a schedule they are the schedule's local days;
 *   without one, UTC days.
 * - With scheduleId, the schedule's hours are read in its own timezone, or in
 *   resourceTimezone when given (a mismatch is logged). A schedule stored
 *   with a zone Intl rejects is read as before 0.4.3, its hours as UTC
 *   (logged), unless resourceTimezone is given.
 * - Without scheduleId, the legacy 09:00–17:00 UTC window applies.
 *
 * Rejects an eventLength that is not a positive number, impossible dates and
 * dateFrom after dateTo.
 */
export declare const getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
    scheduleId?: string | undefined;
    slotInterval?: number | undefined;
    excludeBookingUid?: string | undefined;
    resourceTimezone?: string | undefined;
    resourceId: string;
    eventLength: number;
    dateFrom: string;
    dateTo: string;
}, Promise<Record<string, boolean>>>;
/**
 * Gets detailed slots for a SINGLE day
 * Used for day view / slot picker
 *
 * TIMEZONE HANDLING:
 * - date is a calendar date ("2025-06-17"; "2025-6-17" is read as the same day)
 * - availableSlots (local slot indices from a schedule) together with
 *   resourceTimezone generate the slots in that timezone
 * - scheduleId (optional) supplies what is missing: the schedule's effective
 *   hours for `date` when availableSlots is omitted, and the schedule's own
 *   timezone when resourceTimezone is omitted (a mismatch is logged).
 *   `{ scheduleId }` alone equals getEffectiveAvailability followed by this
 *   query with availableSlots and the schedule's timezone. A schedule stored
 *   with a zone Intl rejects supplies no zone (logged).
 * - Otherwise the legacy 09:00–17:00 UTC window applies.
 *
 * Rejects an eventLength that is not a positive number, impossible dates and
 * availableSlots outside 0–95.
 */
export declare const getDaySlots: import("convex/server").RegisteredQuery<"public", {
    scheduleId?: string | undefined;
    slotInterval?: number | undefined;
    availableSlots?: number[] | undefined;
    excludeBookingUid?: string | undefined;
    resourceTimezone?: string | undefined;
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
        renderer?: string | undefined;
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
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}>>;
export declare const createProvisionalBooking: import("convex/server").RegisteredMutation<"public", {
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
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}>>;
/**
 * The whole booking document, `managementToken` and booker contact details
 * included. The token lets its holder cancel and reschedule the booking, so a
 * host must not pass this result to a caller that only knows the id.
 */
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
export declare const cancelReservation: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    cancelledBy?: string | undefined;
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
/**
 * The whole booking document, `managementToken` and booker contact details
 * included. Knowing a uid must not be enough to obtain the token: a host that
 * serves this to browsers removes the token (and details the caller may not
 * see) unless the caller already proved ownership.
 */
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
/**
 * Lists bookings, newest `start` first, hiding provisional reservations
 * unless `status` asks for them.
 *
 * Pass `organizationId`, `resourceId` or `eventTypeId` (tried in that order):
 * the branch reads the `by_org_start` / `by_resource_start` /
 * `by_eventTypeId_and_start` index, so `dateFrom` / `dateTo` narrow the index
 * range itself and the scan is proportional to the window. With a positive
 * integer `limit` the scan also stops once `limit` bookings match, so it reads
 * the limit plus the rows the other filters skip (for `eventTypeId`, plus the
 * rest of the bookings sharing the last one's `start`). Without a limit it
 * reads the whole range. Other `limit` values keep their earlier meaning (0: no
 * limit). Bookings with equal `start` come newest-created first, except in
 * the `eventTypeId` branch, where they come oldest-created first.
 *
 * `resourceId` matches a booking's primary resource: a bundle is listed under
 * its first resource only, not under its other items (pools included).
 *
 * Bookings are returned whole, `managementToken` included (see getBookingByUid).
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
    limit?: number | undefined;
    dateFrom?: number | undefined;
    dateTo?: number | undefined;
    status?: string | undefined;
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
export declare const getBookingByToken: import("convex/server").RegisteredQuery<"public", {
    token: string;
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}>>;
export declare const cancelBookingByToken: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    token: string;
    uid: string;
}, Promise<{
    success: boolean;
}>>;
export declare const rescheduleBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    changedBy?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
    newEnd: number;
    newStart: number;
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}>>;
export declare const rescheduleBookingByToken: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    token: string;
    uid: string;
    newEnd: number;
    newStart: number;
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
    rescheduledToUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    eventTypeId: string;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
}>>;
//# sourceMappingURL=public.d.ts.map