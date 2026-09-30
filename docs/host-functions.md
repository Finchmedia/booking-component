# Host functions

Browser clients call your host functions, and those call `components.booking.*` after your access
and policy checks. This page shows two wrappers whose arguments need care: slot queries while a
booker moves a booking, and paged booking lists. For failures, see [errors.md](errors.md).

## Slot queries while rescheduling

While a booker moves a booking, its own time should count as free: a move that overlaps it (half
an hour later, say) is valid, and the move mutations accept it. Forward the booker's
`{ uid, token }` to the component as `rescheduleContext`:

```ts
// convex/booking.ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";

export const getDaySlots = query({
  args: {
    resourceId: v.string(),
    date: v.string(),
    eventLength: v.number(),
    slotInterval: v.optional(v.number()),
    // Optional extras a client may send; accept them or the call fails validation.
    eventTypeId: v.optional(v.string()),
    rescheduleContext: v.optional(v.object({ uid: v.string(), token: v.string() })),
  },
  handler: async (ctx, { eventTypeId, rescheduleContext, ...slotArgs }) => {
    // Your access and policy checks, and your schedule lookup, as before.
    const scheduleId = await scheduleFor(ctx, slotArgs.resourceId, eventTypeId);
    return await ctx.runQuery(components.booking.public.getDaySlots, {
      ...slotArgs,
      scheduleId,
      rescheduleContext, // the component checks the token
    });
  },
});
```

`scheduleFor` stands for however your wrapper picks the schedule today.

- The component frees the booking's slots only when `token` is the management token of a pending
  or confirmed booking with that `uid` on the queried resource. Anything else frees nothing and is
  no error, so the wrapper needs no token check of its own, and a guessed token never frees
  another booking. Neither value appears in results or logs.
- `getMonthAvailability` takes the same argument. Forward it there too, so the month view offers
  the day of the booking being moved.
- `BookingProvider`'s `availabilityContext` (`@mrfinch/booking/react`) makes the Calendar send
  `eventTypeId` and, while the Booker reschedules, `rescheduleContext` to both queries. Declare
  both as optional in the argument validators of both wrappers, as above, and deploy them before a
  page turns the prop on: a validator without them rejects every slot query. `BookingProvider`
  checks `publicApi` for both at compile time (`PublicBookingAPIWithAvailabilityContext`),
  including `uid` and `token` inside `rescheduleContext`: declare it exactly as
  `v.optional(v.object({ uid: v.string(), token: v.string() }))`, since a key the components send
  and the validator lacks fails every reschedule query. Functions with untyped arguments are not
  checked.
- Never forward `excludeBookingUid` from client arguments: it frees a booking from its UID alone.
  Pass it only from code that has authorized the move itself, such as an administrator's screen.
  Passing both arguments throws `INVALID_INPUT`.
- The token is the booker's bearer secret. Take it from the booker's request only, and do not log
  it.
- A call without `rescheduleContext` gets the same answer as before.

## Paged booking lists

`listBookingsPage` pages through the bookings of exactly one organization, resource or event type,
newest `start` first. Wrap it in a query that checks the caller, and remove the management token
from every booking, because the component returns bookings whole:

```ts
// convex/booking.ts
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";

export const listOrganizationBookings = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { organizationId, paginationOpts }) => {
    // Check that the caller administers organizationId.
    const result = await ctx.runQuery(components.booking.public.listBookingsPage, {
      organizationId,
      paginationOpts,
    });
    return {
      ...result,
      page: result.page.map(({ managementToken: _token, ...booking }) => booking),
    };
  },
});
```

Page it in React with `usePaginatedQuery` from `convex-helpers/react`, which passes `endCursor` so
that pages stay adjacent while bookings are added or removed, and splits a page at `splitCursor`:

```tsx
import { usePaginatedQuery } from "convex-helpers/react";
import { api } from "../convex/_generated/api";

function Bookings({ organizationId }: { organizationId: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.booking.listOrganizationBookings,
    { organizationId },
    { initialNumItems: 25 },
  );
  return (
    <>
      {results.map((booking) => (
        <p key={booking.uid}>
          {booking.eventTitle}: {booking.bookerName} ({booking.status})
        </p>
      ))}
      {status === "CanLoadMore" && <button onClick={() => loadMore(25)}>More</button>}
    </>
  );
}
```

- Pass exactly one of `organizationId`, `resourceId` and `eventTypeId`. `resourceId` matches a
  booking's primary resource only, which for a bundle is its first item.
- `dateFrom` and `dateTo` bound `start` (Unix milliseconds, both included). `status` keeps one
  status. Without `status`, provisional holds are left out unless `includeProvisional` is true.
- A page reads at most 1,000 bookings, so with `status` or without `includeProvisional` a page can
  hold fewer than `numItems` bookings, or none, before the end. Keep loading until `isDone` (the
  hook's `status` is `"Exhausted"`).
- A cursor belongs to its selector; one from another selector is rejected with `INVALID_INPUT`.
- `listBookings` still returns one list without cursors. Without a selector it considers only the
  1,000 most recently created bookings.
