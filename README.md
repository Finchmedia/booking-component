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
  listEventTypes,
  getEventType,
  getMonthAvailability,
  getDaySlots,
  getDatePresence,
  listBookings,
  getBooking,
  // Mutations
  createResource,
  updateResource,
  deleteResource,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  createEventType,
  updateEventType,
  deleteEventType,
  createBooking,
  cancelBooking,
  // Presence
  heartbeat,
  leave,
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

## Features

- **Real-time Presence** - Slot locking prevents double bookings
- **Multi-Duration Support** - Flexible booking lengths (30min, 1h, 2h, 5h)
- **O(1) Availability Queries** - Scales to millions of bookings
- **ACID Transactions** - Race-condition free via Convex
- **Multi-Resource Booking** - Book rooms, equipment, or people

## Links

- [Documentation](https://convexbooking.dev/docs)
- [Demo](https://convexbooking.dev)
- [GitHub](https://github.com/Finchmedia/booking-component)
- [Issues](https://github.com/Finchmedia/booking-component/issues)

## License

Apache-2.0
