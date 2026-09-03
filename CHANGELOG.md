# Changelog

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
  instead of `null`, matching `cancelBooking` and `cancelMultiResourceBooking`.
  Cancelling an already-cancelled reservation reports
  `{ success: true, alreadyCancelled: true }` without releasing slots again; a
  missing reservation still throws.
- **Bookings indexes were renamed and trimmed** (6 → 4): `by_org` →
  `by_org_start` `[organizationId, start]`, `by_resource` → `by_resource_start`
  `[resourceId, start]`; the unused `by_email` and `by_org_status` are gone.
  Component indexes are not addressable from the host, so no host code changes;
  your next `convex deploy` backfills the two new indexes.
- The React-only peers (`react`, `react-hook-form`, `@hookform/resolvers`,
  `zod`, `lucide-react`) are marked optional in `peerDependenciesMeta`. Nothing
  behind the package root imports them, so backend-only installs no longer pull
  the React stack (or hit `ERESOLVE` against a React 17 / zod 4 host) for the
  `./react` subpath they never use. Install them yourself when you use
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
  instead of `null`, matching `cancelBooking` and `cancelMultiResourceBooking`
  (see _Upgrading_).
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
  and the `booking.pending` hook event. Never published to npm.

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
