export declare const checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"public", {
    resources: {
        quantity?: number | undefined;
        resourceId: string;
    }[];
    start: number;
    end: number;
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
    location?: {
        value?: string | undefined;
        type: string;
    } | undefined;
    timezone: string;
    resources: {
        quantity?: number | undefined;
        resourceId: string;
    }[];
    eventTypeId: string;
    start: number;
    end: number;
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
            organizationId: string;
            name: string;
            timezone: string;
            isActive: boolean;
            createdAt: number;
            updatedAt: number;
            type: string;
        } | null;
        _id: import("convex/values").GenericId<"booking_items">;
        _creationTime: number;
        quantity: number;
        resourceId: string;
        bookingId: import("convex/values").GenericId<"bookings">;
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
export declare const cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    cancelledBy?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=multi_resource.d.ts.map