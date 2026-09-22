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
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            type: string;
            id: string;
            organizationId: string;
            timezone: string;
            isActive: boolean;
            name: string;
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
export declare const cancelMultiResourceBooking: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    resendOptions?: {
        fromEmail?: string | undefined;
        baseUrl?: string | undefined;
        renderer?: string | undefined;
        apiKey: string;
    } | undefined;
    cancelledBy?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=multi_resource.d.ts.map