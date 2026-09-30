/// <reference types="vite/client" />
/**
 * N23: every makeInternalBookingAPI wrapper accepts exactly the arguments of
 * the component function it forwards to.
 *
 * The factory repeats each component validator by hand, and
 * getEventTypeBySlug had dropped `organizationId`, so a multi-tenant host
 * could not scope slug lookups through it. The drift check compares the
 * runtime validators (`exportArgs()`), nested fields and optional flags
 * included. The only allowed difference is `v.id(table)` → `v.string()`: a
 * component id is a plain string at the host boundary.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { anyApi, internalQueryGeneric, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { makeInternalBookingAPI } from "./index.js";
import { components, initConvexTest } from "./setup.test.js";
import * as hooks from "../component/hooks.js";
import * as maintenance from "../component/maintenance.js";
import * as multi_resource from "../component/multi_resource.js";
import * as presence from "../component/presence.js";
import * as publicModule from "../component/public.js";
import * as resource_event_types from "../component/resource_event_types.js";
import * as resources from "../component/resources.js";
import * as schedules from "../component/schedules.js";

// Exported so convex-test can address them as the app module "factory-drift.test".
export const { createEventType, getEventTypeBySlug } = makeInternalBookingAPI(components.booking);

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "factory-drift.test": {
      createEventType: typeof createEventType;
      getEventTypeBySlug: typeof getEventTypeBySlug;
    };
  }>
)["factory-drift.test"];

const componentModules: Record<string, Record<string, unknown>> = {
  hooks, maintenance, multi_resource, presence, public: publicModule,
  resource_event_types, resources, schedules,
};

type Json = { type: string; value?: unknown; tableName?: string; keys?: Json; values?: { fieldType: Json } };
type Fields = Record<string, { fieldType: Json; optional: boolean }>;

const argsJson = (fn: unknown): Json => JSON.parse((fn as { exportArgs(): string }).exportArgs()) as Json;

/** The component's validator as the host sees it: ids become strings. */
function eraseIds(json: Json): Json {
  return JSON.parse(JSON.stringify(json), (_key, value) =>
    value && typeof value === "object" && value.type === "id" ? { type: "string" } : value
  ) as Json;
}

/** Differences between a wrapper's and a component's args validator, as readable paths. */
function drift(wrapper: Json, component: Json, path: string, out: string[] = []): string[] {
  if (wrapper.type !== component.type) {
    out.push(`${path}: wrapper ${wrapper.type} vs component ${component.type}`);
  } else if (wrapper.type === "object") {
    const w = wrapper.value as Fields;
    const c = component.value as Fields;
    for (const key of new Set([...Object.keys(w), ...Object.keys(c)])) {
      if (!(key in w)) out.push(`${path}.${key}: only in component${c[key].optional ? " (optional)" : ""}`);
      else if (!(key in c)) out.push(`${path}.${key}: only in wrapper`);
      else {
        if (w[key].optional !== c[key].optional) out.push(`${path}.${key}: optional differs`);
        drift(w[key].fieldType, c[key].fieldType, `${path}.${key}`, out);
      }
    }
  } else if (wrapper.type === "array") {
    drift(wrapper.value as Json, component.value as Json, `${path}[]`, out);
  } else if (wrapper.type === "record") {
    drift(wrapper.keys!, component.keys!, `${path}{key}`, out);
    drift(wrapper.values!.fieldType, component.values!.fieldType, `${path}{value}`, out);
  } else if (JSON.stringify(sortUnion(wrapper)) !== JSON.stringify(sortUnion(component))) {
    out.push(`${path}: ${wrapper.type} differs`);
  }
  return out;
}

function sortUnion(json: Json): unknown {
  return json.type === "union"
    ? (json.value as Json[]).map((member) => JSON.stringify(member)).sort()
    : json;
}

/** wrapper name → [component module, function], read from the factory source itself. */
function wrapperTargets(): Record<string, [string, string]> {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const targets: Record<string, [string, string]> = {};
  let wrapper = "";
  for (const line of source.split("\n")) {
    const declared = /^ {4}([A-Za-z]+): internal(Query|Mutation)Generic/.exec(line);
    if (declared) wrapper = declared[1];
    const call = /component\.([a-z_]+)\.([A-Za-z]+)/.exec(line);
    if (call && wrapper && !targets[wrapper]) targets[wrapper] = [call[1], call[2]];
  }
  return targets;
}

function driftOf(wrapper: unknown, component: unknown, name: string) {
  return drift(argsJson(wrapper), eraseIds(argsJson(component)), name);
}

describe("factory wrapper arguments", () => {
  test("every wrapper matches its component function (ids erased to strings)", () => {
    const api = makeInternalBookingAPI(components.booking) as Record<string, unknown>;
    const targets = wrapperTargets();
    expect(Object.keys(targets).sort()).toEqual(Object.keys(api).sort());

    const report: Record<string, string[]> = {};
    let erased = 0;
    for (const [name, [module, fn]] of Object.entries(targets)) {
      const component = componentModules[module]?.[fn];
      expect(component, `${module}.${fn}`).toBeDefined();
      const differences = driftOf(api[name], component, name);
      if (differences.length) report[name] = differences;
      if (JSON.stringify(argsJson(component)).includes('"type":"id"')) erased++;
    }

    expect(report).toEqual({});
    // CONTROL: the erasure is exercised (wrappers of functions taking document ids).
    expect(erased).toBeGreaterThan(5);
  });

  test("CONTROL: drift is detected, nested and optional included; id → string is not drift", () => {
    const wrapper = internalQueryGeneric({
      args: {
        id: v.string(),
        locations: v.array(v.object({ type: v.string() })),
        mode: v.union(v.literal("a"), v.literal("b")),
        note: v.string(),
      },
      handler: async () => null,
    });
    const component = internalQueryGeneric({
      args: {
        id: v.id("bookings"),
        locations: v.array(v.object({ type: v.string(), address: v.optional(v.string()) })),
        mode: v.union(v.literal("a"), v.literal("c")),
        note: v.optional(v.string()),
        extra: v.optional(v.number()),
      },
      handler: async () => null,
    });

    expect(driftOf(wrapper, component, "fixture").sort()).toEqual([
      "fixture.extra: only in component (optional)",
      "fixture.locations[].address: only in component (optional)",
      "fixture.mode: union differs",
      "fixture.note: optional differs",
    ]);
    // The pre-0.4.3 getEventTypeBySlug wrapper against the real component query.
    const oldWrapper = internalQueryGeneric({ args: { slug: v.string() }, handler: async () => null });
    expect(driftOf(oldWrapper, publicModule.getEventTypeBySlug, "getEventTypeBySlug")).toEqual([
      "getEventTypeBySlug.organizationId: only in component (optional)",
    ]);
  });
});

describe("factory getEventTypeBySlug", () => {
  const eventArgs = (id: string, organizationId: string) => ({
    id, slug: "consult", title: `Consult ${organizationId}`, lengthInMinutes: 30,
    timezone: "UTC", lockTimeZoneToggle: false, locations: [], organizationId,
  });

  test("an organization picks that tenant's event type; without one the oldest row still wins", async () => {
    const t = initConvexTest();
    await t.mutation(testApi.createEventType, eventArgs("et-org-a", "org-a"));
    await t.mutation(testApi.createEventType, eventArgs("et-org-b", "org-b"));

    const scoped = await t.query(testApi.getEventTypeBySlug, { slug: "consult", organizationId: "org-b" });
    expect([scoped?.id, scoped?.organizationId]).toEqual(["et-org-b", "org-b"]);
    expect((await t.query(testApi.getEventTypeBySlug, { slug: "consult", organizationId: "org-a" }))?.id).toBe("et-org-a");
    expect(await t.query(testApi.getEventTypeBySlug, { slug: "consult", organizationId: "org-c" })).toBeNull();
    // Unchanged: the component's unscoped lookup returns the first row of the slug index.
    expect((await t.query(testApi.getEventTypeBySlug, { slug: "consult" }))?.id).toBe("et-org-a");
  });
});
