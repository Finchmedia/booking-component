import type { MutationCtx } from "../_generated/server.js";
import { type BookingEmailContext, type RenderedBookingEmail } from "../../emails.js";
/** A broken override is a failed job, never an implicit request for vanilla mail. */
export declare function resolveBookingEmail(ctx: MutationCtx, renderer: string | undefined, context: BookingEmailContext, fallback: () => Exclude<RenderedBookingEmail, null>): Promise<Exclude<RenderedBookingEmail, null>>;
//# sourceMappingURL=renderer.d.ts.map