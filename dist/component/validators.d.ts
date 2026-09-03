export declare const resourceDoc: import("convex/values").VObject<{
    description?: string | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    metadata?: Record<string, string> | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
    createdAt: number;
    updatedAt: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"resources">;
}, {
    id: import("convex/values").VString<string, "required">;
    organizationId: import("convex/values").VString<string, "required">;
    name: import("convex/values").VString<string, "required">;
    type: import("convex/values").VString<string, "required">;
    description: import("convex/values").VString<string | undefined, "optional">;
    timezone: import("convex/values").VString<string, "required">;
    quantity: import("convex/values").VFloat64<number | undefined, "optional">;
    isFungible: import("convex/values").VBoolean<boolean | undefined, "optional">;
    isStandalone: import("convex/values").VBoolean<boolean | undefined, "optional">;
    metadata: import("convex/values").VRecord<Record<string, string> | undefined, import("convex/values").VString<string, "required">, import("convex/values").VString<string, "required">, "optional", string>;
    isActive: import("convex/values").VBoolean<boolean, "required">;
    createdAt: import("convex/values").VFloat64<number, "required">;
    updatedAt: import("convex/values").VFloat64<number, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"resources">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "organizationId" | "timezone" | "description" | "id" | "isActive" | "isFungible" | "isStandalone" | "metadata" | "name" | "quantity" | "type" | "createdAt" | "updatedAt" | `metadata.${string}` | "_creationTime" | "_id">;
export declare const scheduleDoc: import("convex/values").VObject<{
    organizationId: string;
    timezone: string;
    id: string;
    name: string;
    isDefault: boolean;
    weeklyHours: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }[];
    createdAt: number;
    updatedAt: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"schedules">;
}, {
    id: import("convex/values").VString<string, "required">;
    organizationId: import("convex/values").VString<string, "required">;
    name: import("convex/values").VString<string, "required">;
    timezone: import("convex/values").VString<string, "required">;
    isDefault: import("convex/values").VBoolean<boolean, "required">;
    weeklyHours: import("convex/values").VArray<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }[], import("convex/values").VObject<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }, {
        dayOfWeek: import("convex/values").VFloat64<number, "required">;
        startTime: import("convex/values").VString<string, "required">;
        endTime: import("convex/values").VString<string, "required">;
    }, "required", "dayOfWeek" | "startTime" | "endTime">, "required">;
    createdAt: import("convex/values").VFloat64<number, "required">;
    updatedAt: import("convex/values").VFloat64<number, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"schedules">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "organizationId" | "timezone" | "id" | "name" | "isDefault" | "weeklyHours" | "createdAt" | "updatedAt" | "_creationTime" | "_id">;
export declare const dateOverrideDoc: import("convex/values").VObject<{
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    date: string;
    scheduleId: import("convex/values").GenericId<"schedules">;
    type: string;
    _creationTime: number;
    _id: import("convex/values").GenericId<"date_overrides">;
}, {
    scheduleId: import("convex/values").VId<import("convex/values").GenericId<"schedules">, "required">;
    date: import("convex/values").VString<string, "required">;
    type: import("convex/values").VString<string, "required">;
    customHours: import("convex/values").VArray<{
        startTime: string;
        endTime: string;
    }[] | undefined, import("convex/values").VObject<{
        startTime: string;
        endTime: string;
    }, {
        startTime: import("convex/values").VString<string, "required">;
        endTime: import("convex/values").VString<string, "required">;
    }, "required", "startTime" | "endTime">, "optional">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"date_overrides">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "date" | "scheduleId" | "type" | "customHours" | "_creationTime" | "_id">;
export declare const eventTypeDoc: import("convex/values").VObject<{
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
    _creationTime: number;
    _id: import("convex/values").GenericId<"event_types">;
}, {
    id: import("convex/values").VString<string, "required">;
    slug: import("convex/values").VString<string, "required">;
    title: import("convex/values").VString<string, "required">;
    lengthInMinutes: import("convex/values").VFloat64<number, "required">;
    lengthInMinutesOptions: import("convex/values").VArray<number[] | undefined, import("convex/values").VFloat64<number, "required">, "optional">;
    slotInterval: import("convex/values").VFloat64<number | undefined, "optional">;
    description: import("convex/values").VString<string | undefined, "optional">;
    timezone: import("convex/values").VString<string, "required">;
    lockTimeZoneToggle: import("convex/values").VBoolean<boolean, "required">;
    locations: import("convex/values").VArray<{
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }[], import("convex/values").VObject<{
        public?: boolean | undefined;
        address?: string | undefined;
        type: string;
    }, {
        type: import("convex/values").VString<string, "required">;
        address: import("convex/values").VString<string | undefined, "optional">;
        public: import("convex/values").VBoolean<boolean | undefined, "optional">;
    }, "required", "public" | "type" | "address">, "required">;
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    scheduleId: import("convex/values").VString<string | undefined, "optional">;
    bufferBefore: import("convex/values").VFloat64<number | undefined, "optional">;
    bufferAfter: import("convex/values").VFloat64<number | undefined, "optional">;
    minNoticeMinutes: import("convex/values").VFloat64<number | undefined, "optional">;
    maxFutureMinutes: import("convex/values").VFloat64<number | undefined, "optional">;
    requiresConfirmation: import("convex/values").VBoolean<boolean | undefined, "optional">;
    isActive: import("convex/values").VBoolean<boolean | undefined, "optional">;
    createdAt: import("convex/values").VFloat64<number | undefined, "optional">;
    updatedAt: import("convex/values").VFloat64<number | undefined, "optional">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"event_types">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "organizationId" | "timezone" | "bufferAfter" | "bufferBefore" | "description" | "id" | "isActive" | "lengthInMinutes" | "lengthInMinutesOptions" | "locations" | "lockTimeZoneToggle" | "maxFutureMinutes" | "minNoticeMinutes" | "requiresConfirmation" | "scheduleId" | "slotInterval" | "slug" | "title" | "createdAt" | "updatedAt" | "_creationTime" | "_id">;
export declare const resourceEventTypeDoc: import("convex/values").VObject<{
    resourceId: string;
    eventTypeId: string;
    _creationTime: number;
    _id: import("convex/values").GenericId<"resource_event_types">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    eventTypeId: import("convex/values").VString<string, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"resource_event_types">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "resourceId" | "eventTypeId" | "_creationTime" | "_id">;
export declare const dailyAvailabilityDoc: import("convex/values").VObject<{
    date: string;
    resourceId: string;
    busySlots: number[];
    _creationTime: number;
    _id: import("convex/values").GenericId<"daily_availability">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    date: import("convex/values").VString<string, "required">;
    busySlots: import("convex/values").VArray<number[], import("convex/values").VFloat64<number, "required">, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"daily_availability">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "date" | "resourceId" | "_creationTime" | "busySlots" | "_id">;
export declare const quantityAvailabilityDoc: import("convex/values").VObject<{
    date: string;
    resourceId: string;
    slotQuantities: any;
    _creationTime: number;
    _id: import("convex/values").GenericId<"quantity_availability">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    date: import("convex/values").VString<string, "required">;
    slotQuantities: import("convex/values").VAny<any, "required", string>;
    _id: import("convex/values").VId<import("convex/values").GenericId<"quantity_availability">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "date" | "resourceId" | "_creationTime" | "slotQuantities" | `slotQuantities.${string}` | "_id">;
export declare const bookingDoc: import("convex/values").VObject<{
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    _creationTime: number;
    _id: import("convex/values").GenericId<"bookings">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    actorId: import("convex/values").VString<string, "required">;
    start: import("convex/values").VFloat64<number, "required">;
    end: import("convex/values").VFloat64<number, "required">;
    status: import("convex/values").VString<string, "required">;
    uid: import("convex/values").VString<string, "required">;
    managementToken: import("convex/values").VString<string | undefined, "optional">;
    eventTypeId: import("convex/values").VString<string, "required">;
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    timezone: import("convex/values").VString<string, "required">;
    bookerName: import("convex/values").VString<string, "required">;
    bookerEmail: import("convex/values").VString<string, "required">;
    bookerPhone: import("convex/values").VString<string | undefined, "optional">;
    bookerNotes: import("convex/values").VString<string | undefined, "optional">;
    eventTitle: import("convex/values").VString<string, "required">;
    eventDescription: import("convex/values").VString<string | undefined, "optional">;
    location: import("convex/values").VObject<{
        value?: string | undefined;
        type: string;
    }, {
        type: import("convex/values").VString<string, "required">;
        value: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "type" | "value">;
    createdAt: import("convex/values").VFloat64<number, "required">;
    updatedAt: import("convex/values").VFloat64<number, "required">;
    cancelledAt: import("convex/values").VFloat64<number | undefined, "optional">;
    rescheduleUid: import("convex/values").VString<string | undefined, "optional">;
    cancellationReason: import("convex/values").VString<string | undefined, "optional">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "organizationId" | "resourceId" | "end" | "start" | "eventTypeId" | "location" | "timezone" | "uid" | "actorId" | "status" | "createdAt" | "updatedAt" | "_creationTime" | "managementToken" | "bookerName" | "bookerEmail" | "bookerPhone" | "bookerNotes" | "eventTitle" | "eventDescription" | "cancelledAt" | "rescheduleUid" | "cancellationReason" | "location.type" | "location.value" | "_id">;
export declare const bookingItemDoc: import("convex/values").VObject<{
    bookingId: import("convex/values").GenericId<"bookings">;
    resourceId: string;
    quantity: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"booking_items">;
}, {
    bookingId: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
    resourceId: import("convex/values").VString<string, "required">;
    quantity: import("convex/values").VFloat64<number, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"booking_items">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "bookingId" | "resourceId" | "quantity" | "_creationTime" | "_id">;
export declare const bookingHistoryDoc: import("convex/values").VObject<{
    changedBy?: string | undefined;
    reason?: string | undefined;
    bookingId: import("convex/values").GenericId<"bookings">;
    toStatus: string;
    fromStatus: string;
    timestamp: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"booking_history">;
}, {
    bookingId: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
    fromStatus: import("convex/values").VString<string, "required">;
    toStatus: import("convex/values").VString<string, "required">;
    changedBy: import("convex/values").VString<string | undefined, "optional">;
    reason: import("convex/values").VString<string | undefined, "optional">;
    timestamp: import("convex/values").VFloat64<number, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"booking_history">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "bookingId" | "changedBy" | "reason" | "toStatus" | "_creationTime" | "fromStatus" | "timestamp" | "_id">;
export declare const presenceDoc: import("convex/values").VObject<{
    eventTypeId?: string | undefined;
    data?: any;
    resourceId: string;
    user: string;
    slot: string;
    updated: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"presence">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    user: import("convex/values").VString<string, "required">;
    slot: import("convex/values").VString<string, "required">;
    eventTypeId: import("convex/values").VString<string | undefined, "optional">;
    updated: import("convex/values").VFloat64<number, "required">;
    data: import("convex/values").VAny<any, "optional", string>;
    _id: import("convex/values").VId<import("convex/values").GenericId<"presence">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "resourceId" | "eventTypeId" | "data" | "user" | "slot" | "_creationTime" | "updated" | `data.${string}` | "_id">;
export declare const presenceHeartbeatDoc: import("convex/values").VObject<{
    resourceId: string;
    user: string;
    slot: string;
    markAsGone: import("convex/values").GenericId<"_scheduled_functions">;
    _creationTime: number;
    _id: import("convex/values").GenericId<"presence_heartbeats">;
}, {
    resourceId: import("convex/values").VString<string, "required">;
    user: import("convex/values").VString<string, "required">;
    slot: import("convex/values").VString<string, "required">;
    markAsGone: import("convex/values").VId<import("convex/values").GenericId<"_scheduled_functions">, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"presence_heartbeats">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "resourceId" | "user" | "slot" | "_creationTime" | "markAsGone" | "_id">;
export declare const hookDoc: import("convex/values").VObject<{
    organizationId?: string | undefined;
    eventType: string;
    functionHandle: string;
    enabled: boolean;
    createdAt: number;
    _creationTime: number;
    _id: import("convex/values").GenericId<"hooks">;
}, {
    eventType: import("convex/values").VString<string, "required">;
    functionHandle: import("convex/values").VString<string, "required">;
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    enabled: import("convex/values").VBoolean<boolean, "required">;
    createdAt: import("convex/values").VFloat64<number, "required">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"hooks">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
}, "required", "eventType" | "organizationId" | "functionHandle" | "enabled" | "createdAt" | "_creationTime" | "_id">;
/**
 * multi_resource.getBookingWithItems: the booking spread with its items, each
 * item carrying the resolved resource (or null when the resource is gone).
 */
export declare const bookingWithItemsDoc: import("convex/values").VObject<{
    organizationId?: string | undefined;
    managementToken?: string | undefined;
    bookerPhone?: string | undefined;
    bookerNotes?: string | undefined;
    eventDescription?: string | undefined;
    cancelledAt?: number | undefined;
    rescheduleUid?: string | undefined;
    cancellationReason?: string | undefined;
    resourceId: string;
    end: number;
    start: number;
    eventTypeId: string;
    location: {
        value?: string | undefined;
        type: string;
    };
    timezone: string;
    uid: string;
    actorId: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    bookerName: string;
    bookerEmail: string;
    eventTitle: string;
    _creationTime: number;
    _id: import("convex/values").GenericId<"bookings">;
    items: {
        bookingId: import("convex/values").GenericId<"bookings">;
        resourceId: string;
        quantity: number;
        _creationTime: number;
        _id: import("convex/values").GenericId<"booking_items">;
        resource: {
            description?: string | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
            _creationTime: number;
            _id: import("convex/values").GenericId<"resources">;
        } | null;
    }[];
}, {
    resourceId: import("convex/values").VString<string, "required">;
    actorId: import("convex/values").VString<string, "required">;
    start: import("convex/values").VFloat64<number, "required">;
    end: import("convex/values").VFloat64<number, "required">;
    status: import("convex/values").VString<string, "required">;
    uid: import("convex/values").VString<string, "required">;
    managementToken: import("convex/values").VString<string | undefined, "optional">;
    eventTypeId: import("convex/values").VString<string, "required">;
    organizationId: import("convex/values").VString<string | undefined, "optional">;
    timezone: import("convex/values").VString<string, "required">;
    bookerName: import("convex/values").VString<string, "required">;
    bookerEmail: import("convex/values").VString<string, "required">;
    bookerPhone: import("convex/values").VString<string | undefined, "optional">;
    bookerNotes: import("convex/values").VString<string | undefined, "optional">;
    eventTitle: import("convex/values").VString<string, "required">;
    eventDescription: import("convex/values").VString<string | undefined, "optional">;
    location: import("convex/values").VObject<{
        value?: string | undefined;
        type: string;
    }, {
        type: import("convex/values").VString<string, "required">;
        value: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "type" | "value">;
    createdAt: import("convex/values").VFloat64<number, "required">;
    updatedAt: import("convex/values").VFloat64<number, "required">;
    cancelledAt: import("convex/values").VFloat64<number | undefined, "optional">;
    rescheduleUid: import("convex/values").VString<string | undefined, "optional">;
    cancellationReason: import("convex/values").VString<string | undefined, "optional">;
    _id: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
    _creationTime: import("convex/values").VFloat64<number, "required">;
    items: import("convex/values").VArray<{
        bookingId: import("convex/values").GenericId<"bookings">;
        resourceId: string;
        quantity: number;
        _creationTime: number;
        _id: import("convex/values").GenericId<"booking_items">;
        resource: {
            description?: string | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
            _creationTime: number;
            _id: import("convex/values").GenericId<"resources">;
        } | null;
    }[], import("convex/values").VObject<{
        bookingId: import("convex/values").GenericId<"bookings">;
        resourceId: string;
        quantity: number;
        _creationTime: number;
        _id: import("convex/values").GenericId<"booking_items">;
        resource: {
            description?: string | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
            _creationTime: number;
            _id: import("convex/values").GenericId<"resources">;
        } | null;
    }, {
        bookingId: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
        resourceId: import("convex/values").VString<string, "required">;
        quantity: import("convex/values").VFloat64<number, "required">;
        _id: import("convex/values").VId<import("convex/values").GenericId<"booking_items">, "required">;
        _creationTime: import("convex/values").VFloat64<number, "required">;
        resource: import("convex/values").VUnion<{
            description?: string | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
            _creationTime: number;
            _id: import("convex/values").GenericId<"resources">;
        } | null, [import("convex/values").VObject<{
            description?: string | undefined;
            isFungible?: boolean | undefined;
            isStandalone?: boolean | undefined;
            metadata?: Record<string, string> | undefined;
            quantity?: number | undefined;
            organizationId: string;
            timezone: string;
            id: string;
            isActive: boolean;
            name: string;
            type: string;
            createdAt: number;
            updatedAt: number;
            _creationTime: number;
            _id: import("convex/values").GenericId<"resources">;
        }, {
            id: import("convex/values").VString<string, "required">;
            organizationId: import("convex/values").VString<string, "required">;
            name: import("convex/values").VString<string, "required">;
            type: import("convex/values").VString<string, "required">;
            description: import("convex/values").VString<string | undefined, "optional">;
            timezone: import("convex/values").VString<string, "required">;
            quantity: import("convex/values").VFloat64<number | undefined, "optional">;
            isFungible: import("convex/values").VBoolean<boolean | undefined, "optional">;
            isStandalone: import("convex/values").VBoolean<boolean | undefined, "optional">;
            metadata: import("convex/values").VRecord<Record<string, string> | undefined, import("convex/values").VString<string, "required">, import("convex/values").VString<string, "required">, "optional", string>;
            isActive: import("convex/values").VBoolean<boolean, "required">;
            createdAt: import("convex/values").VFloat64<number, "required">;
            updatedAt: import("convex/values").VFloat64<number, "required">;
            _id: import("convex/values").VId<import("convex/values").GenericId<"resources">, "required">;
            _creationTime: import("convex/values").VFloat64<number, "required">;
        }, "required", "organizationId" | "timezone" | "description" | "id" | "isActive" | "isFungible" | "isStandalone" | "metadata" | "name" | "quantity" | "type" | "createdAt" | "updatedAt" | `metadata.${string}` | "_creationTime" | "_id">, import("convex/values").VNull<null, "required">], "required", "organizationId" | "timezone" | "description" | "id" | "isActive" | "isFungible" | "isStandalone" | "metadata" | "name" | "quantity" | "type" | "createdAt" | "updatedAt" | `metadata.${string}` | "_creationTime" | "_id">;
    }, "required", "bookingId" | "resourceId" | "quantity" | "_creationTime" | "_id" | "resource" | "resource.organizationId" | "resource.timezone" | "resource.description" | "resource.id" | "resource.isActive" | "resource.isFungible" | "resource.isStandalone" | "resource.metadata" | "resource.name" | "resource.quantity" | "resource.type" | "resource.createdAt" | "resource.updatedAt" | `resource.metadata.${string}` | "resource._creationTime" | "resource._id">, "required">;
}, "required", "organizationId" | "resourceId" | "end" | "start" | "eventTypeId" | "location" | "timezone" | "uid" | "actorId" | "status" | "createdAt" | "updatedAt" | "_creationTime" | "managementToken" | "bookerName" | "bookerEmail" | "bookerPhone" | "bookerNotes" | "eventTitle" | "eventDescription" | "cancelledAt" | "rescheduleUid" | "cancellationReason" | "location.type" | "location.value" | "_id" | "items">;
/** `{ success }` — delete / unregister / set-links / cancel-by-token style mutations. */
export declare const successResult: import("convex/values").VObject<{
    success: boolean;
}, {
    success: import("convex/values").VBoolean<boolean, "required">;
}, "required", "success">;
/** `{ success, alreadyCancelled }` — cancelReservation (idempotent cancel). */
export declare const cancelResult: import("convex/values").VObject<{
    success: boolean;
    alreadyCancelled: boolean;
}, {
    success: import("convex/values").VBoolean<boolean, "required">;
    alreadyCancelled: import("convex/values").VBoolean<boolean, "required">;
}, "required", "success" | "alreadyCancelled">;
/** `{ success, affectedUsers }` — toggleResourceActive / toggleEventTypeActive. */
export declare const successWithAffectedUsers: import("convex/values").VObject<{
    success: boolean;
    affectedUsers: number;
}, {
    success: import("convex/values").VBoolean<boolean, "required">;
    affectedUsers: import("convex/values").VFloat64<number, "required">;
}, "required", "success" | "affectedUsers">;
/** `{ deleted }` — deleteAllLinksForResource / deleteAllLinksForEventType. */
export declare const deletedCount: import("convex/values").VObject<{
    deleted: number;
}, {
    deleted: import("convex/values").VFloat64<number, "required">;
}, "required", "deleted">;
//# sourceMappingURL=validators.d.ts.map