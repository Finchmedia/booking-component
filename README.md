# @mrfinch/booking

[![npm version](https://badge.fury.io/js/@mrfinch%2Fbooking.svg)](https://www.npmjs.com/package/@mrfinch/booking)
[![Convex Component](https://www.convex.dev/components/badge/mrfinch/booking)](https://www.convex.dev/components/mrfinch/booking)

Booking and availability for Convex apps. Reserve rooms, people or equipment;
combine resources into a booking; and track quantities for interchangeable items.
Use the React Booker or build your own interface.

[Quick Start](https://convexbooking.dev/docs/getting-started) ·
[API Reference](https://convexbooking.dev/docs/api) ·
[Live Demo](https://convexbooking.dev/book)

## Install

Start with an existing [Convex app](https://docs.convex.dev/get-started).
The package requires Convex 1.46 or newer and `convex-helpers` (the component's
paginated queries use its paginator). Use Node 24 LTS for development.

```sh
npm install @mrfinch/booking convex@^1.46.0 convex-helpers@^0.1.124
```

Register the component, then run `npx convex dev`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import booking from "@mrfinch/booking/convex.config";

const app = defineApp();
app.use(booking);
export default app;
```

For the optional React UI, also install its peer dependencies. Keep your existing
React 18 or 19 installation and use the matching React DOM version.

```sh
npm install react-hook-form@^7.88.0 @hookform/resolvers@^5.9.1 lucide-react@^1.47.0
```

The package includes Zod 4. Backend-only apps can skip these UI peers.

## Your first booking page

Follow the [Quick Start](https://convexbooking.dev/docs/getting-started) to add the
complete public gateway, its rate-limit table, providers and styling. Run the
[setup seed](https://convexbooking.dev/docs/guides#basic-booking-flow) to create and
link a resource, schedule and event type.

With that setup in place, render the Booker beneath your Convex and
`ConvexQueryCacheProvider` providers:

```tsx
// app/book/page.tsx
"use client";
import { Booker, BookingProvider } from "@mrfinch/booking/react";
import { api } from "@/convex/_generated/api";

export default function BookingPage() {
  return (
    <BookingProvider publicApi={api.public}>
      <Booker eventTypeId="quick-meeting" resourceId="meeting-room" title="Book a Meeting" />
    </BookingProvider>
  );
}
```

The Booker handles date, duration and slot selection, contact details and
confirmation for one exclusive resource. Use `onBookingComplete(booking)` to
connect your management pages to the returned booking UID and secret token.

## Booker behavior

- **Errors:** a failed booking or reschedule appears in an announced alert, on
  the details step or above the calendar for one-click reschedules. Throw
  `ConvexError({ code, message })` from your host functions to show a specific
  message. The component's own errors have that shape too, so one your host
  function lets through shows the component's text; catch it there to word it
  for your users. An error with a component `code` but no `message` shows a
  generic text for that code (for example `SLOT_UNAVAILABLE`: "This time is no
  longer available. Please choose another time."). Other failures show a
  generic message, never Convex transport text.
  `onBookingError(error, { phase })` also reports each failure to your app. If
  you already toast mutation errors, move that into `onBookingError` so users
  see one message. `UNAUTHENTICATED` goes to `onAuthRequired` when you pass it;
  otherwise the Booker asks the user to sign in.
- **Recovery:** if the event type or resource stops being bookable, the Booker
  explains why. Pass `onEventTypeReset()` and `onNavigate(path)` to offer a way
  back. `onNavigate` is called when the resource is gone; `path` is a deprecated
  demo route, so navigate to your own resource page. With the matching callback
  the error is a modal alert dialog with focus on its action, and Escape
  performs the action. Without it, an inline alert replaces the Booker's
  content and the rest of your page stays usable. An invalid duration shows a
  dialog whose Reset Calendar action is built in (no callback needed). When
  rescheduling, the error is an inline notice above the calendar and does not
  block the move; your reschedule function decides. If you use
  `useBookingValidation` yourself, map `error.recovery` to your own routes
  instead of the deprecated `recoveryPath`.
- **Accessibility:** durations are a native radio group, form fields are named
  by their labels and expose required and invalid state, reserved slots keep
  their time in their name, and day buttons name the full date and mark today
  and the selected day. Each step change moves focus to the new step's heading.
  The error dialog is a native `dialog` opened with `showModal()`, so it renders
  above your page.
- **Calendar days and time zones:** the Calendar asks your `getMonthAvailability`
  and `getDaySlots` functions for `"YYYY-MM-DD"` dates. Each date is a day of the
  resource's schedule, in the schedule's time zone. Slot times are shown in the
  visitor's time zone, or the stored zone of the booking being rescheduled, and
  today and past days are judged in that zone. A time zone selector and the
  event type's `lockTimeZoneToggle` are not implemented yet.
- **Module loading:** `@mrfinch/booking/react` is ESM with fully specified
  imports. It loads in Node and in Vitest without `server.deps.inline`, and
  keeps its types under `moduleResolution: "bundler"` or `"nodenext"`. The
  extensionless relative imports that plain webpack 5 and Rspack builds could
  not resolve ("Can't resolve './context'") are gone.

The Booker and Calendar treat a `null` event type as deleted, so your public
`getEventType` must return `null` for a missing event type. The component's
`getEventType` does so from 0.5.0: a wrapper that returns its result needs
nothing more, and the 0.4.3 workaround that caught `Event type not found` can
go. A wrapper that throws for a missing event type sends the Booker to your
error boundary instead of its "deleted" notice.

Like any Convex `useQuery` consumer, the Booker rethrows other query errors
during rendering, so place it inside an error boundary.

### Host contract

`BookingProvider` checks `publicApi`, usually your generated `api.public`,
against `PublicBookingAPI` at compile time. The components call the 11
required functions below. Each must accept every argument listed, must not
require any other, and must return at least the fields listed. Extra optional
arguments and extra result fields are fine, so the component's own documents
and redacted results both pass.

| Required | Kind | Called by | Arguments the components send | Result fields read |
| --- | --- | --- | --- | --- |
| `getEventType` | query | Booker, Calendar | `eventTypeId` | `EventTypeView`, or `null` when missing |
| `getResource` | query | Booker | `id` | `isActive`, or `null` when missing |
| `hasResourceEventTypeLink` | query | Booker | `resourceId`, `eventTypeId` | `boolean` |
| `getMonthAvailability` | query | Calendar (`useConvexSlots`) | `resourceId`, `dateFrom`, `dateTo`, `eventLength`, `slotInterval`; with `availabilityContext` also the optional `eventTypeId` and `rescheduleContext` | `MonthSlots`, a boolean per date |
| `getDaySlots` | query | Calendar (`useConvexSlots`) | `resourceId`, `date`, `eventLength`, `slotInterval`; with `availabilityContext` also the optional `eventTypeId` and `rescheduleContext` | `time` of each slot |
| `getDatePresence` | query | Calendar (`useConvexSlots`) | `resourceId`, `date` | `slot`, `user` of each hold |
| `getPresence` | query | `useSlotPresence` hook | `resourceId`, `slot` | `user` of each hold |
| `createBooking` | mutation | Booker | `eventTypeId`, `resourceId`, `start`, `end`, `timezone`, `booker`, `location` | `BookingView` |
| `rescheduleBookingByToken` | mutation | Booker when rescheduling | `uid`, `token`, `newStart`, `newEnd` | `BookingView` |
| `heartbeat` | mutation | Booker (`useSlotHold`) | `resourceId`, `slots`, `user`, `eventTypeId` (optional) | nothing |
| `leave` | mutation | Booker (`useSlotHold`) | `resourceId`, `slots`, `user` | nothing |

Arguments marked optional are not always sent: declare them with
`v.optional(…)`. `EventTypeView` is `id`, `title` and `lengthInMinutes`, plus
`description`, `lengthInMinutesOptions`, `slotInterval`, `locations`,
`isActive` and `lockTimeZoneToggle` where set. `BookingView` is `uid`,
`status` (a `BookingStatus`, so a returns validator declares it with
`bookingStatusValidator`, not `v.string()`), `start`, `end`, `timezone` and
`bookerName`; the Booker hands it to `onBookingComplete`, with whatever else
your function returns. `BookingUIOperations` holds the same list as types.

| Optional | Notes |
| --- | --- |
| `getEventTypeBySlug`, `listEventTypes`, `listResources`, `getEventTypesForResource`, `getAvailability`, `getEffectiveAvailability` | Not called by the components. |
| `getBooking`, `getBookingByUid` | Not called. Authorized host code only: a UID is not a credential. |
| `getBookingByToken`, `cancelBookingByToken` | Not called. Check the management token. |

`publicApi` need not have the optional ones. `useBookingAPI()` returns them
without argument types and as possibly `undefined`; call your own
`api.public` references to keep their types.

If `BookingProvider` rejects your `api.public`, check the gateway on its own
with the exported contract type:

```ts
import type { PublicBookingAPI } from "@mrfinch/booking/react";
import { api } from "@/convex/_generated/api";

export const bookingPublicApi = api.public satisfies PublicBookingAPI;
```

The error names the function that does not fit, as in
`The types of 'getDaySlots._fn' are incompatible`, and for arguments lists
the keys it declares next to the keys the components send. One function at a
time works too:
`api.public.getDaySlots satisfies PublicBookingAPI["getDaySlots"]`. The error
on the `BookingProvider` element itself can name
`PublicBookingAPIWithAvailabilityContext` and a different function, because
TypeScript tries both props variants. With `availabilityContext` on, check
against `PublicBookingAPIWithAvailabilityContext`.

### Admin gateway

`adminApi`, usually your generated `api.admin`, supplies the operations of
`AdminBookingAPI` (`createResource`, `listBookings`, `createSchedule`,
`transitionBookingState`, …) and nothing else. Pass it only where admin
operations are used:

```tsx
// app/admin/layout.tsx
<BookingProvider publicApi={api.public} adminApi={api.admin}>
  {children}
</BookingProvider>
```

- Each operation comes from the gateway that owns it: public operations only
  from `publicApi`, admin operations only from `adminApi`.
- Without `adminApi`, `useBookingAPI().createResource` and the other admin
  operations are `undefined`. `publicApi` never stands in for them.
- A hand-built `adminApi` object never overrides a public operation, even one
  it defines, and names outside both interfaces are not passed through. To
  route a public operation to another function, pass a hand-built `publicApi`
  object that lists the required operations one by one; a generated
  `api.public` is a proxy and cannot be spread.
- `useBookingAPI()` returns admin operations untyped, for components that take
  them from the provider. In your own pages,
  `useMutation(api.admin.createResource)` keeps your generated argument types.
- The gateways choose which functions the UI calls; they are not access
  control. Every admin function checks the caller's role and organization
  itself, as in the
  [authorization guide](https://convexbooking.dev/docs/authentication).

### Availability context (opt-in)

By default `getDaySlots` and `getMonthAvailability` receive the 0.4.x
arguments, so your host does not know which event type is selected or which
booking is being moved. A reschedule then cannot offer times that overlap the
booking being moved. With
`<BookingProvider publicApi={api.public} availabilityContext>` the Calendar
and `useConvexSlots` add two optional arguments to both functions:
`eventTypeId`, the selected event type, and, while the Booker reschedules,
`rescheduleContext: { uid, token }`, the booking being moved and its
management token. Presence functions never receive the token.

Both functions must then declare both arguments as optional
(`PublicBookingAPIWithAvailabilityContext`); `BookingProvider` rejects a
`publicApi` without them at compile time. Pass `rescheduleContext` on
unchanged: the component frees the moved booking's own time only when the
token matches it, and otherwise ignores it. Never turn it into
`excludeBookingUid`, which trusts any UID and is meant for trusted server
code, and never log or return either value.

Before you set `availabilityContext`, declare
`eventTypeId: v.optional(v.string())` and
`rescheduleContext: v.optional(v.object({ uid: v.string(), token: v.string() }))`
in the argument validators of both host slot wrappers, `getDaySlots` and
`getMonthAvailability`, pass `rescheduleContext` on as below, and deploy them
before the page that sets the prop: a validator without them rejects every
slot query the Calendar sends.
[Host functions](https://github.com/Finchmedia/booking-component/blob/main/docs/host-functions.md#slot-queries-while-rescheduling)
shows the complete wrapper. The Booker takes the token from
`originalBooking.managementToken`, which rescheduling already needs. If these
functions accept `excludeBookingUid` from the browser today, remove it: with
it any caller can make any booking's time show as free.

```ts
export const getDaySlots = query({
  args: {
    resourceId: v.string(), date: v.string(), eventLength: v.number(), slotInterval: v.number(),
    eventTypeId: v.optional(v.string()),
    rescheduleContext: v.optional(v.object({ uid: v.string(), token: v.string() })),
  },
  handler: async (ctx, { eventTypeId, ...args }) => {
    // Your access and policy checks; the event type's schedule, for example
    const eventType = eventTypeId
      ? await ctx.runQuery(components.booking.public.getEventType, { eventTypeId })
      : null;
    return await ctx.runQuery(components.booking.public.getDaySlots, {
      ...args, // includes rescheduleContext: the component checks the token
      scheduleId: eventType?.scheduleId,
    });
  },
});
```

A custom calendar passes the context to `Calendar` as `rescheduleContext`
(it sends its `eventTypeId` itself) or to `useConvexSlots` as its seventh
argument, `{ eventTypeId, rescheduleContext }`. Both are sent only with the
opt-in.

## Backend integration

Browser clients call **your host functions**. Those functions check access and
booking policy before calling `components.booking.*`. The component maintains
inventory and booking records in its own database.

For example, inside an authorized host function:

```ts
const resource = await ctx.runQuery(components.booking.resources.getResource, {
  id: "meeting-room",
});
```

Import `components` from your host's `./_generated/api`. Its generated types
provide the version-matched arguments and return values. See the
[API reference](https://convexbooking.dev/docs/api) for schedule-aware queries,
booking operations, metadata and hooks.

Protect administration with role and organization checks. Protect booking details
with ownership checks or management tokens. Keep resets and seed functions
internal. The [authorization guide](https://convexbooking.dev/docs/authentication)
includes a complete administrator example.

**Management tokens are bearer secrets.** Whoever holds a booking's UID and
`managementToken` can read, cancel and reschedule it through
`getBookingByToken`, `cancelBookingByToken` and `rescheduleBookingByToken`.
Every booking document the component returns contains the token and the
booker's contact details: `createBooking`, `createProvisionalBooking`,
`createMultiResourceBooking`, `rescheduleBooking` and
`rescheduleBookingByToken` (a move keeps the token), `getBooking`,
`getBookingByUid`, `getBookingByToken`, `listBookings`, `listBookingsPage`
and `multi_resource.getBookingWithItems`. Give the token to the booker only.
Host functions that serve these results to other callers must remove it,
because a UID alone must never be enough to obtain it.

**Registering a hook is an administrator action.** A hook's function handle
runs for every matching event, and its payload carries the booker's contact
details. Keep `registerHook`, `updateHook` and `unregisterHook` behind
server-side administrator checks. Register with `payloadVersion: 2` to receive
[one shape per event](https://github.com/Finchmedia/booking-component/blob/main/docs/hook-payloads-v2.md),
without the management token: a handler can declare `args: bookingHookEventV2`
from `@mrfinch/booking`. Without it a hook keeps the frozen
[version 1 payloads](https://github.com/Finchmedia/booking-component/blob/main/docs/hook-payloads-v1.md),
which differ per emitting function and for most events carry the token.

The optional `makeInternalBookingAPI(components.booking)` factory creates only
internal queries and mutations. Its exports are accessed through `internal.*`.
The old public `makeBookingAPI` factory was removed in 0.4.0; migrate public
endpoints to authorized host wrappers.

[Host functions](https://github.com/Finchmedia/booking-component/blob/main/docs/host-functions.md)
shows two wrappers whose arguments need care: slot queries that forward a
booker's `rescheduleContext`, and paged booking lists. After an upgrade, run
the read-only `maintenance.audit` checks from an internal function and repair
what they list;
[maintenance](https://github.com/Finchmedia/booking-component/blob/main/docs/maintenance.md)
shows how and lists every check with its repair.

## Supported behavior

- **Schedules:** weekly hours, date overrides and IANA timezones. Booking timestamps
  use Unix milliseconds; inventory uses a 15-minute grid. Calendar dates in the
  availability queries are days in the timezone of the resource's schedule
  (UTC days in the legacy fallback), and weekly hours apply to each day's own
  weekday. Slot times are
  instants, which the Booker shows in the visitor's timezone. On DST changes a
  local time that does not exist is not offered, a repeated one means its first
  occurrence, and a window closes when its last existing quarter hour ends, so
  bookings end by then. Before upgrading from 0.4.2 or earlier, check your
  event-type lengths. The `maintenance.audit` checks list the stored
  configuration and bookings 0.5.0 treats differently, such as bookings it
  will not move or confirm: run them with 0.5.0 on a copy of your data
  before upgrading, and on production after; see the CHANGELOG and
  [maintenance](https://github.com/Finchmedia/booking-component/blob/main/docs/maintenance.md).
- **Bundles and pools:** reserve several resources atomically through the
  [multi-resource API](https://convexbooking.dev/docs/guides#multi-resource-booking).
  Pool quantities use this API; ordinary single-resource flows reject pools.
  A bundle belongs to its event type's organization: an `organizationId` that
  differs is rejected. For an event type without organization the argument
  is used, and it must be the organization of the booked resources, which
  all belong to one. After upgrading from 0.4.2 or earlier, run
  `maintenance.backfillBookingOrganizations` once to fill that organization on
  older bundles; see the CHANGELOG.
- **Lifecycle:** confirmation, decline, cancellation and atomic rescheduling.
  Your host controls the expiry of provisional bookings.
- **Presence:** temporary selection indicators. The final booking mutation checks
  inventory; presence does not guarantee a reservation. An explicit leave
  releases a selection immediately. An abandoned one (closed tab, lost
  connection) is released 10–20 s after its last heartbeat, plus scheduler
  latency. After upgrading from 0.4.2 or earlier, run
  `presence.sweepOrphanedHolds` once; see the CHANGELOG.
- **Email:** optional Resend notifications and token-based management links.
  Follow the [email guide](https://convexbooking.dev/docs/integrations/email).
  To use your app's own design, add an optional [email renderer](https://github.com/Finchmedia/booking-component/blob/main/docs/custom-emails.md).
  One component instance sends through one Resend account: queued mail goes
  out in batches with the most recent API key. Rotating the key is fine; keys
  of different accounts are not supported, because a key Resend rejects fails
  every mail in its batch. Built-in mail goes to the booker's address as
  entered, unverified. The
  [renderer guide](https://github.com/Finchmedia/booking-component/blob/main/docs/custom-emails.md#one-resend-account)
  covers key rotation and several accounts.

## Details to rely on

- **Booking rules:** `createBooking`, `createProvisionalBooking`,
  `createMultiResourceBooking` (for every item), `rescheduleBooking`,
  `rescheduleBookingByToken` and the transitions that complete a hold or a
  request through `transitionBookingState` (a provisional hold or a pending
  request to `confirmed`, a provisional hold to `pending`) check the current
  configuration: the event type and every
  resource exist and are active, each resource is linked to the event type
  and belongs to its organization when it has one, and one resource is not
  an add-on (`isStandalone: false`). A booking belongs to its event type's
  organization; under an event type without organization its resources
  belong to one organization, and a bundle's `organizationId`, when given, is
  theirs. A move gives the new booking its event type's organization. A
  bundle's primary resource is its first item and may be an
  add-on. There is no administrator override: to move, confirm or submit a
  hold after deactivating or unlinking, reactivate or relink first.
  Cancelling, declining and expiring are always allowed, and deactivating
  never ends an existing booking. The legacy `createReservation` path checks
  none of this, and its bookings keep that exemption when moved.
- **Schedule arguments:** pass `scheduleId` to `getMonthAvailability` and
  `getDaySlots` and omit `resourceTimezone` and `availableSlots`. The
  component then reads the schedule's hours, date overrides included, in the
  schedule's timezone. `getDaySlots` also takes `availableSlots` with
  `scheduleId`, or together with `resourceTimezone`. Without any of these
  arguments (`""` counts as omitted) the legacy 09:00–17:00 UTC window
  applies. Other shapes throw instead of opening days the schedule keeps
  closed: `resourceTimezone` alone, `availableSlots` without a zone and a
  `resourceTimezone` that differs from the schedule's timezone
  (`INVALID_INPUT`), and an unknown `scheduleId` (`SCHEDULE_NOT_FOUND`, also
  from `getEffectiveAvailability`). A schedule stored before 0.4.3 with a
  timezone `Intl` rejects has its hours read as UTC, or in a given
  `resourceTimezone`, and that is logged; set a valid zone with
  `updateSchedule`.
- **Reschedule availability:** while a booker moves a booking, pass
  `rescheduleContext: { uid, token }` (the booking's UID and management token)
  to `getDaySlots` and `getMonthAvailability`. The booking's own slots then
  count as free, so a move that overlaps its current time is offered. A token
  that does not match a pending or confirmed booking with that UID on the
  queried resource excludes nothing and is no error; no other booking is ever
  freed, and neither value appears in results or logs. `excludeBookingUid`
  does the same from a UID alone: pass it only from trusted host code, never
  from client input. Passing both throws `INVALID_INPUT`.
  [Host functions](https://github.com/Finchmedia/booking-component/blob/main/docs/host-functions.md#slot-queries-while-rescheduling)
  shows a wrapper.
- **Schedule references:** an event type's `scheduleId` names an existing
  schedule (or is `""`); `createEventType` and `updateEventType` reject
  others, and `deleteSchedule` refuses while an event type uses the schedule
  (`SCHEDULE_IN_USE`).
- **Statuses:** a booking is `provisional`, `pending`, `confirmed`,
  `cancelled`, `declined` or `completed`, and the schema stores no other
  value. For host types, validators and filters, `@mrfinch/booking` exports
  `BOOKING_STATUSES`, the `BookingStatus` type, `bookingStatusValidator` and
  the guard `isBookingStatus`; `@mrfinch/booking/react` types
  `Booking.status` and `BookingView.status` with the same `BookingStatus`
  and exports it too. A moved original is `cancelled` with
  `rescheduledToUid` set.
- **Booking lists:** `listBookings({ resourceId })` lists the bookings whose
  primary resource is `resourceId`. A bundle's primary resource is its first
  item; its other resources, pools included, do not list it, although their
  availability counts it. `listBookingsPage` pages through one
  organization's, resource's or event type's bookings with cursors
  (`paginationOpts`); page it reactively from a host query with
  `usePaginatedQuery` from `convex-helpers/react`. Filtered pages can be
  short or empty before the end: continue until `isDone`.
  [Host functions](https://github.com/Finchmedia/booking-component/blob/main/docs/host-functions.md#paged-booking-lists)
  shows a wrapper.
- **Updates:** update mutations change the fields you pass and keep every
  omitted one. `updateEventType` removes `description`, `scheduleId`,
  `bufferBefore`, `bufferAfter`, `minNoticeMinutes` and `maxFutureMinutes`
  given `null`; other fields cannot be removed once set, but descriptions and
  `lengthInMinutesOptions` can be emptied with `""` and `[]`.
- **Input rules:** event-type lengths, length options and slot intervals are
  whole minutes above 0, buffers and notice 0 or more, `maxFutureMinutes`
  above 0, and the length is one of its options when there are any; an
  update that changes only the length or only the options is checked
  against the stored other field. A date override is `unavailable`, or
  `custom` with at least one window. `getMonthAvailability` answers at most
  93 days and `getAvailability` at most 366 days per call; bookings
  themselves have no length cap. New bookings need a valid IANA `timezone`
  and a syntactically valid booker email. Violations throw `INVALID_INPUT`
  (`INVALID_RANGE` for the `getAvailability` cap).
- **Links and deletes:** an event type with an `organizationId` links only
  resources of that organization (`ORGANIZATION_MISMATCH`); an event type
  without one links any resource. `deleteResource` and `deleteEventType`
  delete the deleted ID's links, so a resource or event type created later
  with the same ID starts unlinked. Links left behind by deletes before 0.5.0
  are removed with `resource_event_types.deleteAllLinksForResource` or
  `deleteAllLinksForEventType`, which `makeInternalBookingAPI` does not wrap.
- **Concurrency:** all bookings of one resource on one UTC day share an
  availability document, which keeps overlap checks atomic. Convex serializes
  and retries concurrent writes to it; a busy pool is the likely hotspot.
  `npx convex insights` reports `occRetried` and `occFailedPermanently` for
  `daily_availability` and `quantity_availability`.
- **Errors:** expected failures, such as a taken slot or a wrong management
  token, throw `ConvexError({ code, message })`. The
  [codes](https://github.com/Finchmedia/booking-component/blob/main/docs/errors.md)
  are public contract, listed with the functions that throw them; `message`
  is English text for logs and administrators.
  In host functions, `isBookingError(error)` from `@mrfinch/booking` checks for
  one, and `error.data.code` selects the text you show. Other failures are
  plain `Error`s.

## Host responsibilities

The component enforces the booking rules, inventory and input checks above.
Everything else is policy that your host functions enforce before they call
it:

- **Authorization:** the component checks no user identity. Check roles and
  organizations for administration, and ownership or management tokens for
  booking details.
- **Booking policy:** resource visibility, opening-hours policy, notice
  periods and booking horizons. `minNoticeMinutes`, `maxFutureMinutes`,
  `bufferBefore` and `bufferAfter` are stored event-type settings that the
  component validates but does not apply to slots or bookings; enforce
  notice, horizon and any required gaps in your host's reads and writes.
- **Abuse limits:** rate limits and CAPTCHAs for public booking. The
  quickstart gateway implements common defaults.
- **Email recipients:** the component checks only the syntax of a booker's
  email. Anyone who can create a booking through your host can have your
  sender mail any address. Decide the recipient policy, such as address
  verification, rate limits or a CAPTCHA, before enabling email for public
  booking.
- **Secrets:** management tokens and hook registration, as described under
  Backend integration.

## Testing

The package exposes its schema and modules for
[`convex-test`](https://docs.convex.dev/testing/convex-test). Install `convex-test`
and Vitest as development dependencies, then register the component in your host
test before invoking host functions that call it:

```ts
import { convexTest } from "convex-test";
import bookingComponent from "@mrfinch/booking/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const t = convexTest(schema, modules);
bookingComponent.register(t); // default component name: "booking"
```

Pass a second argument to `register(t, name)` if you mounted it under another
name. The `/test` entry point contains TypeScript source; use a bundler-based
runner such as Vitest. Test your host authorization as well as booking lifecycles.

## Development

The [demo and documentation](https://github.com/Finchmedia/convex-booking) live in
a separate repository. In this component repository, run:

```sh
npm ci --strict-peer-deps
npm run build
npm test
npm run typecheck
npm run lint
```

## License

[Apache-2.0](LICENSE)
