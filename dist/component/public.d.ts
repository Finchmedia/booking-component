/**
 * The event type with this ID, or null when there is none (like getResource
 * and the getBooking* queries). Until 0.5.0 a missing ID threw
 * EVENT_TYPE_NOT_FOUND "Event type not found: <id>".
 */
export declare const getEventType: import("convex/server").RegisteredQuery<"public", {
    eventTypeId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
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
/**
 * Whether [start, end) is free on a resource that is booked by time slot.
 * Ranges longer than 366 days throw INVALID_RANGE (0.5.0); booking writes
 * have no such cap.
 */
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
 * - With scheduleId, the schedule's hours are read in its own timezone;
 *   resourceTimezone may be omitted and must otherwise equal it. A schedule
 *   stored with a zone Intl rejects has its hours read as UTC, or in a given
 *   resourceTimezone (logged).
 * - Without scheduleId and resourceTimezone, the legacy 09:00–17:00 UTC
 *   window applies.
 *
 * RESCHEDULING: `rescheduleContext` ({ uid, token } of the booking being
 * moved) treats that booking's own slots as free when the token matches a
 * pending or confirmed booking that holds this resource (as its resource or
 * as any item of a bundle), and is ignored otherwise.
 * `excludeBookingUid` does the same without a token and is for trusted host
 * code only: never forward it from a client, which could free any booking
 * whose uid it knows. Passing both throws.
 *
 * Rejects an eventLength that is not a positive number, impossible dates,
 * dateFrom after dateTo, a range of more than 93 days (MAX_MONTH_RANGE_DAYS,
 * both ends included), resourceTimezone without scheduleId, a
 * resourceTimezone that differs from the schedule's, an unknown
 * scheduleId (see resolveScheduleArgs) and both reschedule arguments at once.
 */
export declare const getMonthAvailability: import("convex/server").RegisteredQuery<"public", {
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
 *   timezone (a given resourceTimezone must equal it).
 *   `{ scheduleId }` alone equals getEffectiveAvailability followed by this
 *   query with availableSlots and the schedule's timezone. A schedule stored
 *   with a zone Intl rejects has its hours read as UTC, or in a given
 *   resourceTimezone (logged).
 * - Without any of the three, the legacy 09:00–17:00 UTC window applies.
 *
 * RESCHEDULING: `rescheduleContext` and `excludeBookingUid` as in
 * getMonthAvailability (the token-checked context for client input,
 * `excludeBookingUid` for trusted host code only).
 *
 * Rejects an eventLength that is not a positive number, impossible dates,
 * availableSlots outside 0–95, a partial shape (resourceTimezone or
 * availableSlots alone), a resourceTimezone that differs from the
 * schedule's, an unknown scheduleId (see resolveScheduleArgs) and both
 * reschedule arguments at once.
 */
export declare const getDaySlots: import("convex/server").RegisteredQuery<"public", {
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
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
/**
 * Creates an event type, or updates the one with this `id` (keeping what it
 * is not given). Lengths, length options and the slot interval must be whole
 * minutes greater than 0, buffers and notice 0 or more, the horizon greater
 * than 0, and the length one of the options when there are any, counting
 * the stored options an upsert keeps (INVALID_INPUT). The ID "legacy" is
 * reserved for createReservation bookings (INVALID_INPUT), also for an
 * upsert of an event type stored with it before 0.5.0; updateEventType
 * still changes that one.
 */
export declare const createEventType: import("convex/server").RegisteredMutation<"public", {
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
}, Promise<import("convex/values").GenericId<"event_types">>>;
export declare const listEventTypes: import("convex/server").RegisteredQuery<"public", {
    organizationId?: string | undefined;
    activeOnly?: boolean | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"event_types">;
    _creationTime: number;
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
/**
 * Changes the fields it is given and keeps every omitted one. `null` removes
 * `description`, `scheduleId`, `bufferBefore`, `bufferAfter`,
 * `minNoticeMinutes` or `maxFutureMinutes` (N25).
 *
 * The given settings are checked as in createEventType: lengths, length
 * options and the slot interval are whole minutes greater than 0, buffers and
 * notice 0 or more, the horizon greater than 0 (INVALID_INPUT). An update
 * that gives `lengthInMinutes` or `lengthInMinutesOptions` must leave a
 * length that is one of the options (when there are any), counting the
 * stored value of the field it omits. Other updates of an event type stored
 * before 0.5.0 that breaks these rules still work.
 */
export declare const updateEventType: import("convex/server").RegisteredMutation<"public", {
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
/**
 * Lists bookings, newest `start` first, hiding provisional reservations
 * unless `status` asks for them.
 *
 * Pass `organizationId`, `resourceId` or `eventTypeId` (tried in that order):
 * the branch reads the `by_organizationId_and_start` /
 * `by_resourceId_and_start` / `by_eventTypeId_and_start` index, so
 * `dateFrom` / `dateTo` narrow the index range itself and the scan is
 * proportional to the window. With a `limit` the scan also stops once `limit`
 * bookings match, so it reads the limit plus the rows the other filters skip
 * (for `eventTypeId`, plus the rest of the bookings sharing the last one's
 * `start`). Without a limit it reads the whole range; listBookingsPage pages
 * through a range instead. `limit` must be a positive integer (0.5.0;
 * INVALID_INPUT otherwise, where 0.4.x read 0 as no limit). Bookings with
 * equal `start` come newest-created first, except in the `eventTypeId`
 * branch, where they come oldest-created first.
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
    status?: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed" | undefined;
    limit?: number | undefined;
    dateFrom?: number | undefined;
    dateTo?: number | undefined;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
/**
 * Pages through the bookings of one organization, resource or event type
 * (exactly one of `organizationId`, `resourceId`, `eventTypeId`), newest
 * `start` first, bookings with equal `start` newest-created first.
 * `dateFrom` / `dateTo` narrow `start` (inclusive), `status` keeps one
 * status; without `status`, provisional holds are left out unless
 * `includeProvisional`. As in listBookings, `resourceId` matches a booking's
 * primary resource only, and bookings are returned whole, `managementToken`
 * included.
 *
 * Built on the convex-helpers paginator (component functions cannot use
 * `.paginate()`): `continueCursor` is the complete index key of the last row
 * read, so bookings with equal `start` (and equal creation times) are neither
 * skipped nor repeated across pages. A page reads at most 1,000 rows,
 * filtered ones included (`paginationOpts.maximumRowsRead` may lower that),
 * so with a status filter a page can hold fewer than `numItems` bookings, or
 * none, while `isDone` is false: continue with `continueCursor`. For
 * reactive paging from a host query, use `usePaginatedQuery` from
 * `convex-helpers/react`, which passes `endCursor` and splits pages at
 * `splitCursor`. `numItems` must be a positive integer; a cursor issued for
 * another selector is rejected (INVALID_INPUT).
 */
export declare const listBookingsPage: import("convex/server").RegisteredQuery<"public", {
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
}, Promise<import("convex/server").PaginationResult<{
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
    createdAt: number;
    updatedAt: number;
}>>>;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
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
    status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
    uid: string;
    actorId: string;
    createdAt: number;
    updatedAt: number;
}>>;
//# sourceMappingURL=public.d.ts.map