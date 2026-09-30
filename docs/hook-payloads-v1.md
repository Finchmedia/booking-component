# Hook payloads, version 1

<!-- Generated from the pins in src/component/hook-payloads-v1.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/component/hook-payloads-v1.test.ts -u`. -->

A hook registered with `registerHook` without `payloadVersion` runs its function handle with the
event's payload as the function's arguments. The payload depends on the function that emitted the
event, not only on the event type: `booking.cancelled` has four shapes. A handler with an argument
validator must accept every shape of its event, and an added key fails such a validator just like
a missing one, so each emitter keeps the shape below within version 1. Register with
`payloadVersion: 2` for one shape per event ([version 2](hook-payloads-v2.md)).

Payloads contain booker contact details and, where shown, the booking's management token.
Register hooks only from trusted server code.

- Values a booking or call does not have are left out, never sent as `null`. Legacy
  `createReservation` rows have no `managementToken` and no `organizationId`, bookings without an
  organization have no `organizationId`, and `transitionBookingState` sends `reason` only when the
  call passes one. `?` marks the keys the pinned calls show both ways; treat `managementToken` and
  `organizationId` as optional for every emitter, and `reason` for `transitionBookingState`.
- Hooks registered without `organizationId` receive every event of their type. Hooks registered
  for an organization receive the events of that organization's bookings only. A booking belongs
  to its event type's organization when that has one; a booking stored before 0.5.0 with another
  one or none is given it before its next event.
- `createBooking` for an event type that requires confirmation emits `booking.created` with
  `status: "pending"`. `booking.pending` comes only from `transitionBookingState`.
- `createProvisionalBooking` and `expireProvisionalBooking` emit no event. `presence.timeout` is
  accepted by `registerHook` but never emitted.
- A move emits `booking.rescheduled` only, not `booking.cancelled` for the original.

## booking.created

### createBooking

```ts
{
  bookerEmail: string;
  bookerName: string;
  bookingId: string;
  end: number;
  eventTitle: string;
  eventTypeId: string;
  managementToken: string;
  resourceId: string;
  start: number;
  status: string;
  timezone: string;
  uid: string;
}
```

### createMultiResourceBooking

```ts
{
  bookerEmail: string;
  bookerName: string;
  bookingId: string;
  end: number;
  eventTitle: string;
  eventTypeId: string;
  isMultiResource: boolean;
  managementToken: string;
  resourceId: string;
  resources: Array<{
    quantity?: number;
    resourceId: string;
  }>;
  start: number;
  status: string;
  timezone: string;
  uid: string;
}
```

### createReservation

Reaches global hooks only: these bookings have no organization.

```ts
{
  bookerEmail: string;
  bookingId: string;
  end: number;
  resourceId: string;
  start: number;
  status: string;
}
```

## booking.pending

### transitionBookingState

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  managementToken: string;
  previousStatus: string;
  start: number;
  timezone: string;
  uid: string;
}
```

## booking.confirmed

### transitionBookingState

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  managementToken: string;
  previousStatus: string;
  start: number;
  timezone: string;
  uid: string;
}
```

## booking.declined

### transitionBookingState

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  managementToken: string;
  previousStatus: string;
  reason: string;
  start: number;
  timezone: string;
  uid: string;
}
```

## booking.cancelled

### cancelReservation

```ts
{
  bookerEmail: string;
  bookerName: string;
  bookingId: string;
  end: number;
  eventTitle: string;
  eventTypeId: string;
  previousStatus: string;
  resourceId: string;
  start: number;
  status: string;
  timezone: string;
}
```

### cancelBookingByToken

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  previousStatus: string;
  reason: string;
  start: number;
  timezone: string;
}
```

### transitionBookingState

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  managementToken?: string;
  previousStatus: string;
  start: number;
  timezone: string;
  uid: string;
}
```

### cancelMultiResourceBooking

```ts
{
  bookerEmail: string;
  bookerName: string;
  bookingId: string;
  cancelledBy?: string;
  end: number;
  eventTitle: string;
  eventTypeId: string;
  isMultiResource: boolean;
  previousStatus: string;
  reason?: string;
  resourceId: string;
  start: number;
  status: string;
  timezone: string;
}
```

## booking.rescheduled

### rescheduleBooking

```ts
{
  bookerEmail: string;
  bookerName: string;
  eventTitle: string;
  isMultiResource: boolean;
  managementToken?: string;
  newBookingId: string;
  newEnd: number;
  newStart: number;
  oldEnd: number;
  oldStart: number;
  originalBookingId: string;
  resources: Array<{
    quantity: number;
    resourceId: string;
  }>;
  timezone: string;
  uid: string;
}
```

### rescheduleBookingByToken

```ts
{
  bookerEmail: string;
  bookerName: string;
  eventTitle: string;
  isMultiResource: boolean;
  managementToken: string;
  newBookingId: string;
  newEnd: number;
  newStart: number;
  oldEnd: number;
  oldStart: number;
  originalBookingId: string;
  resources: Array<{
    quantity: number;
    resourceId: string;
  }>;
  timezone: string;
  uid: string;
}
```

## booking.completed

### transitionBookingState

```ts
{
  bookerEmail: string;
  bookerName: string;
  booking: StoredBooking;
  bookingId: string;
  end: number;
  eventTitle: string;
  managementToken: string;
  previousStatus: string;
  start: number;
  timezone: string;
  uid: string;
}
```

## StoredBooking

`booking` is the stored booking document as it was before the change, with `status` set to the
new status and, when the change gave the booking its event type's organization, that
`organizationId`. Besides the keys below it carries `bookerPhone`, `bookerNotes` and
`eventDescription` when the booking has them.

```ts
{
  _creationTime: number;
  _id: string;
  actorId: string;
  bookerEmail: string;
  bookerName: string;
  createdAt: number;
  end: number;
  eventTitle: string;
  eventTypeId: string;
  location: {
    type: string;
    value?: string;
  };
  managementToken?: string;
  organizationId?: string;
  rescheduleUid?: string;
  resourceId: string;
  start: number;
  status: string;
  timezone: string;
  uid: string;
  updatedAt: number;
}
```
