import { expect, expectTypeOf, test } from "vitest";
import * as example from "./example.js";
import { api, internal } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

test("the example exposes only internal functions", () => {
  for (const [name, operation] of Object.entries(example)) {
    expect(operation, name).toHaveProperty("isInternal", true);
    expect(operation, name).not.toHaveProperty("isPublic");
  }
  expectTypeOf<keyof typeof api>().toEqualTypeOf<never>();
});

test("server functions can still call the example's internal helpers", async () => {
  const t = initConvexTest();
  await t.mutation(internal.example.createResource, {
    id: "server-only-room",
    organizationId: "example-org",
    name: "Example room",
    type: "room",
    timezone: "UTC",
  });
  const resource = await t.query(internal.example.getResource, { id: "server-only-room" });
  expect(resource?.name).toBe("Example room");
});
