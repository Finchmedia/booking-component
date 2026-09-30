/**
 * Frozen list of the component's registered functions — change only deliberately.
 *
 * Hosts call these functions by path (`components.booking.public.createBooking`),
 * and queued jobs reference the internal ones by name (the six email mutations,
 * `presence:cleanup`, `hooks:triggerHooks`). A function that moves to another
 * file or is renamed breaks both, even though the code still compiles.
 *
 * Adding, removing or moving a function: run codegen, commit `_generated`, and
 * update this list in the same change.
 */
import { expect, expectTypeOf, test } from "vitest";
import type { FunctionReference } from "convex/server";
import type { ComponentApi } from "./_generated/component.js";

const REGISTERED_FUNCTIONS = [
  "emails/mutations:sendBookingApproved (internal mutation)",
  "emails/mutations:sendBookingCancellation (internal mutation)",
  "emails/mutations:sendBookingConfirmation (internal mutation)",
  "emails/mutations:sendBookingDeclined (internal mutation)",
  "emails/mutations:sendBookingPending (internal mutation)",
  "emails/mutations:sendBookingRescheduled (internal mutation)",
  "emails:sendBookingApproved (internal mutation)",
  "emails:sendBookingCancellation (internal mutation)",
  "emails:sendBookingConfirmation (internal mutation)",
  "emails:sendBookingDeclined (internal mutation)",
  "emails:sendBookingPending (internal mutation)",
  "emails:sendBookingRescheduled (internal mutation)",
  "hooks:getBookingHistory (public query)",
  "hooks:getHook (public query)",
  "hooks:listHooks (public query)",
  "hooks:registerHook (public mutation)",
  "hooks:transitionBookingState (public mutation)",
  "hooks:triggerHooks (internal mutation)",
  "hooks:unregisterHook (public mutation)",
  "hooks:updateHook (public mutation)",
  "maintenance:audit (public query)",
  "maintenance:backfillBookingOrganizations (public mutation)",
  "maintenance:getDailyAvailability (public query)",
  "maintenance:wipeAllBookingData (public mutation)",
  "maintenance:wipeAllData (public mutation)",
  "multi_resource:cancelMultiResourceBooking (public mutation)",
  "multi_resource:checkMultiResourceAvailability (public query)",
  "multi_resource:createMultiResourceBooking (public mutation)",
  "multi_resource:getBookingWithItems (public query)",
  "presence:cleanup (internal mutation)",
  "presence:getActivePresenceCount (public query)",
  "presence:getDatePresence (public query)",
  "presence:heartbeat (public mutation)",
  "presence:leave (public mutation)",
  "presence:list (public query)",
  "presence:sweepOrphanedHolds (public mutation)",
  "public:cancelBookingByToken (public mutation)",
  "public:cancelReservation (public mutation)",
  "public:createBooking (public mutation)",
  "public:createEventType (public mutation)",
  "public:createProvisionalBooking (public mutation)",
  "public:createReservation (public mutation)",
  "public:deleteEventType (public mutation)",
  "public:expireProvisionalBooking (public mutation)",
  "public:getAvailability (public query)",
  "public:getBooking (public query)",
  "public:getBookingByToken (public query)",
  "public:getBookingByUid (public query)",
  "public:getDaySlots (public query)",
  "public:getEventType (public query)",
  "public:getEventTypeBySlug (public query)",
  "public:getMonthAvailability (public query)",
  "public:listBookings (public query)",
  "public:listEventTypes (public query)",
  "public:rescheduleBooking (public mutation)",
  "public:rescheduleBookingByToken (public mutation)",
  "public:toggleEventTypeActive (public mutation)",
  "public:updateEventType (public mutation)",
  "resource_event_types:deleteAllLinksForEventType (public mutation)",
  "resource_event_types:deleteAllLinksForResource (public mutation)",
  "resource_event_types:getEventTypeIdsForResource (public query)",
  "resource_event_types:getEventTypesForResource (public query)",
  "resource_event_types:getResourceIdsForEventType (public query)",
  "resource_event_types:getResourcesForEventType (public query)",
  "resource_event_types:hasResourceEventTypeLink (public query)",
  "resource_event_types:linkResourceToEventType (public mutation)",
  "resource_event_types:setEventTypesForResource (public mutation)",
  "resource_event_types:setResourcesForEventType (public mutation)",
  "resource_event_types:unlinkResourceFromEventType (public mutation)",
  "resources:createResource (public mutation)",
  "resources:deleteResource (public mutation)",
  "resources:getQuantityAvailability (public query)",
  "resources:getResource (public query)",
  "resources:getResourceAvailability (public query)",
  "resources:getResourceById (public query)",
  "resources:listResources (public query)",
  "resources:listResourcesByType (public query)",
  "resources:toggleResourceActive (public mutation)",
  "resources:updateResource (public mutation)",
  "schedules:createDateOverride (public mutation)",
  "schedules:createSchedule (public mutation)",
  "schedules:deleteDateOverride (public mutation)",
  "schedules:deleteSchedule (public mutation)",
  "schedules:getDateOverride (public query)",
  "schedules:getDefaultSchedule (public query)",
  "schedules:getEffectiveAvailability (public query)",
  "schedules:getSchedule (public query)",
  "schedules:getScheduleById (public query)",
  "schedules:listDateOverrides (public query)",
  "schedules:listSchedules (public query)",
  "schedules:updateDateOverride (public mutation)",
  "schedules:updateSchedule (public mutation)",
] as const;

// Every component module, loaded the way Convex registers them: path = file
// path without extension, function = registered export.
const componentModules = import.meta.glob<Record<string, unknown>>(
  ["./**/*.ts", "!./**/*.test.ts", "!./_generated/**", "!./convex.config.ts"],
  { eager: true },
);

type Registration = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  isInternal?: boolean;
};

function registeredFunctions(): string[] {
  const found: string[] = [];
  for (const [file, exports] of Object.entries(componentModules)) {
    const path = file.replace(/^\.\//, "").replace(/\.ts$/, "");
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function") continue;
      const fn = value as Registration;
      const kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : fn.isAction ? "action" : null;
      if (!kind) continue;
      const visibility = fn.isPublic ? "public" : fn.isInternal ? "internal" : "unknown";
      found.push(`${path}:${name} (${visibility} ${kind})`);
    }
  }
  return found.sort();
}

test("registered component functions keep their paths, kinds and visibility", () => {
  // CONTROL: the loader sees the modules (not an empty glob).
  expect(Object.keys(componentModules)).toContain("./public.ts");
  expect(registeredFunctions()).toEqual([...REGISTERED_FUNCTIONS]);
});

// The generated ComponentApi (what hosts compile against) must list exactly the
// public entries above, so a stale `_generated/component.ts` fails typecheck.
type GeneratedPublicFunctions = {
  [M in keyof ComponentApi & string]: {
    [F in keyof ComponentApi[M] & string]: ComponentApi[M][F] extends FunctionReference<
      infer Kind,
      "internal"
    >
      ? `${M}:${F} (public ${Kind})`
      : never;
  }[keyof ComponentApi[M] & string];
}[keyof ComponentApi & string];

type PinnedPublicFunctions = Extract<
  (typeof REGISTERED_FUNCTIONS)[number],
  `${string} (public ${string})`
>;

test("the generated ComponentApi exposes exactly the pinned public functions", () => {
  // Two one-sided checks so a failure names the offending path.
  expectTypeOf<Exclude<GeneratedPublicFunctions, PinnedPublicFunctions>>().toBeNever();
  expectTypeOf<Exclude<PinnedPublicFunctions, GeneratedPublicFunctions>>().toBeNever();
  // CONTROL: a path that is not public must not satisfy the generated type.
  // @ts-expect-error -- triggerHooks is internal and absent from ComponentApi
  const internalPath: GeneratedPublicFunctions = "hooks:triggerHooks (public mutation)";
  expect(internalPath).toBeDefined();
});
