# Changelog

## 0.4.3 — Unreleased

### Upgrading

- After upgrading from 0.4.2 or earlier, run two one-time repairs from a host internal
  mutation or `makeInternalBookingAPI`, passing `continueCursor` back until `isDone`
  (`limit` 1–500, `dryRun: true` only counts): `presence.sweepOrphanedHolds` for holds
  whose cleanup job was cancelled or failed, `maintenance.backfillBookingOrganizations`
  to give bookings without an organization (bundles created without `organizationId`,
  pre-0.3.0 ones) their event type's; it only lists mismatches.
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
- The `bookings` index `by_event_type` becomes `by_event_type_start`, which Convex
  builds during the deploy (allow time on a large table). Booking documents can carry
  the new optional `rescheduledToUid`; host validators of booking fields must accept it.

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

### Added

- `presence.sweepOrphanedHolds`, `maintenance.backfillBookingOrganizations` and the
  read-only `maintenance.audit`, each with a `makeInternalBookingAPI` wrapper.
- `getDaySlots` takes an optional `scheduleId` that fills in omitted hours and zone.
- `rescheduledToUid`, set on a moved original to the new booking's uid (from 0.4.3 on).
- `cancelReservation` takes optional `reason` and `cancelledBy`, `rescheduleBooking` an
  optional `changedBy`; `isSendableAddress` is exported from `@mrfinch/booking/emails`.

### Documentation

- The [README](README.md) documents the host contract; the new
  [hook payload reference](docs/hook-payloads-v1.md) lists the v1 payloads and the
  [custom email guide](docs/custom-emails.md) covers key rotation and Resend accounts.
  The 0.3.1 entry no longer misstates `cancelReservation`'s result.

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
- A drift test compares the argument validator of every
  `makeInternalBookingAPI` wrapper with its component function's
  (`exportArgs()`, nested fields and optional flags included). The only
  allowed difference is a component `v.id(…)` taken as a string.
- `listBookings` is compared with a copy of the 0.4.2 implementation over
  randomized bookings with many equal starts, every selector, status, date
  and limit combination, with the documents each call reads counted.
- Canary tests run the nested Resend component's delivery worker: mail waiting
  for a batch goes out with the newest key, a rejected key of another account
  fails its whole batch, and one account with several senders sends all mail.
  A Resend upgrade that changes this fails them.
- The documented host duties are pinned as current behaviour: eligibility per
  entry point, `scheduleId: ""`, and omitted or emptied update fields.
### Fixed

- The Booker shows failed bookings and reschedules in an announced alert: on the
  details step, and above the calendar for one-click reschedules. The text comes
  from the host's `ConvexError` data (`data.message`, or string data); other
  failures show a generic message instead of Convex transport text or
  "Server Error". `UNAUTHENTICATED` still goes to `onAuthRequired` when supplied;
  otherwise the Booker asks the user to sign in.
- A missing management token or `rescheduleBookingByToken` reference is reported
  as a configuration error instead of a silent no-op or a misleading token message.
- Repeated submits or slot clicks in the same tick send one mutation. During a
  one-click reschedule the slots are disabled and a status message is shown.
- The advisory slot hold ends after a successful booking or reschedule and after
  a failed one-click reschedule.
- Changing `eventTypeId`, `resourceId` or `originalBooking.uid` starts a fresh
  flow. An `originalBooking` that arrives after mount now reschedules with its own
  duration and time zone.
- A completed reschedule is final: the success screen no longer offers
  "Book Another", which targeted the replaced booking.
- The reschedule confirmation step (`reuseBookerInfo={false}`) shows the original
  contact details read-only. Its editable fields were never applied.
- The confirmation and success steps follow the calendar's 12h/24h choice and the
  browser locale.
- The Booker never invents a location. It submits the event's first configured
  location with its configured type, and its address as the value when it has
  one. Without a configured location it submits `{ type: "unknown" }` with no
  value. "Studio A" is gone, and phone, link and in-person locations are no
  longer relabelled `"address"`. The success screen shows a location only when
  it has a value, with a map pin only for `"address"` and `"in_person"`.
- Keyboard and screen-reader use: the duration choice is a native radio group
  ("Duration"). Form fields are named by their labels, expose required and
  invalid state and reference their error message. Reserved slots keep their
  time in their name. Day buttons expose the full date, the selected day
  (`aria-pressed`) and today (`aria-current="date"`). The 12h/24h toggles expose
  `aria-pressed`. Each step change moves focus to the new step's heading,
  including the confirmation. The time zone row no longer looks clickable.
- Configuration errors no longer trap users. When the host passes the callback
  for an error's recovery (`onEventTypeReset` or `onNavigate`; the duration
  reset is built in), the error is a modal alert dialog with focus on its
  action, and Escape performs the action. Without that callback, an inline alert
  replaces the Booker's content and the rest of the page stays usable; before, a
  full-screen overlay offered a button that did nothing. The error no longer
  covers the success screen. While it is shown, a new booking cannot continue;
  reschedules are not blocked by the UI.
- Calendar days no longer shift when the display time zone differs from the
  browser's. A day's label, availability dot, queried date, heading and
  highlight are the same calendar date in every browser zone. Before, a display
  zone west of the browser (for example `America/New_York` viewed from Europe,
  or rescheduling a booking stored in another zone) queried and booked the
  previous day and disabled today, and DST months repeated a date. Today and
  past days are judged in the display zone; the automatic selection is today
  there, and the Booker opens on that month. Calendar days remain the
  schedule's days; slot times are shown in the display zone.
- "Reserved" slots compare instants: a slot is reserved exactly when another
  session holds a 15-minute quantum that overlaps it. Presence is read for
  every UTC date the day's slots and their duration cover. Before, one UTC date
  was read and holds were matched by time of day, so days that span two UTC
  dates (New Zealand and Australia, American evenings, windows around local
  midnight) showed held slots as free and free slots as reserved.
- `useSlotPresence` reports `isLocked` while any other session holds the slot
  and `isHeldByMe` while this session does. Before, the latest heartbeat
  decided, so a slot held by two sessions flickered between locked and free.
- `getSessionId` no longer throws when `sessionStorage` is blocked, disabled
  (`null`) or full, which crashed the Booker and the Calendar.
- `useConvexSlots().fetchMonthSlots` requests the same range in every browser
  zone; east of the display zone it was shifted by a day.
- `@mrfinch/booking/react` uses fully specified relative imports
  (`./context.js`, `./components/calendar/index.js`). The entry now loads with
  Node's ESM loader and Vitest's default dependency handling, builds with plain
  webpack 5 or Rspack, and keeps its types under `moduleResolution: "nodenext"`.
  Before, these failed with `ERR_MODULE_NOT_FOUND` or "Can't resolve
  './context'", and nodenext typed every React export as `any`. Next.js and Vite
  builds were not affected. A Vitest `server.deps.inline` workaround for the
  package keeps working and is no longer needed.
- `BookingProvider` resolves admin operations from `adminApi`. With the
  generated `adminApi={api.admin}`, every admin operation resolved to the public
  module (`public:createResource`), so calls failed as unknown functions or ran a
  same-named public function. Public operations always resolve from `publicApi`.
- The `BookingProvider` and `useBookingAPI` documentation no longer presents the
  choice of references as authorization or shows a conditional `useMutation`
  call. Host functions enforce access; booking reads must check the management
  token or the caller's ownership and must not return `managementToken` to
  anonymous callers.
- `Calendar` shows the "event type has been deleted" notice when `getEventType`
  resolves to `null`, including after a valid event type is deleted, instead of
  a calendar for the missing event type. The Booker already showed its
  event-deleted recovery for `null`.

### Added

- Optional `onBookingError(error, { phase })` on `Booker`, called in addition to
  the built-in alert.
- Optional `submitError`, `readOnlyDetails`, `timeFormat` and `locale` on
  `BookingForm`; `timeFormat` and `locale` on `BookingSuccess`; `disabled` on
  `Calendar`, `TimeSlotsPanel` and `TimeSlotButton`. `formatDate`,
  `formatTimeDisplay` and `formatDateTime` accept an optional locale, and
  `formatDateTime` an optional time format. Defaults are unchanged.
- `ValidationError.recovery` (`"select-event-type"`, `"select-resource"` or
  `"reset-duration"`) and the exported `ValidationRecovery` type.
  `onEventTypeReset` and `onNavigate` on `Booker` and `BookingErrorDialog`
  receive it as an extra argument.
- `CalendarDay.civilDate` (`"YYYY-MM-DD"`), always set by
  `generateCalendarDays`. On `useConvexSlots`: `fetchSlotsForDate(date)` for a
  `"YYYY-MM-DD"` date, `fetchMonthSlotsFor(year, month)` with `month` 1-12, and
  `presenceIncomplete`.

### Deprecated

- `ValidationError.recoveryPath`, which hard-codes the demo's `/book` routes: map
  `recovery` to your own routes instead. The unused `BookingValidationError` and
  `BookingValidationResult` types and the never-stored `"rescheduled"` booking
  status are deprecated too. All remain available.
- `useConvexSlots().fetchSlots(date)` and `fetchMonthSlots(date)`: use
  `fetchSlotsForDate` and `fetchMonthSlotsFor`. `fetchSlots` keeps its meaning,
  the date of that instant in the hook's time zone, which is not the day a
  calendar cell names when that zone is west of the browser's.
- Resolving admin operations from `publicApi`: without `adminApi`, or for an
  operation a hand-built `adminApi` lacks, `useBookingAPI()` still returns the
  `publicApi` reference. Pass `adminApi` wherever admin operations are used;
  0.5.0 decides whether this fallback stays.

### Integration

- Hosts that already toast booking errors, for example by wrapping mutations, now
  show two messages. Remove the wrapper or move it to `onBookingError`. Throw
  `ConvexError({ code, message })` from host functions to show a specific message.
- `BookingSuccess` no longer renders "Book Another" when `isRescheduling` is set.
- Booker bookings store the configured location type (for example `"phone"`,
  `"in_person"` or `"link"`) instead of always `"address"`, `{ type: "unknown" }`
  for events without locations, and no value for locations without an address.
  Render a location by `location.value`, not by `booking.location &&`. Existing
  bookings keep what they stored, including "Studio A".
- Pass `onEventTypeReset` and `onNavigate` to offer a way back from
  configuration errors; without them the Booker shows an inline notice. The
  callbacks now receive the recovery kind as an extra argument, so wrap
  callbacks that take optional parameters of their own, such as a state setter.
- Markup changes for CSS and selectors: durations are radio inputs in a
  `fieldset` instead of `li` elements; `BookingErrorDialog` renders a native
  `dialog` (opened with `showModal()`) or an inline `role="alert"` instead of a
  fixed overlay; the Booker wraps its steps in a `display: contents` element.
- Dates passed to and emitted by `Calendar` (`selectedDate`, `onDateChange`,
  `currentMonth`) and `generateCalendarDays` are day carriers: their local
  calendar fields name the day. The automatic selection emits local midnight of
  today in the display zone instead of the current instant. If you query with
  `fetchSlots(date)` yourself, switch to `fetchSlotsForDate(day.civilDate)`.
- `useConvexSlots` reads presence once the day's slots have arrived, with up
  to three `getDatePresence` queries (one per UTC date) instead of one. When
  the slots and their duration span more dates, which needs bookings of about
  a day or longer, it logs one warning, sets `presenceIncomplete` and shows no
  holds from the dates it did not read. The booking mutation still checks
  inventory.
- `fetchSlotsForDate` and `fetchMonthSlotsFor` throw a `RangeError` for
  impossible dates or months. `generateCalendarDays` and `fetchMonthSlots` do
  the same for an invalid `Date` instead of producing "Invalid Date" keys.
- Without usable `sessionStorage` the presence session ID is kept in memory,
  so it changes on reload: until it expires (about 10 seconds), the visitor's
  own earlier hold shows as another session's.
- The Booker's event-deleted recovery needs `getEventType` to resolve to `null`
  for a missing event type, but until 0.5.0 the component's `getEventType`
  throws `Event type not found`. Make your public wrapper return `null` for
  that error (see the README) and render the Booker inside an error boundary;
  otherwise the error reaches the boundary or the framework's error page.
- A hand-built (plain-object) `adminApi` that carries a public operation name,
  such as `getEventType`, no longer overrides `publicApi` for it. Names outside
  both interfaces still come from `adminApi` when it has them.

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
