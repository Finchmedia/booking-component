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
    location?: {
        value?: string | undefined;
        type: string;
    } | undefined;
    organizationId?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
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
            timezone: string;
            id: string;
            name: string;
            organizationId: string;
            isActive: boolean;
            createdAt: number;
            updatedAt: number;
            type: string;
        } | null;
        _id: import("convex/values").GenericId<"booking_items">;
        _creationTime: number;
        resourceId: string;
        quantity: number;
        bookingId: import("convex/values").GenericId<"bookings">;
    }[];
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
export declare const cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        apiKey: string;
    } | undefined;
    cancelledBy?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=multi_resource.d.ts.map