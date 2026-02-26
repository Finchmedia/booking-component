export declare const checkMultiResourceAvailability: import("convex/server").RegisteredQuery<"public", {
    end: number;
    resources: {
        quantity?: number | undefined;
        resourceId: string;
    }[];
    start: number;
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
        baseUrl?: string | undefined;
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
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    uid: string;
    actorId: string;
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
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
        } | null;
        _id: import("convex/values").GenericId<"booking_items">;
        _creationTime: number;
        bookingId: import("convex/values").GenericId<"bookings">;
        resourceId: string;
        quantity: number;
    }[];
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
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    resourceId: string;
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
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