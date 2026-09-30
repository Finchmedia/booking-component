/**
 * Patch objects are typed against their tables (PR-43): the update mutations
 * build `Partial<WithoutSystemFields<Doc<"table">>>` instead of
 * `Record<string, unknown>`, so a misspelled or wrongly typed field fails
 * compilation. The @ts-expect-error lines are checked by `npm run typecheck`
 * (as in function-paths.test.ts); a line that stops failing fails the check.
 */
import { test } from "vitest";
import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "./_generated/dataModel.js";

test("table patch types accept columns and reject anything else", () => {
  // Positive controls: the fields the update mutations set.
  const resource: Partial<WithoutSystemFields<Doc<"resources">>> = { updatedAt: 1 };
  resource.name = "Room";
  resource.quantity = 2;
  resource.metadata = { floor: "2" };
  const schedule: Partial<WithoutSystemFields<Doc<"schedules">>> = { updatedAt: 1 };
  schedule.weeklyHours = [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }];
  const override: Partial<WithoutSystemFields<Doc<"date_overrides">>> = {};
  override.customHours = [{ startTime: "09:00", endTime: "12:00" }];
  const hook: Partial<WithoutSystemFields<Doc<"hooks">>> = {};
  hook.enabled = false;
  hook.functionHandle = "function://handle";
  const eventType: Partial<WithoutSystemFields<Doc<"event_types">>> = { updatedAt: 1, lengthInMinutes: 30 };

  // @ts-expect-error -- misspelled column
  resource.nmae = "Room";
  // @ts-expect-error -- wrong type
  resource.quantity = "2";
  // @ts-expect-error -- wrong type
  schedule.weeklyHours = [{ dayOfWeek: "Monday", startTime: "09:00", endTime: "17:00" }];
  // @ts-expect-error -- misspelled column
  override.custom_hours = [];
  // @ts-expect-error -- wrong type
  hook.enabled = "false";
  // @ts-expect-error -- misspelled column
  const misspelled: Partial<WithoutSystemFields<Doc<"event_types">>> = { lenghtInMinutes: 30 };
  // @ts-expect-error -- system fields are not patchable
  const system: Partial<WithoutSystemFields<Doc<"hooks">>> = { _creationTime: 1 };

  void [resource, schedule, override, hook, eventType, misspelled, system];
});
