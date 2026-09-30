import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { type CivilDate } from "../shared/time.js";
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
} | null>>;
/**
 * An organization's default schedule: the first one created that is marked
 * default, else its first schedule, else null. At most two indexed reads of
 * one document each, however many schedules the organization has.
 */
export declare function getOrganizationDefaultSchedule(ctx: QueryCtx, organizationId: string): Promise<Doc<"schedules"> | null>;
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
/**
 * Creates the override of a schedule's date, or replaces the one stored for
 * that date. Rejects an impossible date, windows that are malformed or
 * overlap, and "custom" without customHours (INVALID_INPUT); `type` accepts
 * "unavailable" and "custom" only.
 */
export declare const createDateOverride: import("convex/server").RegisteredMutation<"public", {
    customHours?: {
        startTime: string;
        endTime: string;
    }[] | undefined;
    type: "unavailable" | "custom";
    scheduleId: import("convex/values").GenericId<"schedules">;
    date: string;
}, Promise<import("convex/values").GenericId<"date_overrides">>>;
/**
 * Changes an override's type or hours, with the checks of
 * createDateOverride. "custom" without hours is checked on the merged
 * override: a change of either field must leave a "custom" override with at
 * least one window.
 */
export declare const updateDateOverride: import("convex/server").RegisteredMutation<"public", {
    type?: "unavailable" | "custom" | undefined;
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
/** The schedule with this external id, or null. */
export declare function getScheduleByExternalId(ctx: QueryCtx, scheduleId: string): Promise<Doc<"schedules"> | null>;
/**
 * The schedule with this external id; SCHEDULE_NOT_FOUND otherwise. An
 * unknown id used to mean 09:00–17:00 every day, which reopened weekends and
 * closures after a schedule was deleted.
 */
export declare function getExistingSchedule(ctx: QueryCtx, scheduleId: string): Promise<Doc<"schedules">>;
/**
 * Effective LOCAL slot indices (0–95, in the schedule's zone) of a schedule on
 * a calendar day: the date override when one exists, otherwise the weekly
 * hours of that day's own weekday. The weekday is the calendar day's, not the
 * weekday some instant of it has in the zone — reading `${date}T12:00Z` in the
 * zone used the NEXT day's hours in zones at UTC+12 and beyond (New Zealand,
 * Fiji, Tonga, Samoa, Kiribati; Norfolk Island in summer).
 * `overridesByDate` (from getDateOverridesByDate) replaces the per-day
 * override read when a caller walks a range of days.
 */
export declare function getScheduleDaySlots(ctx: QueryCtx, schedule: Doc<"schedules">, date: CivilDate, overridesByDate?: Map<string, Doc<"date_overrides">>): Promise<number[]>;
/**
 * A schedule's date overrides from `dateFrom` to `dateTo`, by date, read with
 * one index range. Of several rows for one date the first stored wins, as in
 * getScheduleDaySlots' own lookup.
 */
export declare function getDateOverridesByDate(ctx: QueryCtx, schedule: Doc<"schedules">, dateFrom: CivilDate, dateTo: CivilDate): Promise<Map<string, Doc<"date_overrides">>>;
/** Local slot indices of a schedule's weekly hours on the weekday of `date` (overrides ignored). */
export declare function getWeeklySlots(schedule: Doc<"schedules">, date: CivilDate): number[];
/**
 * Get the effective available slots for a resource on a specific date.
 * This considers the schedule's weekly hours and any date overrides.
 * An unknown scheduleId throws SCHEDULE_NOT_FOUND (until 0.4.3 it returned
 * 09:00–17:00).
 */
export declare const getEffectiveAvailability: import("convex/server").RegisteredQuery<"public", {
    scheduleId: string;
    date: string;
}, Promise<{
    availableSlots: number[];
}>>;
//# sourceMappingURL=schedules.d.ts.map