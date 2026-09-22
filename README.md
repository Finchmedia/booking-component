# @mrfinch/booking

[![npm version](https://badge.fury.io/js/@mrfinch%2Fbooking.svg)](https://www.npmjs.com/package/@mrfinch/booking)

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

The optional `makeInternalBookingAPI(components.booking)` factory creates only
internal queries and mutations. Its exports are accessed through `internal.*`.
The old public `makeBookingAPI` factory was removed in 0.4.0; migrate public
endpoints to authorized host wrappers.

## Supported behavior

- **Schedules:** weekly hours, date overrides and IANA timezones. Booking timestamps
  use Unix milliseconds; inventory uses a 15-minute grid.
- **Bundles and pools:** reserve several resources atomically through the
  [multi-resource API](https://convexbooking.dev/docs/guides#multi-resource-booking).
  Pool quantities use this API; ordinary single-resource flows reject pools.
- **Lifecycle:** confirmation, decline, cancellation and atomic rescheduling.
  Your host controls the expiry of provisional bookings.
- **Presence:** temporary selection indicators. The final booking mutation checks
  inventory; presence does not guarantee a reservation.
- **Email:** optional Resend notifications and token-based management links.
  Follow the [email guide](https://convexbooking.dev/docs/integrations/email).

Your host enforces resource visibility, opening-hours policy, notice periods and
abuse limits. The quickstart gateway implements common defaults. Buffer fields
are stored settings; enforce any required gaps in your host's reads and writes.

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
