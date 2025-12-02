export declare const modules: Record<string, () => Promise<unknown>>;
import { type GenericSchema, type SchemaDefinition } from "convex/server";
import { type ComponentApi } from "../component/_generated/component.js";
export declare function initConvexTest<Schema extends SchemaDefinition<GenericSchema, boolean>>(schema?: Schema): import("convex-test").TestConvex<SchemaDefinition<{}, boolean>>;
export declare const components: {
    booking: ComponentApi;
};
//# sourceMappingURL=setup.test.d.ts.map