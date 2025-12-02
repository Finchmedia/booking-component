/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
export const modules = import.meta.glob("./**/*.*s");
import { defineSchema, } from "convex/server";
import {} from "../component/_generated/component.js";
import { componentsGeneric } from "convex/server";
import { register } from "../test.js";
export function initConvexTest(schema) {
    const t = convexTest(schema ?? defineSchema({}), modules);
    register(t);
    return t;
}
export const components = componentsGeneric();
test("setup", () => { });
//# sourceMappingURL=setup.test.js.map