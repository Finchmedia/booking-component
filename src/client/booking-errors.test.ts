import { describe, expect, test } from "vitest";
import {
  BOOKING_ERROR_CODES,
  isBookingError,
  isBookingErrorCode,
  type BookingErrorData,
} from "./index.js";
import { components, initConvexTest } from "./setup.test.js";

const ORG = "org-1";

describe("component errors in host functions", () => {
  test("the root entry exports the codes and their guards", () => {
    expect(BOOKING_ERROR_CODES).toContain("SLOT_UNAVAILABLE");
    expect(isBookingErrorCode("SLOT_UNAVAILABLE")).toBe(true);
    expect(isBookingErrorCode("SLOT_NOT_AVAILABLE")).toBe(false);
  });

  test("a host function reads code and message of a rejection across the component boundary", async () => {
    const t = initConvexTest();
    const resource = { id: "res-1", organizationId: ORG, name: "Room", type: "room", timezone: "UTC" };
    const seen = await t.run(async (ctx) => {
      await ctx.runMutation(components.booking.resources.createResource, resource);
      try {
        await ctx.runMutation(components.booking.resources.createResource, resource);
      } catch (error) {
        return isBookingError(error)
          ? { data: error.data as BookingErrorData, message: error.message }
          : { other: String(error) };
      }
      return { resolved: true };
    });
    expect(seen).toEqual({
      data: { code: "RESOURCE_ALREADY_EXISTS", message: 'Resource with ID "res-1" already exists' },
      message: 'Resource with ID "res-1" already exists',
    });
  });
});
