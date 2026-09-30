# Changelog

## 0.4.3 — Unreleased

### Upgrading

- After upgrading from 0.4.2 or earlier, run the new
  `presence.sweepOrphanedHolds` once from a host internal mutation (or through
  `makeInternalBookingAPI`). Start without a cursor and pass `continueCursor`
  back until `isDone`; `limit` is 1–500 per call and `dryRun: true` only
  counts. It repairs presence holds whose cleanup job was cancelled or failed
  and touches only the presence tables. Fresh installs do not need it.
- Presence cleanup jobs that 0.4.2 already queued keep running; their
  arguments are unchanged. Surplus jobs left by earlier leave/rejoin cycles are
  not merged: they no longer grow, and they end with their session, 10–20 s
  after its last heartbeat. This falls short of the earlier goal of merging
  them within one cleanup round. The fix is verified with convex-test; a check
  of the scheduler's cancel behaviour on a deployed backend is recommended
  before release.
- Do not mass-cancel `presence:cleanup` jobs to tidy up. That orphans live
  holds until their next heartbeat or the sweep.
- The availability queries now reject an `eventLength` that is not a positive
  number. The Booker takes it from the event type, so check stored event types
  before upgrading, for example in a host query:
  `(await ctx.runQuery(components.booking.public.listEventTypes, {})).filter((et) => ![et.lengthInMinutes, ...(et.lengthInMinutesOptions ?? [])].every((n) => Number.isFinite(n) && n > 0))`.
  Slot queries for such event types throw after the upgrade instead of
  offering slots on booked days. After upgrading, the new `maintenance.audit`
  query with `check: "event_length_invalid"` lists them.
- Schedules in zones at UTC+12 or beyond (New Zealand, Fiji, Tonga, Samoa,
  Kiribati, Kamchatka; Norfolk Island in summer) now use each day's own
  weekly hours; until 0.4.2 every day used the next weekday's. If you shifted
  `weeklyHours` by a day to compensate, shift them back when you upgrade.
  Existing bookings are not moved. `maintenance.audit` with
  `check: "f10_weekday"` lists upcoming bookings that lie outside the hours of
  their own weekday on such dates, so you can review them.
- Schedule, resource and event-type writes reject a time zone that `Intl`
  does not accept. Rows stored with one stay readable and can still be
  edited; a patch that sets a valid zone repairs them.
- Bundles created by 0.4.2 or earlier without `organizationId` have no
  organization (nor do single bookings from before 0.3.0). Run the new
  `maintenance.backfillBookingOrganizations` once, like the sweep above
  (`cursor`, `limit` 1–500, `dryRun`), to give them their event type's.
  It skips legacy `createReservation` rows and rows whose event type is
  deleted or has none, and lists rows whose organization differs from their
  event type's without changing them. From then on those bundles appear in
  organization lists and reach organization-scoped hooks.
- `registerHook` and `updateHook` accept only function handles from
  `createFunctionHandle` (strings starting with `function://`) and reject
  anything else with `Invalid hook functionHandle "…"`. Hook rows stored
  earlier with another string are skipped when their event fires and log
  `Skipped hook <id>: …`; find them with `listHooks` and remove them with
  `unregisterHook`. They never reached the host (see Security).

### Security

- The six built-in email templates render booking text as text. Guest names,
  event titles and cancellation or decline reasons were inserted as raw HTML,
  so markup in them became live links, images or hidden content in mail sent
  from the host's sender. Text with `&`, `<`, `>`, `"` or `'` now reads the same
  in every mail client; host snapshot tests of the default HTML may change.
  Custom renderers still receive the unescaped values, and stored data is
  unchanged.
- The management buttons of the built-in templates use the same validated
  links as `email.links` for renderers. A trailing slash in `baseUrl` is
  normalized and its query and hash are dropped. A `baseUrl` that is not an
  absolute `http(s)` URL (for example `javascript:` or a value without a
  scheme) or that contains credentials yields no buttons: the mail shows the
  contact text instead and the job logs a warning. The uid is now URL-encoded
  in the path.
- Built-in subjects follow the renderer rules: runs of CR, LF and NUL become a
  space, and subjects are capped at 200 characters.
- Hooks run only function handles. The scheduler treats any other string as
  a function path inside the booking component, so a hook registered as
  `maintenance:wipeAllBookingData` scheduled that component mutation on the
  next booking, and only its argument validator stopped it: whoever could
  register hooks could name the component's own functions. Registration now
  rejects such strings and stored ones are skipped (see Upgrading). Hook
  payloads carry the management token and booker details, so keep
  registration server-side and administrator-only.

The internal email mutations keep their names and arguments, so jobs queued by
0.4.2 still run and render with the escaped templates.

### Fixed

- Weekly hours apply to the weekday of the calendar day itself, whatever the
  schedule's zone. At UTC+12 and beyond every date used the next weekday's
  hours (a Tuesday-only schedule was closed on Tuesday and open on Monday), in
  `getEffectiveAvailability` and the schedule-aware month view, and hosts that
  validate bookings against the day view enforced the wrong days. Date
  overrides were not affected.
- On a spring-forward day, a window that reaches into or across the skipped
  hour no longer offers bookings that end after it closes. Berlin 01:00–04:00
  on 2027-03-28 lasts two hours: a 120-minute booking now starts at 01:00
  only (01:15–01:45 ended up to 45 minutes after closing), a 01:00–03:00
  window no longer offers one at all, and a full-day event on a 00:00–24:00
  window is not offered on the 23-hour day. A window closes when its last
  existing quarter hour ends, so one that ends where the gap starts keeps its
  starts. Starts inside the gap are still skipped, and 15-minute events are
  unaffected.
- A wall-clock time that occurs twice on a fall-back day now means its first
  occurrence in every zone (as in RFC 5545 and Temporal's default). Zones west
  of UTC already worked that way; zones east of UTC used the second. In
  Europe/Berlin on 2027-10-31, 02:00–02:45 are now offered in summer time
  (00:00Z–00:45Z) instead of winter time (01:00Z–01:45Z). As before, only one
  of the two occurrences is offered, and a booking that fits only in elapsed
  time (four hours in a 01:00–04:00 window) is not.
- The availability queries reject inputs that have no meaning instead of
  answering them with silent nonsense: an `eventLength` of zero, below zero,
  `NaN` or infinite (-900 offered 60 starts on a fully booked day), slot
  indices outside the integers 0–95, dates that do not exist (`2027-02-30`
  answered with March 2) and `dateFrom` after `dateTo`. The errors read
  `Invalid eventLength …`, `Invalid availableSlots index …`,
  `Invalid date "…"` and `Invalid date range: …`. `getDaySlots`,
  `getMonthAvailability`, `getEffectiveAvailability`, `getDateOverride`,
  `listDateOverrides` and `createDateOverride` check their dates. Lengths are
  still rounded up to the 15-minute grid, and a non-positive `slotInterval`
  still counts as 15 minutes.
- Unpadded dates such as `2027-3-9` mean the same day as `2027-03-09` at every
  entry point. `createDateOverride` stores the padded form, which is the one
  the availability queries look up.
- `getAvailability` checks one UTC date at a time and stops at the first busy
  one, so a range whose start is taken returns after two reads however long it
  is. It used to build the whole range's slot list first (about a second for
  30 years). A free range still reads every date: about 4,095 dates fit
  Convex's index-range limit per call. There is no range cap in the component;
  bound the ranges your host forwards.
- Booking writes and `getAvailability` reject instants beyond what a `Date`
  can hold with `Invalid time range: start and end must be representable
  dates` instead of failing later with a `RangeError`.
- `getMonthAvailability` with `scheduleId` but no `resourceTimezone` reads the
  schedule's hours in the schedule's own zone. It compared them with UTC
  bookings, and an empty day fell back to 09:00–17:00 UTC, so closed and fully
  booked days read as open. A `resourceTimezone` that differs from the
  schedule's zone is still used and now logs a warning. Other argument shapes
  are unchanged.
- Schedule, resource and event-type writes reject a time zone that `Intl`
  does not accept, such as `Mars/Olympus_Mons`, `UTC+2` or `""`
  (`Invalid time zone "…"`); patches check the zone only when they set one.
  A schedule stored with such a zone made every availability read for it
  throw.
- One malformed recipient address no longer takes other bookers' mail down
  with it. Built-in email to an address that fails a conservative syntax check
  (for example `x@`) is skipped before it is queued: the job returns
  `{ success: false, error: "INVALID_RECIPIENT" }` and logs no address.
  Previously such an address could fail the whole Resend batch it shared with
  valid mail. This is input hardening, not the provider's full validation.
  Bookings are still accepted with any address.
- `isSendableAddress` is exported from `@mrfinch/booking/emails`, so hosts can
  apply the same rule in their booking forms.
- A stored booking time zone that `Intl` rejects, or an empty one, no longer
  fails every email for that booking. The built-in templates render the
  times in UTC, labelled "UTC"; custom renderers still receive the stored
  value.
- Presence no longer piles up background cleanup jobs. When a selection was
  left and taken again before its cleanup job ran (switching between
  overlapping slots, changing the duration, React StrictMode in development,
  Back and reselect, or any client calling `leave` and then `heartbeat`), the
  old job adopted the new hold. Each such cycle added a job that rescheduled
  itself every 10 s for as long as the hold stayed active. `leave` now cancels
  the hold's pending cleanup job, so every hold has exactly one and fewer
  background jobs run. `heartbeat` and `leave` keep their arguments and
  results.
- A hold whose cleanup job had been cancelled or had failed never expired once
  the visitor left without `leave` (for example by closing the tab). The next
  heartbeat now schedules a replacement job.
- A resource and an event type are linked by at most one row. A
  `setResourcesForEventType` or `setEventTypesForResource` call that repeated
  an id not yet linked wrote one row per repetition (every release since the
  first), and from then on `createBooking`, `createProvisionalBooking`,
  `hasResourceEventTypeLink`, `linkResourceToEventType` and
  `unlinkResourceFromEventType` failed for that pair with a `unique()` error,
  while the id lists returned the pair twice. Repeated ids now link once.
  Duplicates already stored are harmless to reads: the checks answer, the
  lists name each item once, and booking writes no link row. The next link,
  unlink or replace call for the pair collapses them, and unlink removes every
  row. Unknown ids in the replace mutations are still skipped silently.
- `cancelReservation` records the cancellation like the other cancel paths:
  one `booking_history` row (from the previous status to `cancelled`),
  `cancelledAt` and `updatedAt` set to the time of the call, and
  `cancellationReason`. It only changed the status, so the history showed no
  cancellation, `updatedAt` kept its creation time and booker pages that show
  cancellation details from these fields showed none. This applies to every
  row it accepts, legacy `createReservation` rows included. Inventory release,
  the `booking.cancelled` hook payload and the idempotent repeat
  (`alreadyCancelled: true`, nothing written) are unchanged. Hosts that read
  the history see the extra row for new cancellations only; earlier ones are
  not backfilled.
- `createMultiResourceBooking` without `organizationId` stores the event
  type's organization, as `createBooking` and `createProvisionalBooking` do.
  Such bundles (the documented recipe omits the argument) had none: they were
  missing from `listBookings({ organizationId })`, reached only global hooks,
  and gave custom email renderers no organization, through later moves and
  cancellations too. Organization-scoped hooks now receive their events. The
  hook envelope carries `organizationId`, and payloads that include the
  stored booking (token cancellation, transitions) have the existing
  "bundle with organization" v1 shape; no payload gains a key. An explicit
  `organizationId` is still stored as given, also when it differs from the
  event type's, and an event type without an organization keeps using the
  argument.
- New management tokens are 64 lowercase hex characters from
  `crypto.getRandomValues`, made by one helper for `createBooking`,
  `createProvisionalBooking` and `createMultiResourceBooking`. The code
  comment promised this format, but tokens were 91–97 base-36 characters
  ending in a readable timestamp. This fixes the format; it does not claim
  more entropy, since Convex seeds randomness per function run. Existing
  tokens keep working (they are compared exactly, never parsed) and a move
  still keeps its token, so hosts that check tokens before forwarding them
  must accept both formats.

### Added

- `presence.sweepOrphanedHolds({ cursor?, limit, dryRun })`, a component
  mutation, and the matching `makeInternalBookingAPI` wrapper: the one-time
  repair described under Upgrading. It returns the counts `scanned`, `deleted`
  and `rescheduled` plus `continueCursor` and `isDone`.
- `getDaySlots` accepts an optional `scheduleId`. It supplies the day's
  effective hours when `availableSlots` is omitted and the schedule's zone when
  `resourceTimezone` is omitted, so `{ resourceId, date, eventLength,
  scheduleId }` replaces the `getEffectiveAvailability` + `getDaySlots` pair.
- `maintenance.audit({ check, cursor?, limit })`, a read-only component query,
  and the matching `makeInternalBookingAPI` wrapper: the upgrade checks
  described under Upgrading, one check and one page (`limit` 1–500) per call.
  It returns `issues`, `scanned`, `continueCursor` and `isDone`. For
  `f10_weekday` the schedule is the booking's event type's, else the
  organization's default schedule, as in the reference host.
- `cancelReservation` accepts an optional `reason` and `cancelledBy` (the
  history actor, `"unknown"` when omitted, as in
  `cancelMultiResourceBooking`); the reason also reaches the cancellation
  email's `emailContext.reason`. The `makeInternalBookingAPI` wrapper passes
  both through. `rescheduleBooking` accepts an optional `changedBy` for the
  history rows of the move (the original's cancellation and the new
  booking's creation), `"system"` when omitted as before.
- Bookings have an optional `rescheduledToUid`. A move sets it on the
  original, whose status stays `cancelled`, to the new booking's uid (the new
  booking still points back through `rescheduleUid`), so a move can be told
  from a cancellation without reading `cancellationReason`: a custom
  `rescheduleBooking` reason replaced the default text, and a real
  cancellation may carry it. Cancellations never set the field, a chain of
  moves is linked step by step, and hooks are unchanged. Moves made before
  0.4.3 do not have it.
- `maintenance.backfillBookingOrganizations({ cursor?, limit, dryRun })`, a
  component mutation, and the matching `makeInternalBookingAPI` wrapper: the
  repair described under Upgrading. It returns `scanned`, `updated` (with
  `dryRun`, the rows it would update), `skipped`, `mismatches`
  (`{ uid, organizationId, eventTypeOrganizationId }`), `continueCursor` and
  `isDone`, and is idempotent. Backfilled bundles have the existing "bundle
  with organization" v1 hook payload shape.

### Maintenance and documentation

- The README states when presence releases a selection: an explicit leave
  releases it immediately, an abandoned one 10–20 s after its last heartbeat,
  plus scheduler latency.
- The npm package excludes every test file (`*.test.*`, `*.test-d.*`) and the
  test-only helpers in `src/testing/`, under `src/` and `dist/` alike.
  Previously only `*.test.ts` was excluded, so a `.test.tsx` file would have
  shipped. No published runtime file changes.
- The 0.3.1 entry no longer says `cancelReservation`'s result matches
  `cancelBooking` (which does not exist) and `cancelMultiResourceBooking`
  (which returns `{ success }` only).
- The seven ways a booking ends (`cancelReservation`, `cancelBookingByToken`,
  `cancelMultiResourceBooking`, `transitionBookingState` to `cancelled` or
  `declined`, `expireProvisionalBooking` and the original of a move) share one
  implementation for inventory release, history and the cancellation fields.
  Each keeps its checks, error texts, default actor and reason, idempotency
  and hook payload.
- The internal `hooks:triggerHooks` returns `null`. Its
  `{ triggeredCount, emailsSent }` counted matching hooks rather than
  scheduled ones and always said `emailsSent: true`, also for events that
  send no mail. It runs only as a scheduled job, which keeps no result, so
  nothing could read it; its arguments are unchanged and queued jobs still
  run.

### Tests

- Characterization tests pin the registered component function paths (checked
  against the generated `ComponentApi`), the v1 hook payload shapes per emitter
  and stored booking shape, and the entry-point error texts and check order
  that hosts match. Changing any of them fails the suite and must be deliberate.
- Time-sensitive tests can run under a chosen process time zone
  (`src/testing/process-time-zone.ts`).
- Regression suites for weekdays in 14 zones, DST days (including a sweep
  against an `Intl`-only oracle), input validation, zone validation, the new
  schedule arguments and the audit. The time-dependent ones run under several
  process time zones.
- Link-integrity and lifecycle suites: duplicate link rows, cancellation
  metadata per row kind, and a parity table across the cancel-like paths
  (single and bundle rows, pool units included).

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
