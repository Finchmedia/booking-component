import { assertValidRenderedBookingEmail, } from "../../emails.js";
/** A broken override is a failed job, never an implicit request for vanilla mail. */
export async function resolveBookingEmail(ctx, renderer, context, fallback) {
    if (renderer === undefined)
        return fallback();
    let result;
    try {
        result = await ctx.runQuery(renderer, context);
    }
    catch {
        // The original exception can include credentials, booking tokens or PII.
        throw new Error("BOOKING_EMAIL_RENDERER_FAILED");
    }
    if (result === null)
        return fallback();
    assertValidRenderedBookingEmail(result);
    return result;
}
//# sourceMappingURL=renderer.js.map