# Optional app email renderer

Status: implemented in 0.4.2 on 2026-09-23 after the user's authorization.

Verification: 503 component tests, 54 portfolio tests, TypeScript and lint checks,
production builds, 17 documentation examples and 224 documentation links passed.
The real development deployment rendered and delivered confirmation, rescheduling
and cancellation emails through the app callback and Booking's nested Resend.
Both smoke-test bookings were cancelled; the temporary helper was removed.
Date: 2026-09-22. Baseline: @mrfinch/booking 0.4.1.

## Goal and ownership

Booking continues to own transactional notifications: selecting the notification,
capturing booking data, scheduling its processing and invoking its nested Resend
component. An optional renderer in the host app can replace presentation:
subject, HTML and optional plain text. Existing installations retain their
current built-in templates and require no new configuration.

The user subsequently authorized implementation, tests, npm publication and a
Mr. Finch portfolio integration with its own email design. Preserve environment
files and existing bookings. Publication remains gated on verification.

## Decisions for the first version

1. Use an app `internalQuery` renderer through a Convex query Function Handle.
2. Carry its optional handle in the existing server-owned `resendOptions`.
3. Do not introduce a registration mutation or a configuration/template table.
4. Keep the six current notification kinds: `confirmed`, `pending`, `approved`,
   `declined`, `cancelled`, `rescheduled`.
5. Keep the existing scheduled email mutations and nested Resend instance.
6. Keep `makeInternalBookingAPI` as a function-based API; no class migration.

### How Booking knows a renderer exists

A host helper holds the renderer reference alongside the existing API key,
sender and base URL configuration. During a host function invocation the helper
uses `createFunctionHandle` to convert the reference to a serializable handle.
That handle travels with `resendOptions` through every email-producing operation.

The developer configures the reference in one server module. This is not a
persisted registration: the options still accompany each operation. There is no
template lookup, repository download or database read to discover a renderer.
Booking only checks whether the optional handle is present. Calls without
`resendOptions` continue to send no email, even if other configuration exists.

A host must use the shared options helper consistently for creation, cancellation,
rescheduling and administrative state transitions. The helper is invoked within
Convex function execution, not at module import time. No global in-memory cache
or singleton is used to provide cross-invocation correctness.

### Renderer contract

Export shared TypeScript types and runtime validators, preferably through a new
`@mrfinch/booking/emails` entry point. Proposed input is a discriminated notification
context with `version: 1` and `kind`, containing a snapshot of the relevant data:

- Stable notification identity and event timestamp.
- Organization/resource/event identifiers where available.
- Booker name/email, event title, start/end and timezone.
- Final booking UID and prepared view/reschedule/cancel URLs where applicable.
- Previous/new times for rescheduling; reason for cancellation or decline.

Use deliberate optional fields for genuinely absent legacy data. Existing legacy
reservation calls must not fail because newer booking metadata is unavailable.
Supply no Resend credentials to the renderer. The return value is:

```ts
type RenderedBookingEmail = {
  subject: string;
  html: string;
  text?: string;
} | null;
```

`null` explicitly requests the built-in template for that kind. A host can thus
override only confirmations and leave all other kinds unchanged. Recipient,
sender, API key and delivery options remain controlled by Booking/the existing
server-owned configuration; a renderer cannot redirect mail via its result.

Validate return shape, nonempty subject/HTML, subject header characters and a
documented payload-size budget below Convex/Resend limits. Define/test the exact
budget during implementation against the current documented limits. Examples
must escape dynamic HTML text and attributes and use validated management URLs.

### Selection and fallback policy

| Situation | Planned behavior |
| --- | --- |
| No renderer handle | Built-in template; no host renderer invocation |
| Renderer returns valid content | Use custom subject/HTML/text |
| Renderer returns `null` | Built-in template for that notification |
| Renderer throws, cannot be resolved or returns invalid content | Fail the email job visibly; the booking remains committed |
| Resend enqueue/delivery fails | Follow delivery error handling; never send a second built-in email as fallback |

Absent customization and broken customization are distinct. Do not silently
hide a renderer bug behind a default email. Include a documented recovery path
after fixing the host renderer, reusing the original notification identity and
snapshot. A configurable fallback on renderer errors can be discussed separately
if a consumer requires it; it is not necessary for this first version.

## Processing and consistency

```text
Booking mutation commits + schedules notification with snapshot/options
  -> existing scheduled Booking email mutation
     -> built-in renderer OR app internalQuery
     -> validated final content
     -> nested Resend enqueue
        -> stored content + asynchronous delivery/retries
```

Resolve custom output with `ctx.runQuery` inside the scheduled email mutation.
Rendering occurs after booking commit. Successful rendering and Resend enqueue
participate in the mutation transaction, so a failure before commit does not
leave a partially enqueued message. The renderer does not send email itself.

Introduce/propagate a stable notification identifier once at event creation;
reuse it as the Resend enqueue idempotency key during any processing retry.
Do not derive it only from booking ID + kind, since distinct valid lifecycle
events must remain distinguishable. Preserve handling of already scheduled
legacy jobs without this new identifier; do not remove or rename their existing
entry points or make newly added arguments required.

Use the captured event data rather than silently reloading a subsequently changed
booking. Normalize all producers, including cancellation/decline payloads that
currently omit some top-level booking metadata. Retain final/new booking links
on reschedule, and preserve the existing distinction between pending approval,
approval and confirmation of a provisional booking.

Once enqueued, Resend already stores the finished content; delivery retries reuse
that content. Host template changes affect notifications rendered after the host
deployment. They do not rewrite already enqueued email. The renderer code is not
pinned merely by storing a Function Handle, so queued-but-not-rendered jobs can
use a newer deployed template. No template-version registry is introduced in v1.

Expected developer errors are not automatically repaired by Convex retries.
Renderer failures must remain visible as failed scheduled jobs with sanitized
diagnostics, rather than returning a misleading successful job result. Keep HTML,
tokens, personal details and API keys out of diagnostic logs. Do not claim that
queue acceptance is proof of delivery or exactly-once receipt by a mailbox.

## Implementation sequence

1. **Contract and helper:** Add notification/input/output validators, typed query
   renderer references and a small helper that builds the existing email options.
   Centralize repeated email-option validators without changing existing fields.
2. **Propagation:** Extend relevant component functions in `public.ts`,
   `multi_resource.ts`, `hooks.ts` and `src/client/index.ts`. Cover every lifecycle
   write, including admin transitions, provisional confirmation and bundle flows.
   Existing custom lifecycle hooks keep their current independent semantics.
3. **Rendering:** Add one shared template-selection resolver used by the six
   email mutations. Preserve original default templates/subjects and internal
   function entry points. Add the new renderer context explicitly to scheduled
   arguments and preserve old payload compatibility.
4. **Queue safety:** Propagate notification identities; add nested Resend enqueue
   deduplication; separate render failure from enqueue/provider failure. Document
   recovery for a failed custom renderer with the same event snapshot/identity.
5. **Tests and packaging:** Test against the real registered Booking and Resend
   components with provider network traffic mocked. Verify cross-component query
   handles in a development integration, not just direct local function calls.
   Build the package and test imports/types through its published export shape.
6. **Docs/example:** Keep the existing quickstart unchanged. Add a short optional
   “Customize booking emails” guide with one host internalQuery, options helper,
   partial override using `null`, escaping, runtime constraints and failure policy.
   Add a demonstration fixture without changing production demo mail behavior.

## Acceptance checks

- No renderer: all six existing default templates/subjects remain equivalent;
  no renderer callback occurs; existing host code still compiles.
- No email credentials: no guest mail is queued, whether or not a renderer exists.
- Custom renderer: correct snapshot, final links, subject/HTML/text and exactly
  one queue entry; nested Resend still owns delivery.
- Partial override: a `null` result uses the appropriate default template.
- Errors: invalid handle/output or thrown error does not undo the booking or
  enqueue a fallback/duplicate email; diagnostics expose a recoverable failure.
- Isolation: per-operation host settings cannot bleed into another organization;
  no renderer setting or credential is accepted blindly from browser arguments.
- Lifecycle: create, approval/rejection, provisional confirmation, cancellation,
  reschedule and multi-resource flows reach the correct renderer kind and data.
- Race/retry: snapshot remains correct after later booking changes; repeated
  processing of one notification deduplicates, distinct valid events do not.
- Compatibility: jobs scheduled before upgrade still execute; new option fields
  remain optional; npm consumers can use the old API without edits.
- Run component suite, lint, typecheck, build and a consumer integration using
  the packed artifact before considering any release.

## Explicit first-version boundaries

The renderer runs as a query in the normal Convex runtime: TypeScript producing
HTML, plus compatible read-only data access. No `fetch`, sending side effects or
Node-only libraries. Do not advertise arbitrary React Email/JSX renderer support
without verifying the exact library/runtime combination. Node/action rendering
would need a separate action/enqueue/retry design and is deferred.

No template table/editor, template ingestion engine, provider-hosted template
integration, organizer-notification feature, UI redesign or package API class
refactor. This plan only makes the existing guest notification presentation
replaceable. A future app renderer can still read its own stored templates.

After implementation, the new optional API requires a new package version.
Implementation release: 0.4.2. Verify the component and portfolio integration
before publishing, committing, pushing or deploying the implementation.

## Technical basis

- Current source: `src/component/emails/mutations.ts`, `src/component/hooks.ts`,
  `src/component/public.ts`, `src/component/multi_resource.ts`, `src/client/index.ts`.
- [Convex Function Handles](https://docs.convex.dev/components/authoring#function-handles)
  enable explicit typed callbacks across component boundaries.
- [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
  documents atomic scheduling from mutations and the different error/retry
  semantics of scheduled mutations versus actions.
- [Convex Runtimes](https://docs.convex.dev/functions/runtimes)
  documents query/mutation restrictions and Node support in actions.
