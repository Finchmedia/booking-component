import type { DatabaseReader, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { BookingStatus } from "../shared/booking-status.js";
import type { BookingHookEventV2 } from "../shared/hook-events-v2.js";
type RuleTexts = "single" | "bundle";
/** The eventTypeId of createReservation rows; createEventType refuses it. */
export declare const LEGACY_EVENT_TYPE_ID = "legacy";
/**
 * Whether `booking` is a legacy createReservation row, exempt from the
 * booking rules: it names the reserved event type ID "legacy" and no event
 * type has that ID. While an event type created with it before 0.5.0
 * exists, the bookings naming it (createReservation rows included) follow
 * its rules like any other booking.
 */
export declare function isLegacyReservation(findEventType: (id: string) => Promise<Doc<"event_types"> | null>, booking: Pick<Doc<"bookings">, "eventTypeId">): Promise<boolean>;
/** The event type of a booking: it exists and is active. */
export declare function loadBookableEventType(ctx: QueryCtx, eventTypeId: string, texts: RuleTexts): Promise<Doc<"event_types">>;
/**
 * The resources of a booking under `eventType`, in the order given: each
 * exists, is active, is linked and shares the event type's organization, all
 * share one organization, and one of them is standalone. For "single" the
 * one resource must be standalone itself, checked before its link, as
 * createBooking always did. Returns the organization of the resources: the
 * event type's when it has one, else the one they share.
 */
export declare function assertResourcesBookable(ctx: QueryCtx, eventType: Doc<"event_types">, resourceIds: string[], texts: RuleTexts): Promise<string | undefined>;
/**
 * Rejects an organization a booking of an event type without organization
 * names (the bundle argument, or the stored value on a move or
 * confirmation) when it is not the one its resources share: that booking
 * would be listed for, and notify, an organization that owns none of them.
 */
export declare function assertOrganizationOfResources(eventType: Doc<"event_types">, organizationId: string | undefined, resourcesOrganizationId: string | undefined, firstResourceId: string): void;
/**
 * The booking rules for an existing booking against the current
 * configuration: its event type and every resource it holds (all
 * booking_items of a bundle, else its resource). Moves call it for the
 * destination before releasing anything; transitionBookingState before
 * confirming a booking or submitting a hold as a request. Returns the event
 * type, or null for a legacy row.
 */
export declare function assertStillBookable(ctx: QueryCtx, booking: Doc<"bookings">, items: Array<{
    resourceId: string;
}>): Promise<Doc<"event_types"> | null>;
/** A booking rule a stored booking fails; see bookingRuleProblems. */
export type BookingRuleProblem = "eventTypeMissing" | "eventTypeInactive" | "resourceMissing" | "resourceInactive" | "resourceNotLinked" | "crossOrganization" | "noStandalone";
/** Configuration reads by external id (the audit caches them per page). */
export type RuleLookups = {
    eventType(id: string): Promise<Doc<"event_types"> | null>;
    resource(id: string): Promise<Doc<"resources"> | null>;
    linked(resourceId: string, eventTypeId: string): Promise<boolean>;
};
/**
 * The rules assertStillBookable applies to `booking` and its resources (its
 * booking_items, else its resource), as every rule it fails instead of the
 * first error: what a move or confirmation of the booking would be rejected
 * for today. Legacy rows fail none. `crossOrganization` covers a resource of
 * another organization than the event type, resources of two organizations,
 * and a stored organization that is not the resources' one (event types
 * without organization). `noStandalone` is reported only when every
 * resource exists and none is standalone, so that repairing the other
 * problems would not be enough.
 */
export declare function bookingRuleProblems(find: RuleLookups, booking: Doc<"bookings">, resourceIds: string[]): Promise<BookingRuleProblem[]>;
/**
 * The checks createBooking and createProvisionalBooking share, in the order
 * hosts see their errors: range, pool, event type (exists, active), resource
 * (exists, active, standalone), link, organization, free slots. Returns the
 * event type and the slots to hold per UTC date.
 */
export declare function assertSingleBookable(ctx: QueryCtx, args: {
    eventTypeId: string;
    resourceId: string;
    start: number;
    end: number;
}): Promise<{
    eventType: Doc<"event_types">;
    requiredSlots: Map<string, number[]>;
}>;
/** Why the stored rows do not corroborate a booking's organization; see corroboratedOrganization. */
export type UncorroboratedOrganization = {
    reason: "event_type_missing" | "event_type_without_organization";
} | {
    reason: "resource_missing";
    eventTypeOrganizationId: string;
    resourceId: string;
} | {
    reason: "resource_organization_differs";
    eventTypeOrganizationId: string;
    resourceId: string;
    resourceOrganizationId: string;
};
/**
 * The organization of a booking's event type when the stored rows
 * corroborate it, or why they do not: the event type exists and has an
 * organization, and every resource the booking occupies (its resourceId and
 * each booking item) exists and belongs to that organization too; the
 * reason names the first resource that fails. Nothing records the
 * organization a booking was made for, and an event type can move to
 * another organization later; the resources, owners of the booked
 * inventory, corroborate it. backfillBookingOrganizations, the audit's
 * booking_integrity and withEventTypeOrganization share this rule. Reads
 * only, never throws. `loadItems` lets a caller that also needs the items
 * read them once.
 */
export declare function corroboratedOrganization(db: DatabaseReader, booking: Doc<"bookings">, eventType: Doc<"event_types"> | null, resource: (id: string) => Promise<Doc<"resources"> | null>, loadItems?: () => Promise<Doc<"booking_items">[]>): Promise<{
    organizationId: string;
} | UncorroboratedOrganization>;
/**
 * The booking as its notifications describe it, in the organization every
 * hook and email about an existing booking goes to. A booking stored before
 * 0.5.0 without its event type's organization or with another one is given
 * it here, in the caller's transaction and before hooks and emails are
 * queued, only when every resource it occupies belongs to that organization
 * (corroboratedOrganization); hook routing, the email context and both
 * payload versions then name it. Otherwise the stored organization stays and
 * is notified, as in 0.4.x: legacy createReservation rows, deleted event
 * types or ones without organization, and bookings holding a missing
 * resource or another organization's (booking_integrity lists the latter as
 * organizationMismatch). Never rejects: cancelling, declining, completing
 * and expiring always succeed.
 */
export declare function withEventTypeOrganization(ctx: MutationCtx, booking: Doc<"bookings">): Promise<Doc<"bookings">>;
/**
 * Ends an active booking (provisional, pending or confirmed; the caller has
 * checked): releases everything it holds, records one history row and stamps
 * status, cancelledAt, updatedAt and cancellationReason.
 *
 * Releases from the pre-cancel snapshot BEFORE patching the status:
 * releaseAllSlotsForBooking returns early for terminal statuses, so a
 * re-read of the patched row would silently keep the inventory busy.
 */
export declare function terminateBooking(ctx: MutationCtx, booking: Doc<"bookings">, opts: {
    to: "cancelled" | "declined";
    reason?: string;
    changedBy?: string;
    now: number;
}): Promise<void>;
type HookEventV2Name = BookingHookEventV2["event"];
/**
 * The version 2 hook payload of an event, read from the booking as the
 * emitting mutation wrote it (call it after the writes). `details` are what
 * the booking does not store: the status before the event, the reason and
 * the actor the mutation recorded, and for a move the original booking.
 * The management token is never included.
 */
export declare function buildHookEventV2(ctx: QueryCtx, event: HookEventV2Name, bookingId: Id<"bookings">, details?: {
    previousStatus?: BookingStatus;
    reason?: string;
    changedBy?: string;
    original?: Doc<"bookings">;
}): Promise<BookingHookEventV2>;
export {};
//# sourceMappingURL=booking_lifecycle.d.ts.map