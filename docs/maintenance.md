# Maintenance: audit and repairs

The component's tables are private to it, so your host cannot query them. `maintenance.audit`
checks the stored rows for you, and a few mutations make the one-time repairs an upgrade needs.
They are component functions: call them from host internal functions, `makeInternalBookingAPI`
or the CLI, never from clients.

## Upgrading to 0.5.0

1. See what 0.5.0 will meet. The checks below ship with 0.5.0, so run them on a copy: import a
   snapshot of production into a separate deployment, deploy your host with 0.5.0 there, and run
   every check until `isDone`.
2. Before deploying production, change your host and data as the CHANGELOG's 0.5.0 _Upgrading_
   notes say: map the error codes your clients see and, for the bookings `booking_eligibility`
   listed on the copy, link every resource your bundles use to its event type, create resources
   for IDs booked without one, and resolve pending requests and provisional holds on deactivated
   or unlinked configuration. The 0.4.x functions make these repairs.
3. Deploy. Convex checks the stored booking statuses and pool counters against the narrowed
   schema and refuses the deploy while a row holds another value, naming the table and document.
   The component never writes such values, so only rows edited in the dashboard or imported can
   do this: correct them in the dashboard and deploy again.
4. Run every check below on production until `isDone` and repair what it lists. If
   `booking_integrity` reports `organizationMissing`, run `backfillBookingOrganizations`.

## Running the audit

`maintenance.audit({ check, cursor, limit })` reads one page of one table (`limit` 1–500 rows) and
returns `{ issues, scanned, continueCursor, isDone }`. It only reads. Start without `cursor` and
pass `continueCursor` back until `isDone`. The cursor is the complete creation-time key of the
last row read, so no row is skipped or repeated, and rows created during a run are visited too.

This internal action runs every check and returns the issues:

```ts
// convex/bookingAudit.ts
import type { FunctionReturnType } from "convex/server";
import { internalAction } from "./_generated/server";
import { components } from "./_generated/api";

type AuditPage = FunctionReturnType<typeof components.booking.maintenance.audit>;

const checks = [
  "event_type_config",
  "schedule_config",
  "resource_config",
  "date_override_config",
  "link_integrity",
  "booking_integrity",
  "booking_eligibility",
  "booking_status_invalid",
  "event_length_invalid",
  "f10_weekday",
] as const;

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const issues: AuditPage["issues"] = [];
    for (const check of checks) {
      let cursor: string | null = null;
      for (;;) {
        const page: AuditPage = await ctx.runQuery(components.booking.maintenance.audit, {
          check,
          cursor,
          limit: 200,
        });
        issues.push(...page.issues);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }
    return issues;
  },
});
```

Run it with `npx convex run bookingAudit:run`. With `export const { audit } =
makeInternalBookingAPI(components.booking)` in `convex/booking.ts`, you can also page one check by
hand: `npx convex run booking:audit '{"check": "link_integrity", "limit": 200}'`, then again with
`"cursor"` set to the returned `continueCursor`.

## Checks

Each issue names its check and the row (`eventTypeId`, `scheduleId`, `resourceId`, `overrideId`,
`uid`, or the link's `resourceId` and `eventTypeId`); the checks since 0.5.0 also list the row's
`problems`.

| Check | Reads | Problems | Repair |
| --- | --- | --- | --- |
| `event_type_config` | event types | `lengthInMinutes`, `lengthInMinutesOptions`, `slotInterval`: not whole minutes above 0. `lengthNotInOptions`: the length is not one of non-empty options. `bufferBefore`, `bufferAfter`, `minNoticeMinutes`: negative or not finite. `maxFutureMinutes`: not above 0. `timezone`: a zone `Intl` rejects. `scheduleId`: names no schedule, so slot queries with it throw `SCHEDULE_NOT_FOUND`. | `updateEventType` with valid values; give the length and the options together. `null` removes an optional setting, `scheduleId` included. |
| `schedule_config` | schedules | `timezone`: a zone `Intl` rejects. Its hours are read as UTC. | `updateSchedule` with a valid zone. |
| `resource_config` | resources | `timezone`: a zone `Intl` rejects. | `updateResource` with a valid zone. |
| `date_override_config` | date overrides | `type`: neither `unavailable` nor `custom`. `customHours`: `custom` without windows. Both read as the weekly hours. `date`: not a padded `YYYY-MM-DD` day, so lookups by date miss it. | `updateDateOverride` to `unavailable`, or to `custom` with `customHours`. For `date`, create the override on the padded date and delete the old row with `deleteDateOverride`. |
| `link_integrity` | resource ↔ event type links | `resourceMissing`, `eventTypeMissing`: the link names a deleted row. `crossOrganization`: the event type has an organization and the resource another one; bookings over the link are rejected. `duplicate`: a second row of the same pair. | `resource_event_types.deleteAllLinksForResource` or `deleteAllLinksForEventType` for the deleted ID. `unlinkResourceFromEventType` for a cross-organization pair; link a resource of the event type's organization instead. `linkResourceToEventType` again for a duplicate, which collapses the pair. |
| `booking_integrity` | bookings and their items | `organizationMissing`: no organization although the event type has one, and every resource the booking holds belongs to it. `organizationMismatch`: another organization than the event type's, or none while a resource it holds is missing or belongs to another organization; the backfill lists these and leaves them. `poolWithoutItems`: an active single-resource booking on a resource that became a pool; it cannot be moved. | `maintenance.backfillBookingOrganizations` for `organizationMissing`. An `organizationMismatch` booking whose resources belong to the event type's organization takes it when moved; cancel the others, or keep them as they are. Cancel a `poolWithoutItems` booking, or set `isFungible: false` on its resource again (a pool of capacity one accepts that). |
| `booking_eligibility` | active bookings and their items | A pending, confirmed or provisional booking (legacy rows excepted) that today's booking rules reject, so moving or confirming it fails. The issue also shows `status`, `start`, `eventTypeId` and `resourceIds`. `eventTypeMissing`, `eventTypeInactive`: the event type is deleted or deactivated. `resourceMissing`: an ID without a resource (0.4.x bundles took unknown IDs). `resourceInactive`: a deactivated resource. `resourceNotLinked`: not linked to the event type (0.4.x bundles needed no links). `crossOrganization`: a resource of another organization than the event type, resources of two organizations, or a stored organization that is not the resources'. `noStandalone`: every resource is an add-on. | `linkResourceToEventType`, `createResource` for an unknown ID, `toggleEventTypeActive` or `toggleResourceActive` to reactivate. Otherwise cancel or decline the booking, which is always allowed. |
| `booking_status_invalid` | bookings and their history | `status`: the booking's status is not one of the six. `historyStatus`: a history row's is not. The issue's `status` is the stored value. | The 0.5.0 deploy refuses such rows and names them; correct them in the dashboard. On a deployed 0.5.0 the check confirms that none is left. |
| `event_length_invalid` (0.4.3) | event types | A length or length option that is not a positive number; the slot queries reject it. The issue shows the stored values. | `updateEventType`. `event_type_config` lists these rows too. |
| `f10_weekday` (0.4.3) | bookings | An upcoming booking that 0.4.2 admitted on a weekday without opening hours (schedules at UTC+12 and beyond). The issue shows `start`, `scheduleId` and the local `date`. | Bookings are not moved; contact the booker or keep it. |

## One-time repairs

- `maintenance.backfillBookingOrganizations({ cursor, limit, dryRun })` gives bookings without an
  organization their event type's when every resource they hold (every item of a bundle) exists
  and belongs to it. It never rewrites a booking whose organization differs from its event
  type's, and never stamps one on a booking whose resources belong elsewhere; it lists both in
  `mismatches` (the latter without `organizationId`). A second run updates nothing.
- `presence.sweepOrphanedHolds({ cursor, limit, dryRun })` removes presence holds whose cleanup
  job was lost; run it once after upgrading from 0.4.2 or earlier.
- `resource_event_types.deleteAllLinksForResource({ resourceId })` and
  `deleteAllLinksForEventType({ eventTypeId })` remove the links of an ID deleted before 0.5.0.
  `makeInternalBookingAPI` does not wrap them; call them through `components.booking`.

The first two page like the audit (`limit` 1–500, `continueCursor` until `isDone`), and
`dryRun: true` only counts. `makeInternalBookingAPI` wraps both.
