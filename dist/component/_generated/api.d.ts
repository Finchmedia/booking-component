/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */
import type * as availability from "../availability.js";
import type * as emails from "../emails.js";
import type * as hooks from "../hooks.js";
import type * as multi_resource from "../multi_resource.js";
import type * as presence from "../presence.js";
import type * as public_ from "../public.js";
import type * as resource_event_types from "../resource_event_types.js";
import type * as resources from "../resources.js";
import type * as schedules from "../schedules.js";
import type * as utils from "../utils.js";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
declare const fullApi: ApiFromModules<{
    availability: typeof availability;
    emails: typeof emails;
    hooks: typeof hooks;
    multi_resource: typeof multi_resource;
    presence: typeof presence;
    public: typeof public_;
    resource_event_types: typeof resource_event_types;
    resources: typeof resources;
    schedules: typeof schedules;
    utils: typeof utils;
}>;
/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: {
    resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
export {};
//# sourceMappingURL=api.d.ts.map