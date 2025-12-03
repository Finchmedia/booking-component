export declare const checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"public", {
    start: number;
    end: number;
    resources: {
        quantity?: number | undefined;
        resourceId: string;
    }[];
}, Promise<{
    available: boolean;
    resources: {
        resourceId: string;
        available: boolean;
        requestedQuantity: number;
        availableQuantity: number;
        conflicts: number[];
    }[];
}>>;
export declare const createMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
    organizationId?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        apiKey: string;
    } | undefined;
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
    eventTypeId: string;
    timezone: string;
    resourceId: string;
    start: number;
    end: number;
    actorId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const getBookingWithItems: import("convex/server").RegisteredQuery<"public", {
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    items: {
        resource: {
            _id: import("convex/values").GenericId<"resources">;
            _creationTime: number;
            description?: string | undefined;
            quantity?: number | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            id: string;
            type: string;
            organizationId: string;
            timezone: string;
            isActive: boolean;
            name: string;
            createdAt: number;
            updatedAt: number;
        } | null;
        _id: import("convex/values").GenericId<"booking_items">;
        _creationTime: number;
        resourceId: string;
        bookingId: import("convex/values").GenericId<"bookings">;
        quantity: number;
    }[];
    _id: import("convex/values").GenericId<"bookings">;
    _creationTime: number;
    organizationId?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    eventTypeId: string;
    timezone: string;
    resourceId: string;
    start: number;
    end: number;
    actorId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    uid: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
} | null>>;
export declare const cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
    resendOptions?: {
        fromEmail?: string | undefined;
        apiKey: string;
    } | undefined;
    reason?: string | undefined;
    cancelledBy?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=multi_resource.d.ts.map