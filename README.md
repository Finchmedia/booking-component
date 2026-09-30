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
The package requires Convex 1.46 or newer. Use Node 24 LTS for development.

```sh
npm install @mrfinch/booking convex@^1.46.0
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
npm install convex-helpers@^0.1.124 react-hook-form@^7.88.0 @hookform/resolvers@^5.9.1 lucide-react@^1.47.0
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
  message; other failures show a generic message, never Convex transport text.
  `onBookingError(error, { phase })` also reports each failure to your app. If
  you already toast mutation errors, move that into `onBookingError` so users
  see one message. `UNAUTHENTICATED` goes to `onAuthRequired` when you pass it;
  otherwise the Booker asks the user to sign in.
- **Recovery:** if the event type or resource stops being bookable, the Booker
  explains why. Pass `onEventTypeReset(recovery)` and `onNavigate(path, recovery)`
  to offer a way back, and map `recovery` (`"select-event-type"` or
  `"select-resource"`) to your own routes; `path` is a deprecated demo route.
  With the matching callback the error is a modal alert dialog with focus on
  its action, and Escape performs the action. Without it, an inline alert
  replaces the Booker's content and the rest of your page stays usable. An
  invalid duration resets on its own.
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
  imports. It loads in Node, in Vitest without `server.deps.inline`, and in
  webpack 5, Rspack, Next.js and Vite builds, and keeps its types under
  `moduleResolution: "bundler"` or `"nodenext"`.

The Booker and Calendar treat a `null` event type as deleted. Until 0.5.0 the
component's `getEventType` throws `Event type not found: <id>` instead, so make
your public `getEventType` wrapper return `null` for that error:

```ts
try {
  return await ctx.runQuery(components.booking.public.getEventType, args);
} catch (error) {
  if (error instanceof Error && error.message.includes("Event type not found")) return null;
  throw error;
}
```

Like any Convex `useQuery` consumer, the Booker rethrows other query errors
during rendering, so place it inside an error boundary.

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
`getBookingByUid`, `getBookingByToken`, `listBookings` and
`multi_resource.getBookingWithItems`. Give the token to the booker only. Host
functions that serve these results to other callers must remove it, because a
UID alone must never be enough to obtain it.

**Registering a hook is an administrator action.** A hook's function handle
runs for every matching event, and its payload carries the booker's contact
details and, for most events, the management token. Keep `registerHook`,
`updateHook` and `unregisterHook` behind server-side administrator checks.
Payloads differ per emitting function; handlers with argument validators must
accept the [version 1 payload shapes](https://github.com/Finchmedia/booking-component/blob/main/docs/hook-payloads-v1.md).

The optional `makeInternalBookingAPI(components.booking)` factory creates only
internal queries and mutations. Its exports are accessed through `internal.*`.
The old public `makeBookingAPI` factory was removed in 0.4.0; migrate public
endpoints to authorized host wrappers.

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
  event-type lengths, and afterwards run the `maintenance.audit` checks; see
  the CHANGELOG.
- **Bundles and pools:** reserve several resources atomically through the
  [multi-resource API](https://convexbooking.dev/docs/guides#multi-resource-booking).
  Pool quantities use this API; ordinary single-resource flows reject pools.
  A bundle created without `organizationId` belongs to its event type's
  organization. After upgrading from 0.4.2 or earlier, run
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

- **Schedule arguments:** pass `scheduleId` to `getMonthAvailability` and
  `getDaySlots` and omit `resourceTimezone` and `availableSlots`. The
  component then reads the schedule's hours, date overrides included, in the
  schedule's timezone. The older shapes keep their 0.4.2 answers: `getDaySlots`
  uses `availableSlots` only together with `resourceTimezone`; otherwise, and
  for `scheduleId: ""`, the legacy 09:00–17:00 UTC window applies. An unknown
  `scheduleId` means 09:00–17:00 in `resourceTimezone`, or UTC without one.
  These fallbacks can open days the schedule keeps closed. A
  `resourceTimezone` that differs from the schedule's timezone is used and
  logged. Without `resourceTimezone`, a schedule stored before 0.4.3 with a
  timezone `Intl` rejects is read as if no timezone were given (its hours as
  UTC in the month view, the legacy window in the day view), and that is
  logged; set a valid zone with `updateSchedule`.
- **Booking lists:** `listBookings({ resourceId })` lists the bookings whose
  primary resource is `resourceId`. A bundle's primary resource is its first
  item; its other resources, pools included, do not list it, although their
  availability counts it.
- **Updates:** update mutations change the fields you pass and keep every
  omitted one, so a field cannot be removed once set. Descriptions and an
  event type's `lengthInMinutesOptions` can be emptied with `""` and `[]`; an
  event type's `scheduleId` and numeric settings cannot be cleared.
- **Deletes:** `deleteResource` and `deleteEventType` keep the rows that link
  resources and event types. Also call
  `resource_event_types.deleteAllLinksForResource` or
  `deleteAllLinksForEventType`: otherwise a resource or event type created
  later with the same ID is linked, and bookable, as before.
  `makeInternalBookingAPI` does not wrap these two mutations.
- **Concurrency:** all bookings of one resource on one UTC day share an
  availability document, which keeps overlap checks atomic. Convex serializes
  and retries concurrent writes to it; a busy pool is the likely hotspot.
  `npx convex insights` reports `occRetried` and `occFailedPermanently` for
  `daily_availability` and `quantity_availability`.

## Host responsibilities

- **Booking eligibility:** `createBooking` and `createProvisionalBooking`
  check that the event type and resource exist, are active and are linked.
  `createMultiResourceBooking` checks only that the event type exists and
  counts an unknown resource ID as a one-unit standalone resource.
  `rescheduleBooking`, `rescheduleBookingByToken` and confirmations through
  `transitionBookingState` check none of this again, and no function compares
  the organizations of event type and resource. If your host offers bundles,
  moves or approvals, check these rules before calling the component.
- **Policy:** resource visibility, opening-hours policy, notice periods and
  abuse limits. The quickstart gateway implements common defaults. Buffer
  fields are stored settings; enforce any required gaps in your host's reads
  and writes.
- **Email recipients:** anyone who can create a booking through your host can
  have your sender mail any address. Decide the recipient policy, such as
  address verification, rate limits or a CAPTCHA, before enabling email for
  public booking.
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
