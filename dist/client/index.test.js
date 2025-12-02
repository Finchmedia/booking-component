import { describe, expect, test } from "vitest";
import { makeBookingAPI } from "./index.js";
describe("client tests", () => {
    test("makeBookingAPI should be a function", () => {
        expect(typeof makeBookingAPI).toBe("function");
    });
});
//# sourceMappingURL=index.test.js.map