# Customize booking emails

Available in `@mrfinch/booking` 0.4.2. Keep your own email design in your app while
Booking continues to schedule notifications and send them through its nested
Resend component. The built-in templates remain the default.

## 1. Add an internal renderer

```ts
// convex/bookingEmailRenderer.ts
import { internalQuery } from "./_generated/server";
import {
  bookingEmailContextValidator,
  bookingEmailResultValidator,
} from "@mrfinch/booking/emails";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

export const render = internalQuery({
  args: bookingEmailContextValidator,
  returns: bookingEmailResultValidator,
  handler: (_ctx, email) => {
    // Customize just confirmations; all other emails keep the default design.
    if (email.kind !== "confirmed") return null;
    const when = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full", timeStyle: "short", timeZone: email.timezone,
    }).format(email.start);
    return {
      subject: "Your booking is confirmed",
      html: `<h1>Thanks, ${escapeHtml(email.bookerName)}</h1>
        <p>${escapeHtml(email.eventTitle)} · ${escapeHtml(when)}</p>
        ${email.links ? `<a href="${escapeHtml(email.links.view)}">View booking</a>` : ""}`,
      text: `Thanks, ${email.bookerName}. ${email.eventTitle}: ${when}` +
        (email.links ? `\nView booking: ${email.links.view}` : ""),
    };
  },
});
```

The renderer supports six kinds: `confirmed`, `pending`, `approved`, `declined`,
`cancelled`, `rescheduled`. It receives a snapshot of the event, including the
booker, event title, start/end and timezone. Rescheduled emails include
`previousStart` and `previousEnd`; `start` and `end` are the new times.
Cancellation and decline may include `reason`. Identifiers and links are optional
to accommodate legacy reservations with incomplete metadata.

`version: 1` identifies the context contract. `notificationId` and `occurredAt`
identify newly scheduled notifications; jobs queued before 0.4.2 may omit them.
Import `BookingEmailContext` for a separate template function's argument type.
Return HTML strings, not React elements or serialized JavaScript functions.

## 2. Configure the renderer in one host module

```ts
// convex/bookingEmail.ts
import { internal } from "./_generated/api";
import {
  createBookingEmailOptions,
  type BookingEmailOptions,
} from "@mrfinch/booking/emails";

export async function bookingEmailOptions(): Promise<BookingEmailOptions | undefined> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return undefined;
  return createBookingEmailOptions({
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    baseUrl: process.env.BOOKING_APP_URL,
    renderer: internal.bookingEmailRenderer.render,
  });
}
```

Inside your host booking functions, pass `resendOptions: await bookingEmailOptions()`
to creation, cancellation, rescheduling and administrative lifecycle operations.
The helper resolves the renderer reference to a Convex Function Handle during
function execution. Do not call it at module initialization. There is no template
registration or database lookup to discover a renderer.

Use your verified sender and public app origin. Keep these settings server-owned;
do not copy a renderer handle, API key or sender from browser arguments. Omitting
`resendOptions` still disables built-in email delivery. Existing custom hooks
remain independent; avoid also sending the same guest notification from a hook.

## Links and templates

`email.links` provides view, reschedule and cancel URLs based on `baseUrl` and the
event's final booking UID/token. Their default paths are `/book/booking/[uid]`,
`/book/booking/[uid]/reschedule` and `/book/booking/[uid]/cancel`.

Your renderer may adapt these URLs to your app's routes while preserving the
management token. Escape dynamic text and HTML attributes. Never log the rendered
HTML or management links. A cancellation URL should open a confirmation screen;
visiting it must not cancel a booking automatically.

## Fallback, errors and limits

| Result | Behavior |
| --- | --- |
| No renderer configured | Built-in template; no renderer call |
| Renderer returns content | Send that content through Booking's nested Resend |
| Renderer returns `null` | Built-in template for this notification |
| Renderer throws or returns invalid content | Email job fails; booking stays committed |

The result only accepts `subject`, `html` and optional `text`. Subject and HTML
must be nonempty. Subjects must contain no CR, LF or NUL characters and are limited
to 200 UTF-16 code units. Combined UTF-8 subject, HTML and text must fit in 128 KiB.
These checks validate the payload, not its visual appearance or deliverability.

Rendering runs after the booking mutation commits. Diagnose a renderer failure
in the Convex scheduled-function logs, fix and deploy the host renderer, then
retry the failed internal email mutation with its original arguments and
notification ID. Do not repeat the booking mutation to resend an email. Reusing
the notification ID deduplicates against an existing queued Resend email.

After successful enqueue, Resend stores the final content and reuses it for
delivery retries. A host deployment affects emails rendered after that deployment,
including those still waiting to render; it does not rewrite already queued
content. A Function Handle does not pin a historical version of your renderer.

## Runtime

The initial renderer API uses a Convex `internalQuery`. Pure TypeScript templates
and libraries compatible with the query runtime can be used; Node-only libraries,
network requests and sending side effects cannot. Verify any rendering library's
runtime compatibility before adopting it. The renderer can read app data, but
use the supplied snapshot for the booking's times, notification kind and management links.

There is no need to install another Resend component or mount a public endpoint.
Sender selection, recipients, credentials, queueing and delivery stay with Booking.
