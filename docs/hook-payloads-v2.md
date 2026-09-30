# Hook payloads, version 2

<!-- Generated from bookingHookEventV2 (src/shared/hook-events-v2.ts) by src/component/hook-payloads-v2.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/component/hook-payloads-v2.test.ts -u`. -->

Register a hook with `payloadVersion: 2` to receive this payload instead of the
[version 1 shapes](hook-payloads-v1.md). The handle runs with the payload as its arguments. Every
event has the same shape, whichever function emitted it, so a handler can declare
`args: bookingHookEventV2` from `@mrfinch/booking`:

```ts
import { internalMutation } from "./_generated/server";
import { bookingHookEventV2 } from "@mrfinch/booking";

export const onBookingEvent = internalMutation({
  args: bookingHookEventV2,
  handler: async (ctx, event) => {
    // event.event, event.bookingId, event.status, ...
  },
});
```

Register it in a host mutation, once per event name:

```ts
await ctx.runMutation(components.booking.hooks.registerHook, {
  eventType: "booking.cancelled",
  functionHandle: await createFunctionHandle(internal.hooks.onBookingEvent),
  payloadVersion: 2,
});
```

- The payload is built from the booking as the emitting function wrote it. It carries the
  booker's contact details and never the management token; fetch the booking by `bookingId`
  in trusted host code when you need it.
- The shape is frozen within version 2: a key is never added or removed, because either would
  fail a handler that validates its arguments. Keys without a value are left out, never sent as
  `null`.
- Hooks registered without `payloadVersion` keep receiving the version 1 payloads.
- An event queued by 0.4.x and delivered after the upgrade has no version 2 payload; version 2
  hooks skip it with a logged warning.

```ts
{
  version: 2;
  event: "booking.created" | "booking.pending" | "booking.confirmed" | "booking.declined" | "booking.cancelled" | "booking.completed" | "booking.rescheduled";
  bookingId: string;
  uid: string;
  organizationId?: string;
  resourceId: string;
  resourceIds: Array<string>;
  eventTypeId: string;
  status: string;
  previousStatus?: string;
  start: number;
  end: number;
  timezone: string;
  bookerName: string;
  bookerEmail: string;
  eventTitle: string;
  reason?: string;
  changedBy?: string;
  isMultiResource: boolean;
  // booking.rescheduled only: the moved original
  originalBookingId?: string;
  newBookingId?: string;
  previousStart?: number;
  previousEnd?: number;
}
```

## Emitters and values

- `booking.created`: `createBooking` (status `pending` when the event type requires
  confirmation), `createMultiResourceBooking` and `createReservation` (`eventTypeId: "legacy"`).
- `booking.pending`, `booking.confirmed`, `booking.declined` and `booking.completed`:
  `transitionBookingState`.
- `booking.cancelled`: `cancelReservation`, `cancelBookingByToken`, `cancelMultiResourceBooking`
  and `transitionBookingState`.
- `booking.rescheduled`: `rescheduleBooking` and `rescheduleBookingByToken`. The common fields
  describe the new booking; `newBookingId` equals `bookingId`, and `originalBookingId`,
  `previousStart` and `previousEnd` name the moved original.
- `createProvisionalBooking` and `expireProvisionalBooking` emit no event, and `presence.timeout`
  is never emitted.
- `previousStatus` is set by the transitions and cancellations.
- `changedBy` is the actor the booking history records: `"system"` for creations and for moves
  without `changedBy`, `"user"` for `cancelBookingByToken`, `cancelledBy` or `"unknown"` for
  `cancelReservation` and `cancelMultiResourceBooking`, and `changedBy` when given to
  `transitionBookingState`. `createReservation` records none.
- `reason` is the reason given, or the default the function records: `"Cancelled by booker"` for
  `cancelBookingByToken` and `"Rescheduled to new time"` for moves.
