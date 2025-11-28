export declare const getSchedule: import("convex/server").RegisteredQuery<"public", {
    id: string;
}, Promise<{
    _id: import("convex/values").GenericId<"schedules">;
    _creationTime: number;
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
} | null>>;
export declare const getScheduleById: import("convex/server").RegisteredQuery<"public", {
    scheduleId: import("convex/values").GenericId<"schedules">;
}, Promise<{
    _id: import("convex/values").GenericId<"schedules">;
    _creationTime: number;
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
} | null>>;
export declare const listSchedules: import("convex/server").RegisteredQuery<"public", {
    organizationId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"schedules">;
    _creationTime: number;
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
}[]>>;
export declare const getDefaultSchedule: import("convex/server").RegisteredQuery<"public", {
    organizationId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"schedules">;
    _creationTime: number;
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
}>>;
export declare const createSchedule: import("convex/server").RegisteredMutation<"public", {
    isDefault?: boolean | undefined;
    id: string;
    organizationId: string;
    timezone: string;
    name: string;
    weeklyHours: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }[];
}, Promise<import("convex/values").GenericId<"schedules">>>;
export declare const updateSchedule: import("convex/server").RegisteredMutation<"public", {
    timezone?: string | undefined;
    name?: string | undefined;
    isDefault?: boolean | undefined;
    weeklyHours?: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }[] | undefined;
    id: string;
}, Promise<import("convex/values").GenericId<"schedules">>>;
export declare const deleteSchedule: import("convex/server").RegisteredMutation<"public", {
    id: string;
}, Promise<{
    success: boolean;
}>>;
export declare const listDateOverrides: import("convex/server").RegisteredQuery<"public", {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    scheduleId: import("convex/values").GenericId<"schedules">;
}, Promise<{
    _id: import("convex/values").GenericId<"date_overrides">;
    _creationTime: number;
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    type: string;
    scheduleId: import("convex/values").GenericId<"schedules">;
    date: string;
}[]>>;
export declare const getDateOverride: import("convex/server").RegisteredQuery<"public", {
    scheduleId: import("convex/values").GenericId<"schedules">;
    date: string;
}, Promise<{
    _id: import("convex/values").GenericId<"date_overrides">;
    _creationTime: number;
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    type: string;
    scheduleId: import("convex/values").GenericId<"schedules">;
    date: string;
} | null>>;
export declare const createDateOverride: import("convex/server").RegisteredMutation<"public", {
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    type: string;
    scheduleId: import("convex/values").GenericId<"schedules">;
    date: string;
}, Promise<import("convex/values").GenericId<"date_overrides">>>;
export declare const updateDateOverride: import("convex/server").RegisteredMutation<"public", {
    type?: string | undefined;
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    overrideId: import("convex/values").GenericId<"date_overrides">;
}, Promise<import("convex/values").GenericId<"date_overrides">>>;
export declare const deleteDateOverride: import("convex/server").RegisteredMutation<"public", {
    overrideId: import("convex/values").GenericId<"date_overrides">;
}, Promise<{
    success: boolean;
}>>;
/**
 * Get the effective available slots for a resource on a specific date.
 * This considers the schedule's weekly hours and any date overrides.
 */
export declare const getEffectiveAvailability: import("convex/server").RegisteredQuery<"public", {
    scheduleId: string;
    date: string;
}, Promise<{
    availableSlots: number[];
}>>;
//# sourceMappingURL=schedules.d.ts.map