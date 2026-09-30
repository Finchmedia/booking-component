# Changelog

## 0.5.0 — Unreleased

The contract release: coded errors, one set of booking rules, closed booking
statuses and checked configuration writes in the component, and a host
contract that `BookingProvider` checks at compile time. Function paths and
the version 1 hook payloads are unchanged, and jobs queued by 0.4.x keep
being accepted. Each breaking change below names what your host has to do;
read _Upgrading_ before bumping, and its last entry before rolling back.

### Upgrading

- Eight new `maintenance.audit` checks list the stored rows 0.5.0 rejects on
  write, reads differently, or will not move or confirm (PR-38):
  `event_type_config`, `schedule_config`, `resource_config`,
  `date_override_config`, `link_integrity`, `booking_integrity`,
  `booking_eligibility` and `booking_status_invalid`, each issue with its
  `problems`. They only read, and they ship with 0.5.0 (0.4.x has only
  `f10_weekday` and `event_length_invalid`), so the steps "before upgrading"
  below need 0.5.0 deployed against a copy of your data: import a snapshot of
  production into a separate deployment, deploy your host with 0.5.0 there,
  run every check (paging with `continueCursor` until `isDone`), repair what
  they list in production with the 0.4.x functions the entries below and
  [docs/maintenance.md](docs/maintenance.md) name, and run every check on
  production again right after deploying. `booking_status_invalid` ships
  with the narrowed schema, so it can only confirm what the deploy itself
  checks (see the status entry). `makeInternalBookingAPI().audit` takes
  every check.
- Expected failures throw `ConvexError({ code, message })` instead of a plain
  `Error` (N3). `message` is the 0.4.x text, unchanged; `code` is one of the
  codes in [docs/errors.md](docs/errors.md); other failures stay plain
  `Error`s. A host that passes every `ConvexError` through to its clients, as
  the reference host's `translateComponentError` does, would now send the
  component's codes and texts to browsers, and the Booker shows such an
  error's `message` where it showed its generic text for a plain error.
  Before upgrading, map the codes your clients see (for example
  `SLOT_UNAVAILABLE` to your "slot taken" error) with `isBookingError(error)`
  and `error.data.code` and rethrow your own `ConvexError`, fall back to a
  generic error for the rest, and deploy that change with the upgrade.
  Matching `error.data.message` still works; codes also catch the bundle and
  move conflicts whose texts a needle table missed.
- `getEventType` returns `null` for an unknown ID (N1, D12), like
  `getResource` and the `getBooking*` queries; 0.4.x threw
  `EVENT_TYPE_NOT_FOUND` "Event type not found: <id>". Handle `null` where
  you read the result, and drop a wrapper's catch that mapped that error to
  `null` (the 0.4.3 workaround): a wrapper that returns the result meets the
  React contract (`EventTypeView | null`), and the Booker and Calendar show
  `null` as a deleted event type. A wrapper that throws for a missing event
  type sends the Booker to your error boundary.
- New bookings (`createBooking`, `createProvisionalBooking`,
  `createMultiResourceBooking`) reject a `timezone` `Intl` does not accept and
  a booker email that fails the built-in mail's syntax screen (one `@`, a
  domain of 1–63-character labels, no spaces) with `INVALID_INPUT`, before
  any other check (N4, N5, D15); the text does not repeat the address. Check
  both in your booking
  form (`isSendableAddress` from `@mrfinch/booking/emails` is that screen).
  Stored bookings keep working. Recipient verification stays host policy.
- `createEventType` and `updateEventType` check the settings they are given
  (F16, D29): lengths, length options and slot intervals are whole minutes
  above 0, buffers and notice 0 or more, `maxFutureMinutes` above 0, and
  `lengthInMinutes` is one of non-empty `lengthInMinutesOptions`
  (`INVALID_INPUT`). The length rule counts the stored value of the field a
  write omits, so changing only the length or only the options must leave a
  valid pair; writes that touch neither still work on rows stored before
  0.5.0. Lengths are still rounded up to the 15-minute grid. Repair what
  `event_type_config` lists before provisioning scripts re-run
  `createEventType`, which checks every setting it passes.
- `createEventType` on an existing ID (an upsert) keeps what it is not given
  (N14): an omitted `isActive` no longer reactivates a deactivated event type
  (a new one is still active), and an omitted `organizationId` keeps the
  stored one. An ID stored for another organization is rejected with
  `ORGANIZATION_MISMATCH` instead of being moved, links included, to the
  caller's organization. Adopting an event type without organization still
  works while every resource linked to it belongs to the adopting
  organization; otherwise `ORGANIZATION_MISMATCH` names the resource, since
  the kept links would cross organizations: unlink it first. Scripts that
  re-run `createEventType` to reactivate must pass `isActive: true` or call
  `toggleEventTypeActive`.
- `createDateOverride` and `updateDateOverride` take
  `type: "unavailable" | "custom"` (other strings fail argument validation,
  and the generated types narrow), and a `custom` override needs at least one
  window, also after an update of either field (`INVALID_INPUT`). Stored rows
  with other types or without hours still read as the weekly hours;
  `date_override_config` lists them. Update them to `unavailable` or give
  them hours.
- Range caps (F16, D4): `getMonthAvailability` answers at most 93 days per
  call (both ends included; `INVALID_INPUT`), `getAvailability` at most 366
  days (`INVALID_RANGE`). Split longer ranges. Bookings have no length cap;
  multi-day bookings stay possible.
- `updateResource` refuses `isFungible: true` while active single-resource
  bookings (pending, confirmed or provisional, without bundle items; legacy
  reservations included) hold the resource (N16): `RESOURCE_IN_USE`, and so
  does `createResource` on an ID that legacy reservations already hold without
  a resource document. With capacity one the flag used to be accepted and left
  them unmovable; bundles do not block it. End or move those bookings first.
  `booking_integrity` lists bookings an earlier flag change stranded
  (`poolWithoutItems`): cancel them, or set `isFungible: false` again.
- One set of booking rules for every path (F6). `createBooking`,
  `createProvisionalBooking`, `createMultiResourceBooking` (per item), both
  reschedule mutations and `transitionBookingState` to `confirmed`, or from a
  provisional hold to `pending`, require an existing, active event type and
  existing, active resources that are linked to it and belong to its
  organization when it has one, one of them not an add-on. For bundles the
  whole rule set is new, since 0.4.x checked only that the event type existed:
  the event type must be active, and every item must exist (unknown resource
  IDs are rejected with `RESOURCE_NOT_FOUND` instead of reserving a one-unit
  row), be active, be linked to the event type (pools included) and share its
  organization; only eligible items satisfy the add-on rule, and the rules
  come before capacity (an add-on alone on a taken slot reports
  `RESOURCE_NOT_STANDALONE`). New for moves, by token and by ID alike (no
  administrator override), and for confirming a provisional hold, submitting
  it as a request (`provisional` to `pending`, which sends the booker the
  "awaiting confirmation" mail) or approving a pending request: the same check
  over every item, before anything is released or notified. Cancelling,
  declining and expiring are never checked, and deactivating never ends a
  booking. Legacy `createReservation` and its bookings stay exempt (see the
  reserved ID `legacy` below). The new
  `booking_eligibility` check lists the active bookings these rules reject,
  with their problems (`eventTypeMissing`, `eventTypeInactive`,
  `resourceMissing`, `resourceInactive`, `resourceNotLinked`,
  `crossOrganization`, `noStandalone`). Before upgrading, run it on a copy
  (see the audit entry), then link every resource your bundles use (pools
  included) to the event type, create resources for IDs you booked without
  one, and resolve pending requests and provisional holds on deactivated or
  unlinked configuration; afterwards, reactivate or relink before moving or
  confirming such a booking. [docs/errors.md](docs/errors.md) lists the codes
  per function.
- The event type ID `legacy` is reserved: `createEventType` rejects it with
  `INVALID_INPUT`, also as an upsert of an event type stored with it.
  `createReservation` stores `eventTypeId: "legacy"` on its bookings, and
  they keep the legacy exemption from the booking rules only while no event
  type has that ID. An event type created with it before 0.5.0 is treated
  like any other: the booking rules above apply to its bookings, and to
  `createReservation` rows while it exists. `event_type_config` lists it with
  the problem `id`,
  and `booking_eligibility` lists its bookings the rules reject. Keep such an
  event type and manage it with `updateEventType`, `toggleEventTypeActive`
  and the link functions; change provisioning scripts that re-run
  `createEventType` for it, and create new event types under other IDs.
- No bookings across organizations (N13, F7): a booking belongs to its event
  type's organization. An event type with an `organizationId` links only
  resources of that organization: `linkResourceToEventType`,
  `setResourcesForEventType` and `setEventTypesForResource` reject another
  organization's resource with the new code `ORGANIZATION_MISMATCH`, and the
  two replace mutations then change nothing. The booking rules reject such a
  resource too, also over links stored before 0.5.0.
  `createMultiResourceBooking` rejects an `organizationId` that differs from
  its event type's (0.4.3 stored it): omit it or pass the same one. Event
  types without organization still link any resource, but one booking holds
  resources of one organization only: a bundle that mixes organizations is
  rejected, and its `organizationId`, when given, must be the organization of
  its resources (0.4.3 stored any value; without it the bundle has none, like
  a single booking of that event type). Moves and confirmations apply this
  to stored bundles too. A move, every `transitionBookingState` call,
  `cancelBookingByToken`, `cancelReservation`, `cancelMultiResourceBooking`
  and `expireProvisionalBooking` give a booking stored without its event
  type's organization or with another one that organization in the same
  transaction, before anything is queued, when every resource the booking
  occupies (its resource and every item) belongs to it, as
  `backfillBookingOrganizations` requires (a move gives it to the original
  and the new booking). Only that organization's hooks then receive the event
  (version 1 payloads include the management token, and their `booking`
  carries that `organizationId`), and the organization the booking named no
  longer lists it. Otherwise the booking keeps the stored organization, and
  its hooks and emails go there as in 0.4.x, so an event type's
  organization never takes over a booking of another organization's
  resources. Cancelling, declining, completing and expiring still never
  fail. Legacy rows and event types without organization keep the stored
  one. Unlink the pairs `link_integrity` lists as
  `crossOrganization`, and link a resource of the event type's organization
  instead; `booking_integrity` lists stored bookings of another
  organization, and those without one that `backfillBookingOrganizations`
  lists in `needsReview` for a missing or foreign resource, as
  `organizationMismatch`.
- `getMonthAvailability` and `getDaySlots` need complete schedule arguments
  (F12): `resourceTimezone` alone, `availableSlots` without
  `resourceTimezone` or `scheduleId`, and a `resourceTimezone` other than the
  schedule's throw `INVALID_INPUT`; 0.4.3 used the legacy 09:00–17:00 UTC
  window or the other zone, which opened closed days. An unknown `scheduleId`
  throws `SCHEDULE_NOT_FOUND` there and in `getEffectiveAvailability` instead
  of meaning 09:00–17:00 every day (N15). Only a call without schedule
  arguments (`""` counts as omitted) keeps the legacy window. A schedule
  stored before 0.4.3 with a zone `Intl` rejects has its hours read as UTC
  (logged), so its closed days stay closed. Pass `{ scheduleId }` alone, or
  `availableSlots` with `resourceTimezone`.
- Schedule references stay valid (N15): `createEventType` and
  `updateEventType` reject a `scheduleId` that names no schedule
  (`SCHEDULE_NOT_FOUND`; `""` still means none), and `deleteSchedule` refuses
  while an event type uses the schedule (new code `SCHEDULE_IN_USE`). Point
  the event types `event_type_config` lists with `scheduleId` to an existing
  schedule, or clear it, before deploying: from the deploy on,
  `getMonthAvailability`, `getDaySlots` and `getEffectiveAvailability` throw
  `SCHEDULE_NOT_FOUND` for them instead of reading 09:00–17:00, so a host
  that forwards `eventType.scheduleId` sends the Booker to its error
  boundary until the repair. Without a copy deployment, find them with
  `listEventTypes` and `getSchedule` for each `scheduleId`; 0.4.x
  `updateEventType` clears one with `scheduleId: ""`.
- `deleteResource` and `deleteEventType` delete the deleted ID's links in the
  same transaction (N12), so an ID created again starts unlinked: link it
  explicitly. Links that deletes before 0.5.0 left behind stay;
  `link_integrity` lists them (`resourceMissing`, `eventTypeMissing`). Call
  `deleteAllLinksForResource` or `deleteAllLinksForEventType` once for those
  IDs, at the latest before re-creating one.
- `listBookings` rejects a `limit` that is not a positive integer with
  `INVALID_INPUT` (F18, D23); 0.4.x read `0` as no limit, dropped rows for a
  negative limit and truncated fractions. Omit `limit` for no limit. Without
  a selector it still considers only the 1,000 most recently created
  bookings: pass `organizationId`, `resourceId` or `eventTypeId`, or page
  with `listBookingsPage`.
- Booking statuses are a closed set (F16, D35): `status` is `provisional`,
  `pending`, `confirmed`, `cancelled`, `declined` or `completed` in the
  schema, in every returned booking and in the generated types
  (`BookingStatus`), as are the history's `toStatus` and `fromStatus` (`""`
  marks the creation entry). Host types that mirrored `status` as `string`
  can use `BookingStatus`. `transitionBookingState({ toStatus })` and
  `listBookings({ status })` reject other strings in argument validation: an
  unknown target threw `INVALID_STATE` before, an unknown filter listed
  nothing, and `""` meant no filter, so omit `status` instead. Convex checks
  the stored rows against the narrowed schema when you deploy and refuses
  the deploy while one holds another value, naming the table and document.
  The component writes only these statuses, so only rows edited in the
  dashboard or imported can block it: correct them there and deploy again.
  `booking_status_invalid` then confirms that none is left, history
  included.
- `Booking.status` in `@mrfinch/booking/react`, and with it
  `BookingView.status` and what `onBookingComplete` receives, is the
  component's `BookingStatus` (exported from `/react` too). The deprecated
  `"rescheduled"`, never stored, is no longer part of it: delete comparisons
  and `case` branches with it (a moved booking is `cancelled`). A host
  `createBooking` or `rescheduleBookingByToken` whose returns validator
  declares `status: v.string()` no longer fits `PublicBookingAPI`: declare it
  with `bookingStatusValidator`, or return the component's booking.
- `getQuantityAvailability` returns `bookedQuantities` as
  `Record<string, number>` instead of `any`, and the schema stores
  `quantity_availability.slotQuantities` as that record (PR-66). The
  component only ever wrote numbers, so the deploy check above fails only on
  rows changed outside it. Drop host casts of the result.
- Slot queries during a reschedule (F13): a host that forwards a client's
  `excludeBookingUid` to `getDaySlots` or `getMonthAvailability` lets anyone
  who knows a booking's UID see its time as free. Remove it from their
  arguments and forward the booker's `rescheduleContext: { uid, token }`
  instead, which frees the booking's own slots only with its management
  token; keep `excludeBookingUid` for code that has authorized the move
  itself. Passing both throws `INVALID_INPUT`.
  [docs/host-functions.md](docs/host-functions.md#slot-queries-while-rescheduling)
  shows a wrapper. The React components send the context only with
  `BookingProvider`'s new `availabilityContext`, off by default (see
  _Added_). Before you turn it on, declare
  `eventTypeId: v.optional(v.string())` and
  `rescheduleContext: v.optional(v.object({ uid: v.string(), token: v.string() }))`
  in the argument validators of both host wrappers and deploy them ahead of
  the page: until then the validators reject every slot query.
  `BookingProvider` rejects a `publicApi` without them, or whose
  `rescheduleContext` lacks `uid` or `token`, at compile time (functions
  with untyped arguments are not checked).
- Hooks keep the version 1 payloads unless registered with
  `payloadVersion: 2` (N7, D16), so existing hooks need no change. To switch
  one to the version 2 envelope, register a handler that declares
  `args: bookingHookEventV2` with `payloadVersion: 2`, then unregister the
  old hook; `updateHook` cannot change the version. Events queued by 0.4.x
  reach version 2 hooks not at all (logged).
- `convex-helpers` (`^0.1.124`) is a required peer dependency:
  `listBookingsPage` uses its paginator, so your deploy bundles it. Install
  it next to `@mrfinch/booking` (React users already have it).
- `BookingProvider` checks `publicApi` at compile time. The 11 functions the
  components call (`getEventType`, `getResource`, `hasResourceEventTypeLink`,
  `getMonthAvailability`, `getDaySlots`, `getDatePresence`, `getPresence`,
  `createBooking`, `rescheduleBookingByToken`, `heartbeat`, `leave`) must
  accept exactly the arguments the components send and return at least the
  fields they read (`BookingUIOperations`). A mismatch is a type error that
  names the operation; until 0.4.x it compiled and failed in the browser.
  Fix the host function: declare every argument the components send (for
  example `slotInterval` in `getDaySlots`, `eventTypeId` in `heartbeat`), make
  arguments they never send optional, and return the view fields; the README's
  host contract table lists them. To find the function, check the gateway on
  its own with the exported contract type:
  `api.public satisfies PublicBookingAPI` names it and lists its argument keys
  next to the keys the components send; the error on `<BookingProvider>` can
  name the opt-in type and a different function. The generated `api.public`
  of the reference host compiles unchanged.
- `PublicBookingAPI`'s 11 required members are `FunctionReference_future`
  references (the checked slots) instead of plain
  `FunctionReference<…, any, any>`. `convex/react`'s `useQuery` and
  `useMutation` accept them, but a `FunctionReference_future` is not
  assignable to a plain `FunctionReference`: convex-helpers' cached
  `useQuery` (the hook `ConvexQueryCacheProvider` serves) and other APIs
  that take a plain reference reject a member read from a value typed
  `PublicBookingAPI`, such as a hand-built gateway or
  `function useX(publicApi: PublicBookingAPI)` (TS2345). Take plain typed
  references from `useBookingAPI()` or your generated `api` instead, and
  check a gateway with `api.public satisfies PublicBookingAPI` rather than
  annotating a variable as `PublicBookingAPI`.
- The other 10 public operations (`getBooking`, `getBookingByUid`,
  `getBookingByToken`, `cancelBookingByToken`, `getEventTypeBySlug`,
  `listEventTypes`, `getAvailability`, `listResources`,
  `getEventTypesForResource`, `getEffectiveAvailability`) are optional: no
  component calls them, so a host need not export the token-less booking reads.
  Code that reads them from `useBookingAPI()` must handle `undefined`, or call
  its own `api.public` references.
- `useBookingAPI()` types the 11 operations with the contract's arguments and
  result views (`EventTypeView`, `ResourceView`, `BookingView`, …) instead of
  `any`. Code that reads other fields through them, such as `eventType.slug`,
  uses its own generated references instead. Calls through them must also
  pass exactly the contract's arguments: `slotInterval` on `getDaySlots` and
  `getMonthAvailability`, and no `scheduleId`, `excludeBookingUid` or extra
  `createBooking` field, for example. For other argument shapes, call your
  own `api.public` references.
- Admin operations resolve only from `adminApi` and are `undefined` without
  it; `publicApi` no longer stands in for them (deprecated in 0.4.3). A
  plain-object `adminApi` no longer overrides public operations, and names
  outside `PublicBookingAPI` and `AdminBookingAPI` are no longer passed
  through. Pass `adminApi={api.admin}` wherever admin operations are used, and
  call other functions through your own `api`. To route a public operation to
  another function, pass a plain-object `publicApi` that lists the required
  operations; a generated `api.public` cannot be spread.
- `onBookingComplete` receives a `BookingView`: `uid`, `status`, `start`,
  `end`, `timezone` and `bookerName`, and every other `Booking` field as
  optional. A callback annotated `(booking: Booking) => …` takes `BookingView`
  or drops the annotation. `BookingSuccess` accepts a `BookingView`.
- All component indexes follow Convex's `by_field1_and_field2` naming: each
  is named after its fields, in order, which do not change (`by_external_id`
  keeps its name, since Convex reserves `by_id`). The deploy builds the
  renamed indexes and the new `event_types` index `by_scheduleId` (for
  `SCHEDULE_IN_USE`) and drops the old ones (a rollback to 0.4.x does the
  reverse), so allow time on large tables. Component tables are internal, so
  host code is unaffected.
- Rolling back to 0.4.x: every 0.5.0 emitter queues `triggerHooks` with a
  new `payloadV2` argument, and hooks registered with `payloadVersion: 2`
  store it. 0.4.x's `triggerHooks` validator rejects that argument, so each
  job still queued when 0.4.x deploys fails and the emails and hooks of its
  event are lost, and Convex refuses the 0.4.x schema while a hook row has
  `payloadVersion`. Before redeploying 0.4.x, unregister the hooks
  registered with `payloadVersion: 2` and let the queued `triggerHooks` jobs
  finish (they run right after their booking write).

### Fixed

Each of these changes behaviour; its _Upgrading_ entry says what to do.

- Bundles, moves, confirmations and requests made from provisional holds
  follow the booking rules of `createBooking`: deactivated, unlinked or
  unknown configuration and other organizations' resources are rejected (F6,
  F7, N13). A hold submitted as a request no longer tells the booker it
  awaits approval when the approval can only fail.
- Slot queries no longer open days a schedule keeps closed when given
  partial schedule arguments or an unknown schedule (F12, N15).
- Re-running `createEventType` no longer reactivates an event type or moves
  another organization's event type to the caller's (N14), and adopting an
  event type without organization no longer keeps its links to other
  organizations' resources.
- A bundle of an event type without organization no longer holds resources
  of two organizations or names a third organization, and a move no longer
  carries a missing or foreign organization over to the new booking.
  No confirmation, request, cancellation, decline, completion or move sends
  a foreign organization's hooks the booking and its management token any
  more when all the booking's resources belong to its event type's
  organization: the booking takes that organization first. Otherwise it
  keeps the stored one, as before.
- The slot queries' `excludeBookingUid` and `rescheduleContext` free a
  bundle's own slots on every item, not only on its first, so an overlapping
  move of the bundle is offered on each of its resources.
- The pool flag no longer strands a resource's single-resource bookings,
  whether set by `updateResource` or by `createResource` on an ID legacy
  reservations hold (N16).
- A resource or event type created again with a deleted ID starts unlinked
  (N12).
- `listBookings` no longer gives limits of 0, negative or fractional values
  a meaning (F18).
- The React integration keeps its types: Booker, Calendar and
  `useConvexSlots` read typed results without casts, and a host reference whose
  kind, visibility, arguments or result do not fit is rejected at compile time.
  Host wrappers with extra optional arguments, broader argument types, the
  component's own documents or redacted results with the view fields pass.
- `BookingProvider` builds the API from its operation lists: public
  operations from `publicApi`, admin operations from `adminApi`, nothing else.

### Added

- Error codes (N3): `BOOKING_ERROR_CODES`, the `BookingErrorCode` and
  `BookingErrorData` types, `isBookingError` and `isBookingErrorCode` from
  `@mrfinch/booking`. Each condition has one code in every function: a taken
  slot is `SLOT_UNAVAILABLE` on the single-resource, bundle and move paths,
  whose texts differ. [docs/errors.md](docs/errors.md) lists the codes and
  the functions that throw them.
- `rescheduleContext: { uid, token }` on `getDaySlots` and
  `getMonthAvailability` (F13): with the moved booking's UID and management
  token, its own slots count as free, so a move that overlaps its current
  time is offered, as the move mutations accept it, on each resource it holds
  (every item of a bundle). A token that does not match a pending or
  confirmed booking with that UID that holds the queried resource frees
  nothing and is no error; neither value appears in results or logs.
  `makeInternalBookingAPI` forwards it.
- Hook payloads, version 2 (N7): `registerHook({ …, payloadVersion: 2 })`
  delivers one envelope per event, whichever function emitted it, built from
  the written booking and without the management token. Handlers declare
  `args: bookingHookEventV2` (exported with the `BookingHookEventV2` type
  from `@mrfinch/booking`); see
  [docs/hook-payloads-v2.md](docs/hook-payloads-v2.md). `listHooks` and
  `getHook` return `payloadVersion`.
- `listBookingsPage` (F18): cursor pages of exactly one organization's,
  resource's or event type's bookings (newest `start` first), with
  `dateFrom`, `dateTo`, `status`, `includeProvisional` (provisional holds are
  hidden otherwise) and `paginationOpts`. It uses the convex-helpers
  paginator, as components cannot use `.paginate()`; its cursor is the
  complete index key, so equal starts are neither skipped nor repeated. A
  page reads at most 1,000 rows, so filtered pages can be short or empty
  while `isDone` is false. Page it reactively with `usePaginatedQuery` from
  `convex-helpers/react`. `makeInternalBookingAPI` wraps it.
- `updateEventType` clears `description`, `scheduleId`, `bufferBefore`,
  `bufferAfter`, `minNoticeMinutes` and `maxFutureMinutes` with `null` (N25,
  D30); an omitted field stays unchanged. `makeInternalBookingAPI` forwards
  `null`.
- `BOOKING_STATUSES`, the `BookingStatus` type, `bookingStatusValidator` and
  `isBookingStatus` from `@mrfinch/booking`, for host types, validators and
  status filters; the `BookingStatus` type also from `@mrfinch/booking/react`.
- `@mrfinch/booking/react` exports the contract types: `BookingUIOperations`,
  `OptionalPublicOperations`, the views `EventTypeView`, `ResourceView`,
  `BookingView`, `DaySlotView`, `PresenceView` and `SlotHolderView`, and the
  argument types `MonthAvailabilityArgs`, `DaySlotsArgs`, `CreateBookingArgs`,
  `RescheduleBookingByTokenArgs` and `AvailabilityContextArgs`. The
  availability queries accept the optional `eventTypeId` and
  `rescheduleContext` of `AvailabilityContextArgs`; a host that declares them
  must accept these types, one that does not still fits unless it opts in
  (below).
- `useBookingValidation` accepts the views, so a host DTO with the read fields
  is enough.
- A booking or reschedule error that carries a known component `code` but no
  `message` shows a generic text for that code, for example "This time is no
  longer available. Please choose another time." for `SLOT_UNAVAILABLE`,
  instead of "Something went wrong". `data.message` still comes first; unknown
  codes and plain errors keep the generic message.
- `BookingProvider` takes `availabilityContext`, off by default. With it on,
  the Calendar and `useConvexSlots` add `eventTypeId` and, while the Booker
  reschedules, `rescheduleContext: { uid, token }` of the booking being moved
  to `getDaySlots` and `getMonthAvailability`, so a host can apply the
  selected event type's schedule and policy and, by passing
  `rescheduleContext` on to the component, offer times that overlap the
  booking being moved. Presence functions never receive the token; without
  the opt-in the arguments are unchanged. What the host functions must
  declare first is under _Upgrading_ (slot queries during a reschedule). For
  custom calendars `Calendar` takes an optional `rescheduleContext` and
  `useConvexSlots` an optional seventh argument
  `{ eventTypeId, rescheduleContext }`, sent only with the opt-in. New types:
  `PublicBookingAPIWithAvailabilityContext`, `AvailabilityContextOperations`,
  `BookingProviderPropsWithAvailabilityContext`.

### Deprecated

- `BookingValidationError`, `BookingValidationResult`,
  `ValidationError.recoveryPath`, `useConvexSlots().fetchSlots` and
  `fetchMonthSlots` stay deprecated and available (see 0.4.3).

### Removed

- `BookingProvider` no longer resolves admin operations from `publicApi`
  (deprecated in 0.4.3), lets a plain-object `adminApi` override public
  operations, or passes other names through; see _Upgrading_.
- The `"rescheduled"` member of `Booking.status` (deprecated in 0.4.3, never
  stored); see _Upgrading_.

### Documentation

- [docs/maintenance.md](docs/maintenance.md): the upgrade order, every
  `maintenance.audit` check with its repair, and the one-time repairs.
- [docs/host-functions.md](docs/host-functions.md): slot-query wrappers that
  forward `rescheduleContext` and declare the `availabilityContext`
  arguments, and a paged booking list.
- The README states which booking rules the component guarantees and which
  policy stays with the host: authorization, notice and horizon, buffers,
  abuse limits and email recipients.
- The README lists the host contract per operation (required and optional,
  the arguments the components send and the fields they read), shows the
  `satisfies PublicBookingAPI` check, and describes the admin gateway and the
  availability context opt-in, linking the slot-query wrapper.

### Maintenance

- `npm run lint` rejects `any` and the `no-unsafe-*` flows in the React sources
  (tests excepted). No exception is needed today.
- Compile-time tests check the React host contract against the component's
  generated references and passthrough wrappers, so a component result
  change that breaks them fails `npm run typecheck`.

## 0.4.3 — 30 September 2026

### Upgrading

- After upgrading from 0.4.2 or earlier, run two one-time repairs from a host internal
  mutation or `makeInternalBookingAPI`, passing `continueCursor` back until `isDone`
  (`limit` 1–500, `dryRun: true` only counts): `presence.sweepOrphanedHolds` for holds
  whose cleanup job was cancelled or failed, `maintenance.backfillBookingOrganizations`
  to give bookings without an organization (bundles created without `organizationId`,
  pre-0.3.0 ones) their event type's when every resource they occupy belongs to it too.
  It writes nothing else: bookings it cannot corroborate (event type gone or without
  organization, a resource missing or in another organization) stay without one and
  are listed in `needsReview` with the reason; it only lists mismatches.
- Presence runs fewer background jobs: `leave` cancels the hold's pending cleanup job,
  and a heartbeat replaces a cancelled or failed one. Surplus jobs from earlier
  leave/rejoin cycles are not merged; they no longer grow and end 10–20 s after their
  session's last heartbeat. Do not mass-cancel `presence:cleanup` jobs: that orphans
  live holds until their next heartbeat or the sweep.
- Inputs without a valid meaning now throw an `Invalid …` error; existing error texts
  are unchanged. The availability queries reject an `eventLength` that is not a
  positive finite number and slot indices outside the integers 0–95; the availability
  and date-override functions reject dates that do not exist (`2027-02-30`) and
  `dateFrom` after `dateTo`; booking writes and `getAvailability` reject instants a
  `Date` cannot hold; schedule, resource and event-type writes reject a time zone `Intl`
  does not accept (patches only when they set one); `registerHook` and `updateHook`
  reject anything but a `function://` handle from `createFunctionHandle`.
- Event types whose `lengthInMinutes` or `lengthInMinutesOptions` hold a non-positive or
  non-finite value make the Booker's slot queries throw. Check them before upgrading, or
  list them with `maintenance.audit` and `check: "event_length_invalid"`.
- Rows stored with an invalid zone stay readable and editable; a patch with a valid zone
  repairs them. Stored hooks that are not function handles (they never reached the
  host) are skipped with `Skipped hook <id>: …`; remove them with `unregisterHook`.
- At UTC+12 and beyond, weekly hours apply to the day's own weekday, not the next one's
  (F10). Undo any `weeklyHours` shift made to compensate. Bookings are not moved;
  `maintenance.audit` with `check: "f10_weekday"` lists upcoming ones on closed days.
- On fall-back days a repeated wall-clock time means its first occurrence in every zone
  (zones east of UTC used the second; F11). Bookings made at the second one are kept.
- Unpadded dates such as `2027-3-9` now mean the padded day, which `createDateOverride`
  stores, so overrides stored unpadded are no longer found by date: list them with
  `listDateOverrides` without bounds, recreate them padded and delete the old rows.
- The built-in email HTML changes (escaped text, validated buttons; see Security), so
  host snapshot tests of it may need updating. Email jobs queued by 0.4.2 still run.
- The `bookings` index `by_event_type` becomes `by_eventTypeId_and_start`, which Convex
  builds during the deploy (allow time on a large table); `schedules` gains
  `by_organizationId_and_isDefault`, so `getDefaultSchedule` and the audit read one
  schedule, not all of an organization's. Booking documents can carry the new optional
  `rescheduledToUid`; host validators of booking fields must accept it.
- The Booker now shows booking errors itself; hosts that also toast them (for example by
  wrapping mutations) show two messages, so drop that or move it to `onBookingError`.
  Throw `ConvexError({ code, message })` from host functions for a specific message.
- Pass `onEventTypeReset` and `onNavigate` for a way back from configuration errors. For
  the event-deleted recovery, render the Booker in an error boundary and have the public
  `getEventType` return `null` for `Event type not found` (see the README).
- The Booker stores the first configured location's address, or `{ type: "address" }`
  without a value instead of "Studio A": render a location by `location.value`, not by
  `booking.location &&`. Existing bookings keep what they stored.
- Markup for CSS and selectors: durations are radio inputs in a `fieldset`, not `li`s;
  `BookingErrorDialog` is a native `dialog` (`showModal()`) or an inline `role="alert"`
  instead of a fixed overlay; the Booker's steps sit in a `display: contents` wrapper.
- `Calendar` (`selectedDate`, `onDateChange`, `currentMonth`) and `generateCalendarDays`
  use day carriers whose local fields name the day; the automatic selection is local
  midnight of today in the display zone. Replace your own `fetchSlots(date)` calls with
  `fetchSlotsForDate(day.civilDate)`.
- Pass `adminApi` to `BookingProvider` wherever admin operations are used.

### Security

- The six built-in templates escape booking text (F2); markup in guest names, titles or
  reasons became live HTML in the host's mail. Renderers still get unescaped values.
- Built-in buttons use the validated `email.links` (trailing slash, query and hash
  dropped from `baseUrl`, uid URL-encoded); a `baseUrl` that is not an absolute
  `http(s)` URL or contains credentials yields no buttons and logs a warning. Built-in
  subjects turn CR, LF and NUL runs into a space and stop at 200 characters.
- Hooks run only function handles; other strings were component function paths, so a
  hook named `maintenance:wipeAllBookingData` scheduled that component mutation.

### Fixed

- On spring-forward days, windows reaching into or across the skipped hour no longer
  offer bookings that end after they close.
- `getMonthAvailability` with `scheduleId` but no `resourceTimezone` uses the
  schedule's zone instead of UTC, where closed or full days read as open, and reads its
  overrides once per call. A differing `resourceTimezone` is still used and logs a
  warning; a schedule with an invalid zone keeps the legacy UTC path and logs one.
- `getAvailability` stops at the first busy UTC date. Windows stored before 0.3.0 that
  end past 24:00 end with the day (indices 0–95, no offered booking past midnight).
- Mail to a syntactically malformed address is skipped (`INVALID_RECIPIENT`) instead of
  failing its shared Resend batch; an unusable stored booking zone renders in UTC.
- Repeated ids in `setResourcesForEventType`/`setEventTypesForResource` link once;
  existing duplicate rows, which made bookings and link operations of the pair throw,
  are tolerated and collapsed by the next link, unlink or replace.
- `cancelReservation` records history, `cancelledAt`, `updatedAt` and
  `cancellationReason` like the other cancel paths; earlier ones are not backfilled.
- `createMultiResourceBooking` without `organizationId` stores the event type's, so
  bundles reach organization lists and scoped hooks; no hook payload gains a key.
- New management tokens are 64 lowercase hex characters; old ones keep working, so
  host checks must accept both formats.
- `listBookings` with a `limit` stops reading once enough rows match, with unchanged
  results. `makeInternalBookingAPI`'s `getEventTypeBySlug` accepts `organizationId`.
- The Booker shows failed bookings and reschedules in an announced alert with the host's
  `ConvexError` text (`data.message` or string data), else a generic message instead of
  transport text; `UNAUTHENTICATED` without `onAuthRequired` asks the user to sign in.
  A missing management token or `rescheduleBookingByToken` is a configuration error.
- Configuration errors no longer trap users: with their recovery callback they are a
  modal alert dialog (focus on the action, Escape runs it), without it an inline alert
  instead of a full-screen overlay whose button did nothing. They stop a new booking but
  no longer cover the success screen; during a reschedule they are an inline notice
  above the calendar that does not block the move.
- Repeated submits or slot clicks send one mutation; slots are disabled during a
  one-click reschedule; the slot hold ends after a successful booking or reschedule and
  a failed one-click reschedule. A new `eventTypeId`, `resourceId` or
  `originalBooking.uid` starts a fresh flow, which shows the confirmation of a
  submission still pending then unless a newer one was sent: only the submission
  sent last is shown, older ones reach `onBookingComplete`. A late
  `originalBooking` uses its own duration and zone. A completed reschedule offers no
  "Book Another"; `reuseBookerInfo={false}` shows the original contact details
  read-only; confirmation and success follow the 12h/24h choice and the browser locale.
- Accessibility: durations are a native radio group; form fields are labelled and expose
  required, invalid and error state; reserved slots keep their time in their name; day
  buttons expose the full date, `aria-pressed` and `aria-current="date"`; the 12h/24h
  toggles expose `aria-pressed`; focus moves to each new step's heading.
- Calendar days no longer shift when the display zone differs from the browser's (one
  west of it queried and booked the previous day and disabled today). Today and past
  days follow the display zone; `fetchMonthSlots` no longer depends on the browser's.
- A slot is "Reserved" exactly when another session holds an overlapping 15-minute
  quantum, read for each UTC date the slots cover (up to three, else a warning and
  `presenceIncomplete`); `useSlotPresence` no longer flickers for a slot held twice.
- `getSessionId` no longer throws (crashing Booker and Calendar) when `sessionStorage`
  is blocked, `null` or full; the id then lives in memory and changes on reload.
- `@mrfinch/booking/react` uses `.js` relative imports, so it loads with Node's ESM
  loader, Vitest's defaults and plain webpack 5 or Rspack and keeps its types under
  `nodenext` (all `any` before). Next.js and Vite were not affected.
- `BookingProvider` resolves admin operations from `adminApi`; with
  `adminApi={api.admin}` they resolved to the public module. `Calendar` shows its "event
  type has been deleted" notice when `getEventType` resolves to `null`.

### Added

- `presence.sweepOrphanedHolds`, `maintenance.backfillBookingOrganizations` and the
  read-only `maintenance.audit`, each with a `makeInternalBookingAPI` wrapper.
- `getDaySlots` takes an optional `scheduleId` that fills in omitted hours and zone.
- `rescheduledToUid`, set on a moved original to the new booking's uid (from 0.4.3 on).
- `cancelReservation` takes optional `reason` and `cancelledBy`, `rescheduleBooking` an
  optional `changedBy`; `isSendableAddress` is exported from `@mrfinch/booking/emails`.
- Optional `onBookingError(error, { phase })` on `Booker`, called besides its alert;
  `submitError`, `readOnlyDetails`, `timeFormat` and `locale` on `BookingForm`, the last
  two on `BookingSuccess`, `disabled` on `Calendar`, `TimeSlotsPanel`, `TimeSlotButton`;
  a locale on `formatDate`, `formatTimeDisplay` and `formatDateTime` (plus time format).
- `ValidationError.recovery` and `ValidationRecovery`; `CalendarDay.civilDate`;
  `useConvexSlots`'s `presenceIncomplete`, `fetchSlotsForDate("YYYY-MM-DD")` and
  `fetchMonthSlotsFor(year, month)` (1–12), which throw a `RangeError` for impossible
  input, as `generateCalendarDays` and `fetchMonthSlots` now do for an invalid `Date`.
- `allowedDurations` and `effectiveSlotInterval` (type `EventTypeDurations`) from
  `@mrfinch/booking` and `/react`: the Booker's durations and the Calendar's unchanged
  slot grid, importable by host Convex functions without React.

### Deprecated

- `ValidationError.recoveryPath` (demo routes; map `recovery` instead), the unused
  `BookingValidationError` and `BookingValidationResult` types, the never-stored
  `"rescheduled"` status, and `useConvexSlots().fetchSlots(date)` and
  `fetchMonthSlots(date)` (use `fetchSlotsForDate` and `fetchMonthSlotsFor`).
- Falling back to `publicApi` for admin operations `adminApi` lacks (may go in 0.5.0).

### Documentation

- The [README](README.md) documents the host contract; the new
  [hook payload reference](docs/hook-payloads-v1.md) lists the v1 payloads and the
  [custom email guide](docs/custom-emails.md) covers key rotation and Resend accounts.
  The 0.3.1 entry no longer misstates `cancelReservation`'s result.
- The README covers the Booker's errors, recovery, accessibility, time zones and module
  loading; `BookingProvider` docs no longer present references as authorization.

### Still the host's job

- Check eligibility (active, linked, same organization) before bundles, moves and
  confirmations; keep booking documents, which hold the management token, from callers
  who know only an id or uid; register hooks only from administrator code.
- Decide who may receive mail (addresses are not verified); use one Resend account per
  instance; pass `scheduleId` to the availability queries; delete links when deleting;
  bound the date ranges forwarded to `getAvailability`.

### Tests and maintenance

- Characterization tests pin function paths, v1 hook payloads, error texts and the
  documented host duties; time-dependent suites run under several process time zones.
- The npm package omits test files and `src/testing/`. Internal refactors (shared cancel
  path, typed patches, `hooks:triggerHooks` returning `null`) change no behaviour.
- `npm run lint` runs with `--max-warnings=0` and fails on unused bindings in package
  sources, `_`-prefixed ones included (tests keep the escape); three unused props carry
  tracked exceptions. Packaging tests import and type-check the compiled `/react` entry.

## 0.4.2 — 23 September 2026

### Added

- Optional host-app email renderers through `@mrfinch/booking/emails`. A typed
  internal query receives the notification snapshot and returns subject, HTML
  and optional plain text; returning `null` retains the built-in template.
- Renderer configuration travels with server-owned `resendOptions`. Booking
  still selects lifecycle notifications and queues them through its nested
  Resend component. Existing integrations need no changes.
- Notification identities deduplicate new email jobs during replay. Custom
  renderer errors fail the email job visibly without undoing the booking.

### Integration

- The initial renderer API supports the Convex query runtime, not Node-only
  libraries or network requests. Custom subjects are limited to 200 UTF-16 code units;
  combined UTF-8 subject/HTML/text content is limited to 128 KiB.
- See the [custom email guide](docs/custom-emails.md) for setup, fallback,
  management links and recovery. No database migration is required.

## 0.4.1 — 22 September 2026

### Fixed

- Weekly schedules and date overrides accept `24:00` as an end time, allowing
  availability through midnight, including the final 23:30–00:00 booking.
  Start times remain within the day; invalid, inverted and overlapping windows
  are still rejected. No API or dependency changes are required.

## 0.4.0 — 22 September 2026

### Upgrading

- Requires Convex 1.46 or newer. React UI peers now require convex-helpers
  0.1.124, resolvers 5.9.1, react-hook-form 7.88 and lucide-react 1.47 or newer
  within their declared compatible ranges. React 18 and 19 remain supported.
- Replace the removed public `makeBookingAPI` factory with guarded host functions
  that call `components.booking.*`. The new `makeInternalBookingAPI` exports
  internal functions only, including maintenance and administrative operations.
  See the [authorization guide](https://convexbooking.dev/docs/authentication).
- The React slot type is now `BookingSlot`. Update imports of the former
  `CalcomSlot` name; the data shape is unchanged.
- Quantities and capacities must be positive safe integers. Duplicate resource
  IDs and quantities other than one for exclusive resources are rejected.
- Use the multi-resource API for fungible pools, even when booking one pool.
  Ordinary, provisional and reservation creation reject pools; ordinary slot
  queries do not advertise them.

### Fixed

- Terminal bookings cannot release inventory a second time. Token cancellation
  releases every item in a bundle without disturbing unrelated bookings.
- Both reschedule paths move all items atomically, preserve quantities, snapshots,
  status and management tokens, and return a new booking UID. Destination
  conflicts roll back the entire move. Reschedule notifications link to the new UID.
- Resource registration and inventory-mode changes cannot reinterpret occupied
  inventory. Capacity reductions cannot undercut reserved current/future slots.
  Completed historical bookings remain recorded without permanently blocking
  future capacity changes. Booked secondary resources cannot be deleted.
- Availability uses the same quantity validation and pool-capacity rules as writes.
- Booker duration defaults follow loaded options; locked durations remain stable.
  Presence updates follow duration changes, retry failed heartbeats and clean up
  after navigation. Elapsed slots refresh while the calendar stays open.

### Maintenance and documentation

- Refreshed runtime dependencies and compatible tooling; Node 24 is the
  contributor and CI baseline. TypeScript remains on 6 while the ESLint parser
  does not support TypeScript 7. Zod 4 is an owned dependency for the built-in form.
- Added inventory, host authorization and rendered React regressions. Removed
  frontend lint errors and warnings and enabled strict peer installs in CI.
- Reworked the README and documentation around installation, a guarded host
  gateway and a first booking. Demo administration and provider-specific setup
  are separate guides. Complete examples are compiled and rendered links checked.
- Buffer fields remain stored configuration; hosts must enforce booking gaps.
  Presence is advisory. Database transactions enforce booking conflicts.

## 0.3.1

Quality pass. Every component function now declares a return validator, so the
generated component API (`ComponentApi`) has concrete result types instead of
`any` (72 of 75 functions were `any` in 0.3.0). Booking behaviour is unchanged,
but the type surface and the install requirements are not — read _Upgrading_
before bumping.

### Upgrading

- **Requires `convex >= 1.29.0`** (the peer range was `^1.17.0`). This is a
  hard runtime floor, not a warning: the shared validators module calls
  `VObject.extend()` (added in convex 1.29) at module load inside your
  deployment, so a host on 1.17–1.28 fails to load the component at
  `convex deploy`.
- **Return types are now concrete.** Host code that narrowed a previously-`any`
  result to a local mirror type may stop compiling. The common case is
  `booking.status`: it stays `string` on the component side (the schema does not
  constrain it), so a host-side mirror such as
  `status: "confirmed" | "declined" | …` now errors with
  `Type 'string' is not assignable to type '"confirmed" | …'`. Widen such fields
  to `string` (or narrow at the boundary with a type guard), and delete mirror
  types that only existed to compensate for `any`.
- **`cancelReservation` returns `{ success: boolean, alreadyCancelled: boolean }`**
  instead of `null`. (`cancelBookingByToken` and `cancelMultiResourceBooking`
  return `{ success }` only.)
  Cancelling an already-cancelled reservation reports
  `{ success: true, alreadyCancelled: true }` without releasing slots again; a
  missing reservation still throws.
- **Bookings indexes were renamed and trimmed** (6 → 4): `by_org` →
  `by_org_start` `[organizationId, start]`, `by_resource` → `by_resource_start`
  `[resourceId, start]`; the unused `by_email` and `by_org_status` are gone.
  Component indexes are not addressable from the host, so no host code changes;
  your next `convex deploy` backfills the two new indexes.
- The React-only peers (`react`, `react-hook-form`, `@hookform/resolvers`,
  `zod`, `lucide-react`, `convex-helpers`) are marked optional in
  `peerDependenciesMeta`. `convex-helpers` is only imported by `./react`; recent
  `convex-helpers` releases require `convex >= 1.43`, so hosts on 1.29–1.42
  that use `./react` should pin `convex-helpers@0.1.106`. Nothing
  behind the package root imports them directly. Transitive dependencies can
  still install React-related packages; this is not a React-free dependency-tree guarantee. Install them yourself when you use
  `@mrfinch/booking/react`.

### Added

- **Return validators on all 75 public component functions** (37 queries, 38
  mutations — plus the 2 internal maintenance mutations, so 77 of 77 declare
  `returns:`). Host code sees concrete `ComponentApi` return types instead of
  `any`.
- `src/component/validators.ts`: schema-derived document validators
  (`bookingDoc`, `eventTypeDoc`, `resourceDoc`, `hookDoc`, …) and shared result
  validators (`successResult`, `cancelResult`, `successWithAffectedUsers`,
  `deletedCount`). Every query and mutation in `public`, `resources`,
  `schedules`, `hooks`, `multi_resource`, `presence` and `resource_event_types`
  declares `returns:`; void mutations declare `v.null()` and return `null`
  explicitly.
- `createBooking`, `createProvisionalBooking`, `rescheduleBooking`,
  `rescheduleBookingByToken` and `createMultiResourceBooking` are typed as
  returning the booking document (never `null`); the re-read after the write
  throws `Booking not found after write` in the impossible case instead of
  returning `null`.
### Changed

- `cancelReservation` returns `{ success: boolean, alreadyCancelled: boolean }`
  instead of `null` (see _Upgrading_).
- `createBooking`, `createProvisionalBooking`, `rescheduleBooking`,
  `rescheduleBookingByToken` and `createMultiResourceBooking` return the booking
  document, never `null`.
- Bookings indexes: `by_org_start` `[organizationId, start]` and
  `by_resource_start` `[resourceId, start]` replace `by_org` / `by_resource`;
  the unused `by_email` and `by_org_status` are removed (6 → 4). No host code
  changes — your next `convex deploy` backfills the new indexes.
- Read paths use compound indexes instead of scan-and-filter. Result sets and
  shapes are unchanged:
  - `listBookings({ organizationId | resourceId, dateFrom?, dateTo? })` pushes
    the date range onto the `*_start` indexes and reads newest-first from the
    index. `status`, `eventTypeId` and `provisional` remain post-filters, so
    `limit` still applies after filtering.
  - `listBookings({})` with no selector is bounded to the 1000 most recently
    created bookings (it was an unbounded full-table scan). Pass a selector for
    an exhaustive listing.
  - Date overrides (`getDateOverride`, `createDateOverride`,
    `listDateOverrides` and the per-day lookup behind `getMonthAvailability`)
    use `by_schedule_date` at full depth.
  - `presence.list` applies the staleness cutoff as an index range on `updated`
    instead of a JS post-filter. The returned rows are identical — the query
    always read `updated` descending, so live rows sorted ahead of stale ones —
    only the read set shrinks.
  - `listResources({ type })` uses `by_org_type`; `listHooks({ eventType })`
    uses `by_event`. `listHooks` returns hooks in creation order from both
    branches.
- `src/client/index.ts`: the dead `as any` casts on id arguments are gone.

### Fixed

- **Package exports for `_generated/component` resolve at runtime.** Both
  `@mrfinch/booking/_generated/component` (extensionless, new) and
  `…/_generated/component.js` are exported, and each now carries a `default`
  condition next to `types`. Previously the subpath had only a `types` entry,
  so `import type { ComponentApi } from "@mrfinch/booking/_generated/component"`
  failed to resolve (`TS2307`) under `moduleResolution: "Bundler"` and the
  specifier had no runtime resolution at all.
- **`convex` peer dependency is now `^1.29.0` (was `^1.17.0`).** This is a
  requirement change, not a preference: `src/component/validators.ts` calls
  `VObject.extend()`, which convex added in 1.29, at module load inside your
  deployment. Hosts on 1.17–1.28 must upgrade `convex` before installing 0.3.1.

### Tests

- `validators.test.ts`: every document validator is checked against its table
  (exact field set, `_id` bound to the right table, `Doc<"t">` ≡
  `Infer<typeof tDoc>`) and the result validators against representative
  results. `hardening.test.ts` pins `listHooks` ordering.

## 0.3.0

Hardening release. The component was run in a production client project for
several months; the fixes and additions made there are backported here. The
public API is backwards compatible (all new arguments are optional), but input
validation was tightened: writes that were silently accepted before now throw.
See _Changed / hardening_.

### Fixed

- **Month view and day view disagreed on schedule-aware availability.**
  `getMonthAvailability` decided a day with `isDayAvailable()`, which compared
  the schedule's _local_ slot indices against the _UTC_ `busySlots` bitmap with
  no wall-clock → UTC conversion. In a non-UTC timezone a fully booked day was
  still reported as available in the month view and then rejected in the day
  view. Both views now build candidates through `generateDaySlotsWithTimezone`
  and check them the same way, so they cannot drift. The legacy path
  (`isDayAvailable`, hardcoded 09:00–17:00 UTC) is only used for calls without
  a schedule/timezone.
- **Bookings crossing UTC midnight reserved no slots at all.** `createBooking`
  and `createProvisionalBooking` derived the busy-slot range from
  `start % 86400000` arithmetic, which yields `endChunk < startChunk` across UTC
  midnight: the conflict loop never ran and `Array.from({ length: negative })`
  wrote zero busy slots, so the range stayed bookable forever. Both mutations
  now use `getRequiredSlots(start, end)` for the conflict check _and_ the
  writes, per calendar day.
- **An empty schedule window was treated as "no schedule".** A weekend or an
  "unavailable" date override produced an empty window, which fell through to
  the hardcoded 09:00–17:00 UTC business hours. `getMonthAvailability` now
  reports `hasAvailability: false` and `getDaySlots` returns `[]` for an empty
  effective window.
- **Availability reads looked at the wrong day's slot row across UTC midnight.**
  Candidates generated in a resource's local timezone kept a single UTC slot
  index (which could exceed 95) and were checked against the row of the
  requested _local_ date, while every write path keys rows per _UTC_ date.
  Candidates now carry `slotsByDate` — exactly what the write paths compute —
  and `getDaySlots` / `getMonthAvailability` load every UTC date their
  candidates touch.
- **`declined` bookings kept their slots forever.**
  `hooks.transitionBookingState` only stamped `cancelledAt` /
  `cancellationReason`. It now also releases the booking's slots through the
  same shared helper `cancelMultiResourceBooking` uses, so bitmap slots _and_
  pooled `quantity_availability` counters are released for multi-resource
  bookings as well.
- **Rescheduling onto an overlapping time was rejected.**
  `rescheduleBookingByToken` checked availability _before_ releasing the
  booking's own slots, so moving a 60-minute booking from 09:00 to 09:30 always
  failed with "Resource is not available for the requested time range".
  `isAvailable()` gained an optional `excludeSlots` parameter and the token path
  now ignores the booking's own slots; foreign bookings on those slots still
  block. (The id-based `rescheduleBooking` was already correct.)
- **`wallClockToUTC` mis-resolved DST transitions.** The offset is now resolved
  in two passes (the `fixOffset` approach of `date-fns-tz`). An ambiguous
  wall-clock time (the repeated fall-back hour) maps to its later occurrence; a
  non-existent time (the spring-forward gap) is folded forward and skipped as a
  slot candidate, so a day-long window never emits the same instant twice.
- **Non-positive slot intervals could hang the slot generators.** `0`, negative
  and `NaN` intervals are clamped to a one-slot step, and `getRequiredSlots`
  returns an empty map for non-finite bounds, so read paths cannot loop forever.
- **`createBooking` did not store `organizationId`**, so
  `listBookings({ organizationId })` missed those bookings. It is now copied
  from the event type. _Host note:_ bookings written before 0.3.0 have no
  `organizationId` and need a one-off backfill if you filter by it.
- **`listBookings` dropped the filters that did not pick the index.**
  `organizationId` / `resourceId` / `eventTypeId` are now applied as
  post-filters, so combinations such as organization + resource work.
- **`isStandalone: false` was not enforced.** An add-on resource could be booked
  on its own. `createBooking` / `createProvisionalBooking` now reject it, and
  `createMultiResourceBooking` requires at least one standalone resource and
  rejects an empty resource list (previously a `TypeError`).
- **Presence holds were keyed per (user, slot) only**, so a user holding the
  same ISO slot on two resources overwrote their own hold and leaving one
  released the other. The presence indexes are now
  `by_user_slot_resource ["user", "slot", "resourceId"]` (`presence` and
  `presence_heartbeats`); `heartbeat`, `leave` and `cleanup` look holds up by
  the full key.

### Added

- **`excludeBookingUid`** on `getMonthAvailability` and `getDaySlots`: the named
  booking's own slots are subtracted from the busy set, so a reschedule UI can
  show the booking's current time as free. Ignored for an unknown uid, a booking
  on another resource, or a booking whose status is not
  `pending` / `confirmed` / `provisional` (a cancelled booking already released
  its slots; excluding it again would free another holder's slots). Applies to
  the non-fungible bitmap only.
- **`resources.metadata`** (`Record<string, string>`, optional) with `metadata`
  arguments on `createResource` and `updateResource`. An update replaces the map
  as a whole; omitting it keeps the stored map. There is no clear form.
- **Maintenance API** (`src/component/maintenance.ts`, exposed through the client
  wrapper). The component's tables are isolated from the host app, so sandbox
  resets and seed scripts need reset functions inside the component:
  - `wipeAllBookingData()` — deletes `bookings`, `booking_history`,
    `booking_items`, `daily_availability`, `quantity_availability` and returns
    per-table counts. The setup (resources, schedules, overrides, event types,
    links, hooks) survives, so the calendar is empty but still bookable.
  - `wipeAllData()` — the above _plus_ the setup tables, dependents first.
  - `getDailyAvailability({ resourceId, date })` — the raw `busySlots` array of
    one resource/day, or `null` when no row exists (`getDaySlots` only reports
    free slots).
  - Presence tables are left alone by both wipes: they are transient locks that
    expire on their own. Both mutations are unauthenticated at the component
    boundary — wrap them in an admin-only mutation in the host app.
- **Client wrapper passthrough** for the schedule-aware availability arguments:
  `getMonthAvailability` now forwards `resourceTimezone`, `scheduleId` and
  `excludeBookingUid`; `getDaySlots` forwards `resourceTimezone`,
  `availableSlots` and `excludeBookingUid`.
- **Split-shift support** in `generateDaySlotsWithTimezone`: candidate starts are
  anchored per contiguous availability window instead of on one global grid, so
  an 08:00–12:00 + 14:00–17:30 schedule with a 150-minute grid offers 08:00 _and_
  14:00 (previously 08:00 and 15:30). Single-window schedules are unchanged.
- **`returns` validators on all six email mutations** (`emails/mutations.ts`):
  `{ success: boolean, emailId?: string, error?: string }` — the shape every
  path already returned.
- **Compound index `resource_event_types.by_resource_event_type`**
  `["resourceId", "eventTypeId"]`. The five exact link lookups in `public.ts`
  and `resource_event_types.ts` use it instead of `by_resource` + a filter.
  Additive; no data migration.

### Changed / hardening

Inputs that were silently accepted before now throw. Check your seed scripts and
admin forms before upgrading.

- **Schedule time windows are validated** in `createSchedule`, `updateSchedule`
  (only when the patch contains `weeklyHours`), `createDateOverride` and
  `updateDateOverride` (only when the patch contains `customHours`):
  - `startTime` / `endTime` must match `HH:MM` between `00:00` and `23:59`
    (previously `timeToSlot("garbage")` produced `NaN` and the day silently read
    as an empty window).
  - minutes must be on the 15-minute grid (`00`, `15`, `30`, `45`) — the
    component's slot size; finer values were rounded down silently.
  - `startTime` must be strictly before `endTime`.
  - `dayOfWeek` must be an integer between `0` (Sunday) and `6` (Saturday).
  - windows of the same day must not overlap; adjacent windows sharing a
    boundary (…–12:00 + 12:00–…) are allowed.
- **Time ranges are validated** by a shared `assertValidRange(start, end)`:
  `Number.isFinite(start) && Number.isFinite(end) && end > start`, otherwise
  `Invalid time range: end must be after start`. It is the first statement of
  `createBooking`, `createProvisionalBooking`, `createReservation`,
  `rescheduleBooking`, `rescheduleBookingByToken` and
  `createMultiResourceBooking`, so the six entry points cannot drift. Inverted
  or `NaN` ranges previously released the old slots and reserved none, leaving a
  live booking that held nothing. Past-date and notice-window policy stays with
  the caller.
- Slot release for cancelled/declined bookings is centralised in
  `src/component/slot_helpers.ts` (`releaseBookingSlots`, `releaseQuantitySlots`,
  `releaseAllSlotsForBooking`) and shared by `transitionBookingState` and
  `cancelMultiResourceBooking`. `booking_items` rows are kept in both paths so
  `getBookingWithItems` keeps working.

### Tests

- New `convex-test` suite for the component: **348 tests across 17 files**
  (`vitest run --typecheck`, edge-runtime environment, `convex-test` 0.0.40),
  up from 3 trivial tests. Register the component in your own tests with
  `@mrfinch/booking/test` — see _Testing_ in the README.

## 0.2.5

- Provisional bookings (`createProvisionalBooking`, `expireProvisionalBooking`)
  and the `booking.pending` hook event. Published to npm on 7 April 2026.

## 0.2.4

- Fixed a `wallClockToUTC` timezone bug for late-night slots; split the date
  heading from the 12/24h toggle in the `Booker` and use the browser locale for
  the date.

## 0.1.0

Initial public release on npm.

- Real-time presence-based slot locking
- Multi-duration booking support (30min, 1h, 2h, 5h)
- O(1) availability queries with discrete time buckets
- Multi-resource booking with add-ons
- React components: Booker, Calendar, BookingForm
- Admin API for resources, schedules, event types
- ACID transaction guarantees via Convex

## 0.0.0

- Internal development release
