declare const _default: import("convex/server").SchemaDefinition<{
    resources: import("convex/server").TableDefinition<import("convex/values").VObject<{
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
        isActive: import("convex/values").VBoolean<boolean, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "id" | "type" | "organizationId" | "description" | "timezone" | "isActive" | "name" | "quantity" | "isFungible" | "isStandalone" | "createdAt" | "updatedAt">, {
        by_external_id: ["id", "_creationTime"];
        by_org: ["organizationId", "_creationTime"];
        by_org_type: ["organizationId", "type", "_creationTime"];
    }, {}, {}>;
    schedules: import("convex/server").TableDefinition<import("convex/values").VObject<{
        id: string;
        organizationId: string;
        timezone: string;
        name: string;
        isDefault: boolean;
        weeklyHours: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }[];
        createdAt: number;
        updatedAt: number;
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
    }, "required", "id" | "organizationId" | "timezone" | "name" | "isDefault" | "weeklyHours" | "createdAt" | "updatedAt">, {
        by_external_id: ["id", "_creationTime"];
        by_org: ["organizationId", "_creationTime"];
    }, {}, {}>;
    date_overrides: import("convex/server").TableDefinition<import("convex/values").VObject<{
        customHours?: {
            startTime: string;
            endTime: string;
        }[] | undefined;
        type: string;
        scheduleId: import("convex/values").GenericId<"schedules">;
        date: string;
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
    }, "required", "type" | "scheduleId" | "date" | "customHours">, {
        by_schedule_date: ["scheduleId", "date", "_creationTime"];
    }, {}, {}>;
    event_types: import("convex/server").TableDefinition<import("convex/values").VObject<{
        organizationId?: string | undefined;
        lengthInMinutesOptions?: number[] | undefined;
        slotInterval?: number | undefined;
        description?: string | undefined;
        scheduleId?: string | undefined;
        bufferBefore?: number | undefined;
        bufferAfter?: number | undefined;
        minNoticeMinutes?: number | undefined;
        maxFutureMinutes?: number | undefined;
        requiresConfirmation?: boolean | undefined;
        isActive?: boolean | undefined;
        createdAt?: number | undefined;
        updatedAt?: number | undefined;
        id: string;
        slug: string;
        title: string;
        lengthInMinutes: number;
        timezone: string;
        lockTimeZoneToggle: boolean;
        locations: {
            public?: boolean | undefined;
            address?: string | undefined;
            type: string;
        }[];
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
    }, "required", "id" | "slug" | "organizationId" | "title" | "lengthInMinutes" | "lengthInMinutesOptions" | "slotInterval" | "description" | "timezone" | "lockTimeZoneToggle" | "locations" | "scheduleId" | "bufferBefore" | "bufferAfter" | "minNoticeMinutes" | "maxFutureMinutes" | "requiresConfirmation" | "isActive" | "createdAt" | "updatedAt">, {
        by_external_id: ["id", "_creationTime"];
        by_slug: ["slug", "_creationTime"];
        by_org: ["organizationId", "_creationTime"];
    }, {}, {}>;
    resource_event_types: import("convex/server").TableDefinition<import("convex/values").VObject<{
        eventTypeId: string;
        resourceId: string;
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        eventTypeId: import("convex/values").VString<string, "required">;
    }, "required", "eventTypeId" | "resourceId">, {
        by_resource: ["resourceId", "_creationTime"];
        by_event_type: ["eventTypeId", "_creationTime"];
    }, {}, {}>;
    daily_availability: import("convex/server").TableDefinition<import("convex/values").VObject<{
        resourceId: string;
        date: string;
        busySlots: number[];
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        date: import("convex/values").VString<string, "required">;
        busySlots: import("convex/values").VArray<number[], import("convex/values").VFloat64<number, "required">, "required">;
    }, "required", "resourceId" | "date" | "busySlots">, {
        by_resource_date: ["resourceId", "date", "_creationTime"];
    }, {}, {}>;
    quantity_availability: import("convex/server").TableDefinition<import("convex/values").VObject<{
        resourceId: string;
        date: string;
        slotQuantities: any;
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        date: import("convex/values").VString<string, "required">;
        slotQuantities: import("convex/values").VAny<any, "required", string>;
    }, "required", "resourceId" | "date" | "slotQuantities" | `slotQuantities.${string}`>, {
        by_resource_date: ["resourceId", "date", "_creationTime"];
    }, {}, {}>;
    bookings: import("convex/server").TableDefinition<import("convex/values").VObject<{
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
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        actorId: import("convex/values").VString<string, "required">;
        start: import("convex/values").VFloat64<number, "required">;
        end: import("convex/values").VFloat64<number, "required">;
        status: import("convex/values").VString<string, "required">;
        uid: import("convex/values").VString<string, "required">;
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
    }, "required", "eventTypeId" | "organizationId" | "timezone" | "resourceId" | "start" | "end" | "actorId" | "location" | "uid" | "status" | "createdAt" | "updatedAt" | "bookerName" | "bookerEmail" | "bookerPhone" | "bookerNotes" | "eventTitle" | "eventDescription" | "cancelledAt" | "rescheduleUid" | "cancellationReason" | "location.type" | "location.value">, {
        by_resource: ["resourceId", "_creationTime"];
        by_uid: ["uid", "_creationTime"];
        by_email: ["bookerEmail", "_creationTime"];
        by_org: ["organizationId", "_creationTime"];
        by_org_status: ["organizationId", "status", "_creationTime"];
        by_event_type: ["eventTypeId", "_creationTime"];
    }, {}, {}>;
    booking_items: import("convex/server").TableDefinition<import("convex/values").VObject<{
        resourceId: string;
        bookingId: import("convex/values").GenericId<"bookings">;
        quantity: number;
    }, {
        bookingId: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
        resourceId: import("convex/values").VString<string, "required">;
        quantity: import("convex/values").VFloat64<number, "required">;
    }, "required", "resourceId" | "bookingId" | "quantity">, {
        by_booking: ["bookingId", "_creationTime"];
    }, {}, {}>;
    booking_history: import("convex/server").TableDefinition<import("convex/values").VObject<{
        reason?: string | undefined;
        changedBy?: string | undefined;
        bookingId: import("convex/values").GenericId<"bookings">;
        toStatus: string;
        fromStatus: string;
        timestamp: number;
    }, {
        bookingId: import("convex/values").VId<import("convex/values").GenericId<"bookings">, "required">;
        fromStatus: import("convex/values").VString<string, "required">;
        toStatus: import("convex/values").VString<string, "required">;
        changedBy: import("convex/values").VString<string | undefined, "optional">;
        reason: import("convex/values").VString<string | undefined, "optional">;
        timestamp: import("convex/values").VFloat64<number, "required">;
    }, "required", "bookingId" | "reason" | "toStatus" | "changedBy" | "fromStatus" | "timestamp">, {
        by_booking: ["bookingId", "_creationTime"];
    }, {}, {}>;
    presence: import("convex/server").TableDefinition<import("convex/values").VObject<{
        eventTypeId?: string | undefined;
        data?: any;
        resourceId: string;
        user: string;
        slot: string;
        updated: number;
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        user: import("convex/values").VString<string, "required">;
        slot: import("convex/values").VString<string, "required">;
        eventTypeId: import("convex/values").VString<string | undefined, "optional">;
        updated: import("convex/values").VFloat64<number, "required">;
        data: import("convex/values").VAny<any, "optional", string>;
    }, "required", "eventTypeId" | "resourceId" | "user" | "data" | "slot" | "updated" | `data.${string}`>, {
        by_resource_slot_updated: ["resourceId", "slot", "updated", "_creationTime"];
        by_user_slot: ["user", "slot", "_creationTime"];
        by_event_type: ["eventTypeId", "_creationTime"];
    }, {}, {}>;
    presence_heartbeats: import("convex/server").TableDefinition<import("convex/values").VObject<{
        resourceId: string;
        user: string;
        slot: string;
        markAsGone: import("convex/values").GenericId<"_scheduled_functions">;
    }, {
        resourceId: import("convex/values").VString<string, "required">;
        user: import("convex/values").VString<string, "required">;
        slot: import("convex/values").VString<string, "required">;
        markAsGone: import("convex/values").VId<import("convex/values").GenericId<"_scheduled_functions">, "required">;
    }, "required", "resourceId" | "user" | "slot" | "markAsGone">, {
        by_user_slot: ["user", "slot", "_creationTime"];
    }, {}, {}>;
    hooks: import("convex/server").TableDefinition<import("convex/values").VObject<{
        organizationId?: string | undefined;
        eventType: string;
        functionHandle: string;
        createdAt: number;
        enabled: boolean;
    }, {
        eventType: import("convex/values").VString<string, "required">;
        functionHandle: import("convex/values").VString<string, "required">;
        organizationId: import("convex/values").VString<string | undefined, "optional">;
        enabled: import("convex/values").VBoolean<boolean, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "organizationId" | "eventType" | "functionHandle" | "createdAt" | "enabled">, {
        by_event: ["eventType", "enabled", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map