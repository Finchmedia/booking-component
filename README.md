# @mrfinch/booking

[![npm version](https://badge.fury.io/js/@mrfinch%2Fbooking.svg)](https://www.npmjs.com/package/@mrfinch/booking)

Real-time booking component for [Convex](https://convex.dev) with presence-aware slot locking, multi-duration support, and O(1) availability queries.

**Full Documentation:** [convexbooking.dev/docs](https://convexbooking.dev/docs)

## Pre-requisite: Convex

You'll need an existing Convex project to use the component. Convex is a hosted
backend platform, including a database, serverless functions, and a ton more you
can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the
[quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

```sh
npm install @mrfinch/booking
```

Requires `convex >= 1.29.0` in your app. Every component function declares a
return validator, so the generated component API gives you concrete result
types instead of `any`.

Create a `convex.config.ts` file in your app's `convex/` folder and install the
component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import booking from "@mrfinch/booking/convex.config";

const app = defineApp();
app.use(booking);

export default app;
```

## Usage

Create a `booking.ts` file to export the component API:

```ts
// convex/booking.ts
import { components } from "./_generated/api";
import { makeBookingAPI } from "@mrfinch/booking";

export const {
  // Queries
  listResources,
  getResource,
  listSchedules,
  getSchedule,
  getEffectiveAvailability,
  listEventTypes,
  getEventType,
  getMonthAvailability,
  getDaySlots,
  getDatePresence,
  listBookings,
  getBooking,
  getBookingByUid,
  // Mutations
  createResource,
  updateResource,
  deleteResource,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  createDateOverride,
  deleteDateOverride,
  createEventType,
  updateEventType,
  deleteEventType,
  createBooking,
  createProvisionalBooking,
  expireProvisionalBooking,
  cancelReservation,
  // Presence
  heartbeat,
  leave,
  // Maintenance (wrap these in admin-only functions, see below)
  wipeAllBookingData,
  wipeAllData,
  getDailyAvailability,
} = makeBookingAPI(components.booking);
```

Then use the React components:

```tsx
// app/book/page.tsx
import { Booker } from "@mrfinch/booking/react";

export default function BookingPage() {
  return (
    <Booker
      eventTypeId="your-event-type-id"
      resourceId="your-resource-id"
      title="Book a Session"
      description="Select a time that works for you"
    />
  );
}
```

## Schedule-aware availability

Both availability queries work without a schedule — they then fall back to
hardcoded 09:00–17:00 **UTC** business hours. To get real opening hours, pass the
resource's IANA timezone plus the schedule information. The two queries take that
information differently:

`getMonthAvailability` resolves the schedule itself. Pass `resourceTimezone` and
`scheduleId`; weekly hours and date overrides are applied per date. It returns a
`Record<"YYYY-MM-DD", boolean>`.

```ts
const monthMap = useQuery(api.booking.getMonthAvailability, {
  resourceId: "room-1",
  dateFrom: "2026-03-01",
  dateTo: "2026-03-31",
  eventLength: 60,
  slotInterval: 30,
  resourceTimezone: "Europe/Berlin",
  scheduleId: "schedule-1",
});
```

`getDaySlots` does **not** resolve the schedule. Pass `resourceTimezone` and
`availableSlots` — the day's available slot indices in the resource's local
timezone (15-minute grid, `0`–`95`), which you normally read from
`getEffectiveAvailability({ scheduleId, date })`. It returns `[{ time: <epoch ms> }]`.

```ts
const effective = useQuery(api.booking.getEffectiveAvailability, {
  scheduleId: "schedule-1",
  date: "2026-03-17",
});

const slots = useQuery(
  api.booking.getDaySlots,
  effective
    ? {
        resourceId: "room-1",
        date: "2026-03-17",
        eventLength: 60,
        slotInterval: 30,
        resourceTimezone: "Europe/Berlin",
        availableSlots: effective.availableSlots,
      }
    : "skip",
);
```

An empty window (weekend, "unavailable" date override) means the day is closed:
`getMonthAvailability` reports `false` and `getDaySlots` returns `[]`. It does not
fall back to the 09:00–17:00 UTC hours.

### Reschedule flows: `excludeBookingUid`

When a user moves an existing booking, its own slots would otherwise show as
busy. Pass the booking's `uid` as `excludeBookingUid` to either query and those
slots are treated as free:

```ts
const slots = useQuery(api.booking.getDaySlots, {
  resourceId: "room-1",
  date: "2026-03-17",
  eventLength: 60,
  resourceTimezone: "Europe/Berlin",
  availableSlots: effective.availableSlots,
  excludeBookingUid: booking.uid,
});
```

The argument is ignored for an unknown uid, a booking on another resource, or a
booking whose status is not `pending`, `confirmed` or `provisional` — a cancelled
booking already released its slots, and excluding it again would hand out
someone else's slots. It applies to the non-fungible slot bitmap only, not to
pooled (`isFungible`) quantity.

## Resource metadata

Resources carry an optional `metadata` map (`Record<string, string>`) for host
app data the component does not need to understand — a floor, a color, an
external id:

```ts
await ctx.runMutation(api.booking.createResource, {
  id: "room-1",
  organizationId: "org-1",
  name: "Studio A",
  type: "room",
  timezone: "Europe/Berlin",
  metadata: { floor: "2", color: "#e11d48", externalId: "CRM-4711" },
});

// An update REPLACES the whole map …
await ctx.runMutation(api.booking.updateResource, {
  id: "room-1",
  metadata: { floor: "3" }, // color and externalId are gone
});

// … and omitting it keeps the stored map.
await ctx.runMutation(api.booking.updateResource, { id: "room-1", name: "Studio A+" });
```

There is no clear form; write an empty object to empty the map.

## Maintenance / sandbox resets

The component's tables are isolated from the host app — your own `ctx.db` cannot
touch them — so demo sandboxes, seed scripts and fixtures need reset functions
inside the component. Two levels:

- **`wipeAllBookingData()`** deletes `bookings`, `booking_history`,
  `booking_items`, `daily_availability` and `quantity_availability`, and returns
  per-table counts. The setup (resources, schedules, date overrides, event types,
  resource ↔ event type links, hooks) survives, so the calendar is empty but
  immediately bookable again. Use this to reset a demo between runs.
- **`wipeAllData()`** deletes the above **plus** the setup tables, dependents
  first. Use this before re-seeding a sandbox from scratch.

Presence tables are left alone by both: they are transient real-time locks that
expire on their own.

```ts
// convex/admin.ts
export const resetSandbox = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx); // your own check
    return await ctx.runMutation(api.booking.wipeAllBookingData, {});
  },
});
```

> Both wipes are **unauthenticated at the component boundary** — the component
> cannot know who your admins are. Never re-export them as public mutations;
> wrap them in your own admin-only function as above.

`getDailyAvailability({ resourceId, date })` returns the raw `busySlots` array of
one resource/day, or `null` when no row exists. `getDaySlots` only reports the
free slots and says nothing about what is booked, so this is the query to use
when verifying fixtures or debugging a stuck slot.

## Testing

The component ships its schema and modules for [`convex-test`](https://docs.convex.dev/testing/convex-test).
Register it under the same name you used in `convex.config.ts`:

```ts
import { convexTest } from "convex-test";
import { test, expect } from "vitest";
import bookingComponent from "@mrfinch/booking/test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("a booked slot disappears", async () => {
  const t = convexTest(schema, modules);
  bookingComponent.register(t); // defaults to the name "booking"

  // … seed resources/event types through your own API, then:
  const slots = await t.query(api.booking.getDaySlots, {
    resourceId: "room-1",
    date: "2026-03-17",
    eventLength: 60,
  });
  expect(slots.length).toBeGreaterThan(0);
});
```

`register(t, name?)` takes the component name as its second argument if you
mounted it as something other than `booking`. The default export also exposes
`schema` and `modules` if you need them directly. `@mrfinch/booking/test` points
at TypeScript source, so it needs a bundler-based test runner (Vitest) — the
component's own suite runs with `vitest run --typecheck` in the `edge-runtime`
environment.

## Features

- **Real-time Presence** - Slot locking prevents double bookings
- **Multi-Duration Support** - Flexible booking lengths (30min, 1h, 2h, 5h)
- **O(1) Availability Queries** - Scales to millions of bookings
- **ACID Transactions** - Race-condition free via Convex
- **Multi-Resource Booking** - Book rooms, equipment, or people
- **Schedule-aware Availability** - Weekly hours, date overrides, split shifts, IANA timezones

## Links

- [Documentation](https://convexbooking.dev/docs)
- [Demo](https://convexbooking.dev)
- [GitHub](https://github.com/Finchmedia/booking-component)
- [Issues](https://github.com/Finchmedia/booking-component/issues)

## License

Apache-2.0
