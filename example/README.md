# Example app

This small Vite app demonstrates component registration and provides the host
used for component code generation. Run its commands from the repository root.

`convex/example.ts` uses `makeInternalBookingAPI` to create **internal** helpers.
They are available to server functions as `internal.example.*`, never to browser
clients. This example has no authentication provider and exposes no public
booking or administration functions.

For a booking UI, follow the [quickstart](https://convexbooking.dev/docs/getting-started).
Your host app owns authentication and authorization: call `components.booking.*`
from your own public functions after checking the caller, the target resource's
organization and the relevant booking policy. Keep maintenance/reset functions
internal.
