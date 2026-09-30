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
 * Read-only upgrade audit, one check and one page of rows per call. Run
 * every check before upgrading to 0.5.0: each reports stored rows that
 * 0.5.0 rejects on write, reads differently or cannot move or confirm.
 * - "f10_weekday" (bookings): upcoming pending, confirmed or provisional
 *   bookings that 0.4.2 admitted on a weekday without opening hours
 *   (schedules at UTC+12 or beyond used the next weekday's hours). The
 *   schedule is the booking's event type's, else its organization's
 *   default, as in the reference host.
 * - "event_length_invalid" (event types): lengthInMinutes or
 *   lengthInMinutesOptions hold a value that is not a positive number. The
 *   availability queries reject such lengths since 0.4.3.
 * - "event_type_config" (event types), "schedule_config" (schedules),
 *   "resource_config" (resources), "date_override_config" (date overrides),
 *   "link_integrity" (resource ↔ event type links), "booking_integrity",
 *   "booking_eligibility" (bookings, with their items) and
 *   "booking_status_invalid" (bookings, with their history rows): each
 *   issue lists its `problems`; see the functions above.
 *
 * Start without a cursor and pass `continueCursor` back until `isDone`; the
 * cursor is the complete by_creation_time key, so rows with equal creation
 * times are neither skipped nor repeated, and rows created during a run are
 * visited too. `scanned` counts the rows read; `issues` lists the ones that
 * failed the check. Call it from a host internal function.
 */
export declare const audit: import("convex/server").RegisteredQuery<"public", {
    cursor?: string | null | undefined;
    check: "f10_weekday" | "event_length_invalid" | "event_type_config" | "schedule_config" | "resource_config" | "date_override_config" | "link_integrity" | "booking_integrity" | "booking_eligibility" | "booking_status_invalid";
    limit: number;
}, Promise<{
    issues: ({
        start: number;
        scheduleId: string;
        date: string;
        check: "f10_weekday";
        uid: string;
    } | {
        lengthInMinutesOptions?: number[] | undefined;
        eventTypeId: string;
        lengthInMinutes: number;
        check: "event_length_invalid";
    } | {
        eventTypeId: string;
        check: "event_type_config";
        problems: ("id" | "timezone" | "lengthInMinutes" | "lengthInMinutesOptions" | "lengthNotInOptions" | "slotInterval" | "bufferBefore" | "bufferAfter" | "minNoticeMinutes" | "maxFutureMinutes" | "scheduleId")[];
    } | {
        scheduleId: string;
        check: "schedule_config";
        problems: "timezone"[];
    } | {
        resourceId: string;
        check: "resource_config";
        problems: "timezone"[];
    } | {
        type: string;
        date: string;
        check: "date_override_config";
        overrideId: string;
        problems: ("type" | "customHours" | "date")[];
    } | {
        resourceId: string;
        eventTypeId: string;
        check: "link_integrity";
        problems: ("resourceMissing" | "eventTypeMissing" | "crossOrganization" | "duplicate")[];
    } | {
        check: "booking_integrity";
        uid: string;
        problems: ("organizationMissing" | "organizationMismatch" | "poolWithoutItems")[];
    } | {
        eventTypeId: string;
        start: number;
        status: "confirmed" | "pending" | "declined" | "cancelled" | "provisional" | "completed";
        check: "booking_eligibility";
        uid: string;
        resourceIds: string[];
        problems: ("resourceMissing" | "eventTypeMissing" | "crossOrganization" | "eventTypeInactive" | "resourceInactive" | "resourceNotLinked" | "noStandalone")[];
    } | {
        status: string;
        check: "booking_status_invalid";
        uid: string;
        problems: ("status" | "historyStatus")[];
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
 * organization as well (corroboratedOrganization). The event type alone is
 * no evidence: it may have moved to another organization since the booking
 * was made, which would then receive the booker's details and management
 * token in its booking list.
 *
 * - `updated` counts the rows given their event type's organization
 *   (with `dryRun`, the rows that would be; nothing is written).
 * - `skipped` counts rows that stay without one: legacy createReservation
 *   rows (see isLegacyReservation) and the rows in `needsReview`.
 * - `needsReview` lists the rows the stored data cannot assign, with the
 *   reason: event type deleted or without organization, a resource missing or
 *   in another organization. They keep no organization, so they stay out of
 *   organization lists and hooks as before; check them against your records.
 * - `mismatches` lists rows whose organization differs from their event
 *   type's. The backfill reports them and never rewrites them in bulk; the
 *   booking's next move, transition, cancellation or expiry gives it the
 *   event type's organization before anyone is notified, under the same
 *   rule (withEventTypeOrganization).
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