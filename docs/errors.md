# Error codes

<!-- Generated from CODE_DOCS in src/shared/booking-errors.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/shared/booking-errors.test.ts -u`. -->

Since 0.5.0 the component rejects expected failures with `ConvexError({ code, message })`:

- `code` is one of the codes below. Codes are public contract: a code keeps its meaning, and a
  new one is announced in the changelog.
- `message` is English text for logs and administrators: for failures 0.4.x already had, the
  text they had then. The text differs per function and can contain IDs. Show bookers your own
  text, chosen by `code`.
- Everything else stays a plain `Error`: argument validation by Convex, broken invariants and
  email rendering. Convex redacts the message of a plain `Error` for clients in production.

A host function receives the `ConvexError` from `ctx.runQuery` or `ctx.runMutation` with its
`data`. `isBookingError` from `@mrfinch/booking` recognizes one with a known code:

```ts
import { ConvexError } from "convex/values";
import { isBookingError } from "@mrfinch/booking";

try {
  return await ctx.runMutation(components.booking.public.createBooking, args);
} catch (error) {
  if (isBookingError(error) && error.data.code === "SLOT_UNAVAILABLE") {
    throw new ConvexError({ code: "SLOT_TAKEN", message: "This time was just booked. Please pick another one." });
  }
  throw error;
}
```

A host that passes every `ConvexError` through to its clients shows them these codes and
messages. Map the codes your clients see.

| Code | Meaning | Thrown by |
| --- | --- | --- |
| `SLOT_UNAVAILABLE` | The time is taken on a resource that is booked by time slot (not a pool). | `createBooking`, `createProvisionalBooking`, `createReservation`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken` |
| `QUANTITY_UNAVAILABLE` | A pool has fewer free units than requested during part of the time. | `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken` |
| `EVENT_TYPE_NOT_FOUND` | No event type has this ID. | `getEventType`, `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `updateEventType`, `deleteEventType`, `toggleEventTypeActive`, `linkResourceToEventType`, `setResourcesForEventType` |
| `EVENT_TYPE_INACTIVE` | The event type is deactivated. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`) |
| `EVENT_TYPE_IN_USE` | The event type has bookings, so it cannot be deleted. Deactivate it instead. | `deleteEventType` |
| `RESOURCE_NOT_FOUND` | No resource has this ID. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `updateResource`, `deleteResource`, `toggleResourceActive`, `linkResourceToEventType`, `setEventTypesForResource` |
| `RESOURCE_INACTIVE` | The resource is deactivated. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`) |
| `RESOURCE_NOT_LINKED` | The resource is not linked to the event type. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`) |
| `RESOURCE_NOT_STANDALONE` | An add-on (`isStandalone: false`) is booked without a standalone resource. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`) |
| `RESOURCE_ALREADY_EXISTS` | A resource with this ID exists. | `createResource` |
| `RESOURCE_IN_USE` | Bookings or reserved slots prevent the change: deleting a resource with bookings, switching between slot and pool inventory while it holds reservations, flagging a resource as a pool while single-resource bookings on it are active, or lowering a pool's capacity below its reserved units. | `createResource`, `updateResource`, `deleteResource` |
| `POOL_REQUIRES_BUNDLE` | A pool (`isFungible: true`) is booked through a single-resource function. Book it with `createMultiResourceBooking` and a quantity. Moves throw it for a single-resource booking whose resource became a pool. | `createBooking`, `createProvisionalBooking`, `createReservation`, `rescheduleBooking`, `rescheduleBookingByToken` |
| `ORGANIZATION_MISMATCH` | Organizations do not match: a resource of another organization than an organization-scoped event type, a bundle's `organizationId` that differs from its event type's, or an existing event type ID of another organization in `createEventType`. | `createBooking`, `createProvisionalBooking`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` (to `confirmed`), `createEventType`, `linkResourceToEventType`, `setResourcesForEventType`, `setEventTypesForResource` |
| `SCHEDULE_NOT_FOUND` | No schedule has this ID. | `updateSchedule`, `deleteSchedule` |
| `SCHEDULE_ALREADY_EXISTS` | A schedule with this ID exists. | `createSchedule` |
| `DATE_OVERRIDE_NOT_FOUND` | The date override no longer exists. | `updateDateOverride`, `deleteDateOverride` |
| `BOOKING_NOT_FOUND` | No booking has this ID or UID. | `getBookingByToken`, `cancelBookingByToken`, `rescheduleBookingByToken`, `rescheduleBooking`, `cancelReservation`, `cancelMultiResourceBooking`, `expireProvisionalBooking`, `transitionBookingState` |
| `INVALID_TOKEN` | The management token does not belong to the booking. | `getBookingByToken`, `cancelBookingByToken`, `rescheduleBookingByToken` |
| `INVALID_STATE` | The booking's status does not allow the operation, such as cancelling a cancelled booking or moving a completed one. | `cancelBookingByToken`, `cancelReservation`, `cancelMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `transitionBookingState` |
| `HOOK_NOT_FOUND` | The hook no longer exists. | `updateHook`, `unregisterHook` |
| `INVALID_RANGE` | The end is not after the start, or an instant is beyond what a `Date` can hold. | `createBooking`, `createProvisionalBooking`, `createReservation`, `createMultiResourceBooking`, `rescheduleBooking`, `rescheduleBookingByToken`, `getAvailability`, `checkMultiResourceAvailability` |
| `INVALID_INPUT` | An argument without a valid meaning: a date that does not exist, `dateFrom` after `dateTo`, an event length that is not a positive number, slot indices outside 0–95, a time zone `Intl` rejects, malformed or overlapping hours, an empty or duplicate resource list, a quantity that is not a positive integer, a hook event type or function handle the component does not accept, or a `limit` or `cursor` out of range. | `getDaySlots`, `getMonthAvailability`, `getEffectiveAvailability`, the schedule, date-override, resource and event-type writes, `listDateOverrides`, `getDateOverride`, `createMultiResourceBooking`, `checkMultiResourceAvailability`, `registerHook`, `updateHook`, `maintenance.audit`, `maintenance.backfillBookingOrganizations`, `presence.sweepOrphanedHolds` |
