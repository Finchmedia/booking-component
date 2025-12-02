import schema from "./component/schema.js";
const modules = import.meta.glob("./component/**/*.ts");
/**
 * Register the component with the test convex instance.
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 */
export function register(t, name = "booking") {
    t.registerComponent(name, schema, modules);
}
export default { register, schema, modules };
//# sourceMappingURL=test.js.map