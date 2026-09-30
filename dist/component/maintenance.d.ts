/**
 * Deletes ALL booking data (bookings + history + items + slot occupancy) but
 * keeps the setup (resources, schedules, event types, links, hooks). Afterwards
 * the calendar is empty and every slot is free again.
 */
export declare const wipeAllBookingData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    bookings: number;
    bookingHistory: number;
    bookingItems: number;
    dailyAvailability: number;
    quantityAvailability: number;
}>>;
/**
 * Deletes ALL component data: booking data (see wipeAllBookingData) AND the
 * setup tables (resources, schedules, date overrides, event types,
 * resource ↔ event type links, hooks). Presence tables are left alone.
 * Intended for sandbox resets before re-seeding.
 */
export declare const wipeAllData: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    resources: number;
    schedules: number;
    dateOverrides: number;
    eventTypes: number;
    resourceEventTypes: number;
    hooks: number;
    bookings: number;
    bookingHistory: number;
    bookingItems: number;
    dailyAvailability: number;
    quantityAvailability: number;
}>>;
/**
 * Raw slot occupancy of one resource/day — for verification and debugging
 * (getDaySlots only returns the FREE slots and says nothing about bookings).
 * Returns the busySlots array, or null when no row exists for that day.
 */
export declare const getDailyAvailability: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    date: string;
}, Promise<number[] | null>>;
/**
 * Read-only upgrade audit, one check and one page of rows per call:
 * - "f10_weekday": upcoming pending, confirmed or provisional bookings that
 *   0.4.2 admitted on a weekday without opening hours (schedules at UTC+12
 *   or beyond used the next weekday's hours). The schedule is the booking's
 *   event type's, else its organization's default, as in the reference host.
 * - "event_length_invalid": event types whose lengthInMinutes or
 *   lengthInMinutesOptions hold a value that is not a positive number. The
 *   availability queries reject such lengths since 0.4.3.
 *
 * Start without a cursor and pass `continueCursor` back until `isDone`.
 * `scanned` counts the rows read; `issues` lists the ones that failed the
 * check. Call it from a host internal function.
 */
export declare const audit: import("convex/server").RegisteredQuery<"public", {
    cursor?: string | null | undefined;
    check: "f10_weekday" | "event_length_invalid";
    limit: number;
}, Promise<{
    issues: ({
        start: number;
        check: "f10_weekday";
        date: string;
        uid: string;
        scheduleId: string;
    } | {
        lengthInMinutesOptions?: number[] | undefined;
        eventTypeId: string;
        check: "event_length_invalid";
        lengthInMinutes: number;
    })[];
    scanned: number;
    continueCursor: string | null;
    isDone: boolean;
}>>;
/**
 * Fills a missing booking organizationId, one page of bookings per call,
 * where the stored rows corroborate it. Until 0.4.3 bundles created without
 * `organizationId` stored none (and single bookings before 0.3.0), so they
 * were missing from organization lists and organization hooks.
 *
 * A booking takes its event type's organization only when every resource it
 * occupies (its resourceId and each booking item) exists and belongs to that
 * organization as well. The event type alone is no evidence: it may have
 * moved to another organization since the booking was made, which would then
 * receive the booker's details and management token in its booking list.
 *
 * - `updated` counts the rows given their event type's organization
 *   (with `dryRun`, the rows that would be; nothing is written).
 * - `skipped` counts rows that stay without one: legacy createReservation
 *   rows and the rows in `needsReview`.
 * - `needsReview` lists the rows the stored data cannot assign, with the
 *   reason: event type deleted or without organization, a resource missing or
 *   in another organization. They keep no organization, so they stay out of
 *   organization lists and hooks as before; check them against your records.
 * - `mismatches` lists rows whose organization differs from their event
 *   type's. They are reported, never rewritten.
 *
 * Idempotent: a second run updates nothing. Start without a cursor and pass
 * `continueCursor` back until `isDone`; call it from a host internal mutation.
 * Bookings created during a run sort after the cursor and are visited too.
 */
export declare const backfillBookingOrganizations: import("convex/server").RegisteredMutation<"public", {
    cursor?: string | null | undefined;
    limit: number;
    dryRun: boolean;
}, Promise<{
    scanned: number;
    updated: number;
    skipped: number;
    mismatches: {
        organizationId: string;
        uid: string;
        eventTypeOrganizationId: string;
    }[];
    needsReview: {
        resourceId?: string | undefined;
        eventTypeOrganizationId?: string | undefined;
        resourceOrganizationId?: string | undefined;
        eventTypeId: string;
        reason: "event_type_missing" | "event_type_without_organization" | "resource_missing" | "resource_organization_differs";
        uid: string;
    }[];
    continueCursor: string | null;
    isDone: boolean;
}>>;
//# sourceMappingURL=maintenance.d.ts.map