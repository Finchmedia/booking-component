import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { resolveBookingErrorMessage } from "./booking-error";

const GENERIC = "Something went wrong. Please try again.";

/** A rejection as the Convex client builds it: transport text in message, host data forwarded. */
function clientError(data: unknown) {
  const error = new ConvexError(
    "[CONVEX M(public:createBooking)] [Request ID: 0123] Server Error\n  Called by client"
  ) as ConvexError<any>;
  error.data = data;
  return error;
}

describe("resolveBookingErrorMessage", () => {
  it.each([
    ["object data with a message", clientError({ code: "SLOT_TAKEN", message: "Slot taken" }), "Slot taken"],
    ["string data", clientError("Please pick another time"), "Please pick another time"],
    ["code-only data", clientError({ code: "RATE_LIMITED" }), GENERIC],
    ["an empty message", clientError({ message: "  " }), GENERIC],
    ["a non-string message", clientError({ message: 42 }), GENERIC],
    ["a plain Error", new Error("Server Error"), GENERIC],
    ["a thrown string", "boom", GENERIC],
    ["undefined", undefined, GENERIC],
  ])("resolves %s", (_case, error, expected) => {
    expect(resolveBookingErrorMessage(error)).toBe(expected);
  });

  it("never shows the transport message of a client-side ConvexError", () => {
    const error = clientError({ code: "SLOT_TAKEN" });
    expect(error.message).toContain("[CONVEX");
    expect(resolveBookingErrorMessage(error)).not.toContain("CONVEX");
    expect(resolveBookingErrorMessage(error)).not.toContain("Server Error");
  });

  it("uses the supplied fallback only when there is no host message", () => {
    expect(resolveBookingErrorMessage(clientError({ code: "UNAUTHENTICATED" }), "Sign in")).toBe("Sign in");
    expect(resolveBookingErrorMessage(clientError({ message: "Log in first" }), "Sign in")).toBe("Log in first");
  });
});
