import { describe, expect, expectTypeOf, it } from "vitest";
import { ConvexError } from "convex/values";
import { BOOKING_ERROR_CODES, type BookingErrorCode } from "../../shared/booking-errors.js";
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
    ["code-only data with a code it does not know", clientError({ code: "RATE_LIMITED" }), GENERIC],
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

  it("uses the supplied fallback only when there is no host message or known code", () => {
    expect(resolveBookingErrorMessage(clientError({ code: "UNAUTHENTICATED" }), "Sign in")).toBe("Sign in");
    expect(resolveBookingErrorMessage(clientError({ message: "Log in first" }), "Sign in")).toBe("Log in first");
    expect(resolveBookingErrorMessage(clientError({ code: "SLOT_UNAVAILABLE" }), "Sign in")).toBe(TAKEN);
  });
});

// N3: the component throws ConvexError({ code, message }). data.message wins;
// a code alone maps to a generic text, never to transport text.
const TAKEN = "This time is no longer available. Please choose another time.";
const NOT_BOOKABLE = "This booking option is no longer available.";
const UNAVAILABLE = "This booking could not be found, or its link is no longer valid.";

/** Typed against the shared codes, as the map is: a renamed or removed code fails typecheck here too. */
const CODE_TEXTS: Array<[BookingErrorCode, string]> = [
  ["SLOT_UNAVAILABLE", TAKEN],
  ["QUANTITY_UNAVAILABLE", TAKEN],
  ["EVENT_TYPE_NOT_FOUND", NOT_BOOKABLE],
  ["EVENT_TYPE_INACTIVE", NOT_BOOKABLE],
  ["RESOURCE_NOT_FOUND", NOT_BOOKABLE],
  ["RESOURCE_INACTIVE", NOT_BOOKABLE],
  ["RESOURCE_NOT_LINKED", NOT_BOOKABLE],
  ["RESOURCE_NOT_STANDALONE", NOT_BOOKABLE],
  ["POOL_REQUIRES_BUNDLE", NOT_BOOKABLE],
  ["ORGANIZATION_MISMATCH", NOT_BOOKABLE],
  ["BOOKING_NOT_FOUND", UNAVAILABLE],
  ["INVALID_TOKEN", UNAVAILABLE],
  ["INVALID_STATE", "This booking can no longer be changed."],
  ["INVALID_RANGE", "This time cannot be booked. Please choose another time."],
  ["INVALID_INPUT", "Please check your details and try again."],
];

describe("resolveBookingErrorMessage with error codes", () => {
  it("maps only codes the component has", () => {
    expect(CODE_TEXTS.every(([code]) => (BOOKING_ERROR_CODES as readonly string[]).includes(code))).toBe(true);
    // CONTROL: a host's own code is not one
    expectTypeOf<"SLOT_TAKEN">().not.toExtend<BookingErrorCode>();
  });

  it.each(CODE_TEXTS)("maps code-only data %s to a generic message", (code, expected) => {
    const error = clientError({ code });
    expect(resolveBookingErrorMessage(error)).toBe(expected);
    expect(resolveBookingErrorMessage(error)).not.toContain("CONVEX");
  });

  it("prefers the message the error carries over its code's text", () => {
    // As the component throws it: the 0.4.x text in data.message
    const component = clientError({ code: "SLOT_UNAVAILABLE", message: "Slot not available" });
    expect(resolveBookingErrorMessage(component)).toBe("Slot not available");
    // CONTROL: the same code without a message
    expect(resolveBookingErrorMessage(clientError({ code: "SLOT_UNAVAILABLE" }))).toBe(TAKEN);
    // An empty message is no message
    expect(resolveBookingErrorMessage(clientError({ code: "SLOT_UNAVAILABLE", message: " " }))).toBe(TAKEN);
  });

  it.each([
    ["a code of another type", { code: 42 }],
    ["an object key that is not a code", { code: "constructor" }],
    ["a prototype key", { code: "__proto__" }],
    ["a code in another case", { code: "slot_unavailable" }],
    ["a code of a plain Error", undefined],
  ])("shows the generic message for %s", (_case, data) => {
    const error = data === undefined ? Object.assign(new Error("[CONVEX M(x)] Server Error"), { data: { code: "SLOT_UNAVAILABLE" } }) : clientError(data);
    expect(resolveBookingErrorMessage(error)).toBe(GENERIC);
  });
});
