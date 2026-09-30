/**
 * The error-code contract (N3): the helper, the guards, and docs/errors.md,
 * which is rendered from CODE_DOCS below and compared at the end. After a
 * deliberate change run `npx vitest run src/shared/booking-errors.test.ts -u`.
 * The texts per entry point are pinned in src/component/error-texts.test.ts.
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import {
  BOOKING_ERROR_CODES,
  isBookingError,
  isBookingErrorCode,
  throwBookingError,
  type BookingErrorCode,
  type BookingErrorData,
} from "./booking-errors.js";

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("throwBookingError", () => {
  test("throws ConvexError({ code, message }) whose own message is the text", () => {
    const error = thrown(() => throwBookingError("SLOT_UNAVAILABLE", 'Resource "res-1" is not available for the selected time'));
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<BookingErrorData>).data).toEqual({
      code: "SLOT_UNAVAILABLE",
      message: 'Resource "res-1" is not available for the selected time',
    });
    // Not the JSON of the data (which would escape the quotes).
    expect((error as Error).message).toBe('Resource "res-1" is not available for the selected time');
  });
});

describe("isBookingError", () => {
  test("accepts a component rejection with a known code only", () => {
    expect(isBookingError(thrown(() => throwBookingError("INVALID_TOKEN", "Invalid token")))).toBe(true);
    expect(isBookingError(new ConvexError({ code: "INVALID_TOKEN", message: "Invalid token" }))).toBe(true);
    // CONTROLS: the same text without the contract.
    expect(isBookingError(new Error("Invalid token"))).toBe(false);
    expect(isBookingError(new ConvexError("Invalid token"))).toBe(false);
    expect(isBookingError(new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in" }))).toBe(false);
    expect(isBookingError(new ConvexError({ code: "INVALID_TOKEN" }))).toBe(false);
    expect(isBookingError(null)).toBe(false);
  });

  test("isBookingErrorCode knows exactly the listed codes", () => {
    for (const code of BOOKING_ERROR_CODES) expect(isBookingErrorCode(code)).toBe(true);
    expect(isBookingErrorCode("SLOT_NOT_AVAILABLE")).toBe(false);
    expect(isBookingErrorCode(undefined)).toBe(false);
  });
});

// ============================================
// docs/errors.md
// ============================================

const CODE_DOCS: Record<BookingErrorCode, { meaning: string; thrownBy: string }> = {
  SLOT_UNAVAILABLE: {
    meaning: "The time is taken on a resource that is booked by time slot (not a pool).",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createReservation`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`",
  },
  QUANTITY_UNAVAILABLE: {
    meaning: "A pool has fewer free units than requested during part of the time.",
    thrownBy: "`createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`",
  },
  EVENT_TYPE_NOT_FOUND: {
    meaning: "No event type has this ID.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `updateEventType`, `deleteEventType`, `toggleEventTypeActive`, `linkResourceToEventType`, `setResourcesForEventType`",
  },
  EVENT_TYPE_INACTIVE: {
    meaning: "The event type is deactivated.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`)",
  },
  EVENT_TYPE_IN_USE: {
    meaning: "The event type has bookings, so it cannot be deleted. Deactivate it instead.",
    thrownBy: "`deleteEventType`",
  },
  RESOURCE_NOT_FOUND: {
    meaning: "No resource has this ID.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `updateResource`, `deleteResource`, `toggleResourceActive`, `linkResourceToEventType`, `setEventTypesForResource`",
  },
  RESOURCE_INACTIVE: {
    meaning: "The resource is deactivated.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`)",
  },
  RESOURCE_NOT_LINKED: {
    meaning: "The resource is not linked to the event type.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`)",
  },
  RESOURCE_NOT_STANDALONE: {
    meaning: "An add-on (`isStandalone: false`) is booked without a standalone resource.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`)",
  },
  RESOURCE_ALREADY_EXISTS: {
    meaning: "A resource with this ID exists.",
    thrownBy: "`createResource`",
  },
  RESOURCE_IN_USE: {
    meaning:
      "Bookings or reserved slots prevent the change: deleting a resource with bookings, switching between slot and pool inventory while it holds reservations, flagging a resource as a pool while single-resource bookings on it are active, or lowering a pool's capacity below its reserved units.",
    thrownBy: "`createResource`, `updateResource`, `deleteResource`",
  },
  POOL_REQUIRES_BUNDLE: {
    meaning:
      "A pool (`isFungible: true`) is booked through a single-resource function. Book it with `createMultiResourceBooking` and a quantity. Moves throw it for a single-resource booking whose resource became a pool.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createReservation`, `rescheduleBooking`, `rescheduleBookingByToken`",
  },
  ORGANIZATION_MISMATCH: {
    meaning:
      "Organizations do not match: a resource of another organization than an organization-scoped event type, a bundle's `organizationId` that differs from its event type's, or an existing event type ID of another organization in `createEventType`.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `createEventType`, `linkResourceToEventType`, `setResourcesForEventType`, `setEventTypesForResource`",
  },
  SCHEDULE_NOT_FOUND: {
    meaning: "No schedule has this ID.",
    thrownBy: "`getMonthAvailability`, `getDaySlots`, `getEffectiveAvailability`, `createEventType`, `updateEventType`, `updateSchedule`, `deleteSchedule`",
  },
  SCHEDULE_ALREADY_EXISTS: {
    meaning: "A schedule with this ID exists.",
    thrownBy: "`createSchedule`",
  },
  SCHEDULE_IN_USE: {
    meaning: "Event types use the schedule, so it cannot be deleted. Give them another schedule first.",
    thrownBy: "`deleteSchedule`",
  },
  DATE_OVERRIDE_NOT_FOUND: {
    meaning: "The date override no longer exists.",
    thrownBy: "`updateDateOverride`, `deleteDateOverride`",
  },
  BOOKING_NOT_FOUND: {
    meaning: "No booking has this ID or UID.",
    thrownBy: "`getBookingByToken`, `cancelBookingByToken`, `rescheduleBookingByToken`, `rescheduleBooking`, `cancelReservation`, `cancelMultiResourceBooking`, `expireProvisionalBooking`, `transitionBookingState`",
  },
  INVALID_TOKEN: {
    meaning: "The management token does not belong to the booking.",
    thrownBy: "`getBookingByToken`, `cancelBookingByToken`, `rescheduleBookingByToken`",
  },
  INVALID_STATE: {
    meaning: "The booking's status does not allow the operation, such as cancelling a cancelled booking or moving a completed one.",
    thrownBy: "`cancelBookingByToken`, `cancelReservation`, `cancelMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState`",
  },
  HOOK_NOT_FOUND: {
    meaning: "The hook no longer exists.",
    thrownBy: "`updateHook`, `unregisterHook`",
  },
  INVALID_RANGE: {
    meaning: "The end is not after the start, an instant is beyond what a `Date` can hold, or a `getAvailability` range is longer than 366 days.",
    thrownBy: "`createBooking`, `createProvisionalBooking`, `createReservation`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `getAvailability`, `checkMultiResourceAvailability`",
  },
  INVALID_INPUT: {
    meaning:
      "An argument without a valid meaning: a date that does not exist, `dateFrom` after `dateTo`, a `getMonthAvailability` range of more than 93 days, an event length that is not a positive number, slot indices outside 0–95, incomplete schedule arguments or a `resourceTimezone` that differs from the schedule's, both `rescheduleContext` and `excludeBookingUid`, a time zone `Intl` rejects, a booker email that is not an address, event-type lengths, options or slot interval that are not whole minutes above 0, negative buffers or notice, a horizon that is not above 0, a length missing from its options, malformed or overlapping hours, a `custom` date override without hours, an empty or duplicate resource list, a quantity that is not a positive integer, a hook event type or function handle the component does not accept, a `limit`, `numItems`, `maximumRowsRead` or `cursor` out of range, or not exactly one `listBookingsPage` selector.",
    thrownBy: "`getDaySlots`, `getMonthAvailability`, `getEffectiveAvailability`, the schedule, date-override, resource and event-type writes, `listDateOverrides`, `getDateOverride`, `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `checkMultiResourceAvailability`, `listBookings`, `listBookingsPage`, `registerHook`, `updateHook`, `maintenance.audit`, `maintenance.backfillBookingOrganizations`, `presence.sweepOrphanedHolds`",
  },
};

function renderErrorsDoc(): string {
  const lines = [
    "# Error codes",
    "",
    "<!-- Generated from CODE_DOCS in src/shared/booking-errors.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/shared/booking-errors.test.ts -u`. -->",
    "",
    "Since 0.5.0 the component rejects expected failures with `ConvexError({ code, message })`:",
    "",
    "- `code` is one of the codes below. Codes are public contract: a code keeps its meaning, and a",
    "  new one is announced in the changelog.",
    "- `message` is English text for logs and administrators: for failures 0.4.x already had, the",
    "  text they had then. The text differs per function and can contain IDs. Show bookers your own",
    "  text, chosen by `code`.",
    "- Everything else stays a plain `Error`: argument validation by Convex, broken invariants and",
    "  email rendering. Convex redacts the message of a plain `Error` for clients in production.",
    "",
    "A host function receives the `ConvexError` from `ctx.runQuery` or `ctx.runMutation` with its",
    "`data`. `isBookingError` from `@mrfinch/booking` recognizes one with a known code:",
    "",
    "```ts",
    'import { ConvexError } from "convex/values";',
    'import { isBookingError } from "@mrfinch/booking";',
    "",
    "try {",
    "  return await ctx.runMutation(components.booking.public.createBooking, args);",
    "} catch (error) {",
    '  if (isBookingError(error) && error.data.code === "SLOT_UNAVAILABLE") {',
    '    throw new ConvexError({ code: "SLOT_TAKEN", message: "This time was just booked. Please pick another one." });',
    "  }",
    "  throw error;",
    "}",
    "```",
    "",
    "A host that passes every `ConvexError` through to its clients shows them these codes and",
    "messages. Map the codes your clients see.",
    "",
    "| Code | Meaning | Thrown by |",
    "| --- | --- | --- |",
    ...BOOKING_ERROR_CODES.map(
      (code) => `| \`${code}\` | ${CODE_DOCS[code].meaning} | ${CODE_DOCS[code].thrownBy} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

test("docs/errors.md documents every code, in list order", async () => {
  expect(Object.keys(CODE_DOCS)).toEqual([...BOOKING_ERROR_CODES]);
  await expect(renderErrorsDoc()).toMatchFileSnapshot("../../docs/errors.md");
});
