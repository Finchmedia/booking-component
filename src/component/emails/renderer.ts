import type { FunctionHandle } from "convex/server";
import type { MutationCtx } from "../_generated/server.js";
import {
  assertValidRenderedBookingEmail,
  type BookingEmailContext,
  type RenderedBookingEmail,
} from "../../emails.js";

/** A broken override is a failed job, never an implicit request for vanilla mail. */
export async function resolveBookingEmail(
  ctx: MutationCtx,
  renderer: string | undefined,
  context: BookingEmailContext,
  fallback: () => Exclude<RenderedBookingEmail, null>,
): Promise<Exclude<RenderedBookingEmail, null>> {
  if (renderer === undefined) return fallback();
  let result: unknown;
  try {
    result = await ctx.runQuery(
      renderer as FunctionHandle<"query", BookingEmailContext, RenderedBookingEmail>,
      context,
    );
  } catch {
    // The original exception can include credentials, booking tokens or PII.
    throw new Error("BOOKING_EMAIL_RENDERER_FAILED");
  }
  if (result === null) return fallback();
  assertValidRenderedBookingEmail(result);
  return result;
}
