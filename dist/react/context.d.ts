import type { ReactNode } from "react";
import type { FunctionReference } from "convex/server";
type QueryReference = FunctionReference<"query", "public", any, any>;
type MutationReference = FunctionReference<"mutation", "public", any, any>;
/**
 * References to your host's public booking functions.
 * Used by: Booker, Calendar, public booking pages
 *
 * Passing a reference does not grant or restrict access: any client can call
 * any exported Convex function. Your host functions enforce authorization.
 * Booking reads (getBooking, getBookingByUid, getBookingByToken) return the
 * booking's contact details and `managementToken`. Check the management token
 * or the caller's ownership in your host function, and never return
 * `managementToken` to anonymous callers.
 */
export interface PublicBookingAPI {
    getEventType: QueryReference;
    getEventTypeBySlug: QueryReference;
    listEventTypes: QueryReference;
    getAvailability: QueryReference;
    getMonthAvailability: QueryReference;
    getDaySlots: QueryReference;
    createBooking: MutationReference;
    getBooking: QueryReference;
    getBookingByUid: QueryReference;
    getBookingByToken: QueryReference;
    cancelBookingByToken: MutationReference;
    rescheduleBookingByToken: MutationReference;
    getResource: QueryReference;
    listResources: QueryReference;
    getEventTypesForResource: QueryReference;
    hasResourceEventTypeLink: QueryReference;
    getEffectiveAvailability: QueryReference;
    heartbeat: MutationReference;
    leave: MutationReference;
    getPresence: QueryReference;
    getDatePresence: QueryReference;
}
/**
 * References to your host's administration functions.
 * Used by: Admin dashboard, management pages
 *
 * Your host functions must check authentication and permissions: omitting
 * these references from a page does not stop a client from calling them.
 */
export interface AdminBookingAPI {
    createEventType: MutationReference;
    updateEventType: MutationReference;
    deleteEventType: MutationReference;
    toggleEventTypeActive: MutationReference;
    createReservation: MutationReference;
    listBookings: QueryReference;
    cancelReservation: MutationReference;
    createResource: MutationReference;
    updateResource: MutationReference;
    deleteResource: MutationReference;
    toggleResourceActive: MutationReference;
    getResourcesForEventType: QueryReference;
    getResourceIdsForEventType: QueryReference;
    getEventTypeIdsForResource: QueryReference;
    linkResourceToEventType: MutationReference;
    unlinkResourceFromEventType: MutationReference;
    setResourcesForEventType: MutationReference;
    setEventTypesForResource: MutationReference;
    getSchedule: QueryReference;
    listSchedules: QueryReference;
    getDefaultSchedule: QueryReference;
    createSchedule: MutationReference;
    updateSchedule: MutationReference;
    deleteSchedule: MutationReference;
    listDateOverrides: QueryReference;
    createDateOverride: MutationReference;
    deleteDateOverride: MutationReference;
    checkMultiResourceAvailability: QueryReference;
    createMultiResourceBooking: MutationReference;
    getBookingWithItems: QueryReference;
    cancelMultiResourceBooking: MutationReference;
    registerHook: MutationReference;
    unregisterHook: MutationReference;
    transitionBookingState: MutationReference;
    getBookingHistory: QueryReference;
    getActivePresenceCount: QueryReference;
}
/**
 * Combined Booking API type.
 * Merges PublicBookingAPI with optional AdminBookingAPI functions.
 * Components access functions through this unified interface.
 */
export type BookingAPI = PublicBookingAPI & Partial<AdminBookingAPI>;
/** @internal Every PublicBookingAPI operation, resolved from publicApi. */
export declare const PUBLIC_OPERATIONS: readonly ["getEventType", "getEventTypeBySlug", "listEventTypes", "getAvailability", "getMonthAvailability", "getDaySlots", "createBooking", "getBooking", "getBookingByUid", "getBookingByToken", "cancelBookingByToken", "rescheduleBookingByToken", "getResource", "listResources", "getEventTypesForResource", "hasResourceEventTypeLink", "getEffectiveAvailability", "heartbeat", "leave", "getPresence", "getDatePresence"];
/** @internal Every AdminBookingAPI operation, resolved from adminApi. */
export declare const ADMIN_OPERATIONS: readonly ["createEventType", "updateEventType", "deleteEventType", "toggleEventTypeActive", "createReservation", "listBookings", "cancelReservation", "createResource", "updateResource", "deleteResource", "toggleResourceActive", "getResourcesForEventType", "getResourceIdsForEventType", "getEventTypeIdsForResource", "linkResourceToEventType", "unlinkResourceFromEventType", "setResourcesForEventType", "setEventTypesForResource", "getSchedule", "listSchedules", "getDefaultSchedule", "createSchedule", "updateSchedule", "deleteSchedule", "listDateOverrides", "createDateOverride", "deleteDateOverride", "checkMultiResourceAvailability", "createMultiResourceBooking", "getBookingWithItems", "cancelMultiResourceBooking", "registerHook", "unregisterHook", "transitionBookingState", "getBookingHistory", "getActivePresenceCount"];
/** @internal `true` when the list names every operation of API. */
export type ListsAllOperations<API, List extends readonly (keyof API)[]> = [
    Exclude<keyof API, List[number]>
] extends [never] ? true : false;
export interface BookingProviderProps {
    /**
     * References to your host's public booking functions, usually the generated
     * `api.public`. Required for all booking flows.
     *
     * @example
     * // In your convex/public.ts (each function checks its own access rules):
     * export const getEventType = publicQuery({ ... });
     * export const createBooking = publicMutation({ ... });
     *
     * // In your App.tsx:
     * import { api } from "./convex/_generated/api";
     * <BookingProvider publicApi={api.public}>
     */
    publicApi: PublicBookingAPI;
    /**
     * References to your host's administration functions, usually the generated
     * `api.admin`. Optional - only needed for admin components. Admin operations
     * resolve from here; public operations resolve from publicApi unless a
     * hand-built adminApi defines them itself.
     *
     * Without adminApi (or without a given operation in a hand-built adminApi),
     * admin operations resolve from publicApi. This fallback is deprecated and
     * may be removed in 0.5.0; pass adminApi wherever admin operations are used.
     *
     * @example
     * // In your convex/admin.ts (each function checks the caller's role):
     * export const createResource = adminMutation({ ... });
     *
     * // In your admin layout:
     * import { api } from "./convex/_generated/api";
     * <BookingProvider publicApi={api.public} adminApi={api.admin}>
     */
    adminApi?: Partial<AdminBookingAPI>;
    children: ReactNode;
}
/**
 * Provider component that makes the booking API available to all child components.
 *
 * ## Two gateways
 *
 * - **publicApi** (required): your host's public booking functions
 * - **adminApi** (optional): your host's administration functions
 *
 * Components access both through a single `useBookingAPI()` hook. Each
 * operation resolves from the gateway that owns it: PublicBookingAPI names
 * from publicApi, AdminBookingAPI names from adminApi. A hand-built adminApi
 * that defines a public name itself still overrides it.
 *
 * The provider only chooses which function references the UI calls. It is not
 * access control: any client can call any exported Convex function directly.
 * Authorization is enforced by your host Convex functions, which check the
 * caller before calling the component. Booking reads must check the management
 * token or the caller's ownership and must not return `managementToken` to
 * anonymous callers. See the README's "Backend integration" section and the
 * authorization guide (https://convexbooking.dev/docs/authentication).
 *
 * @example
 * ```tsx
 * // Public booking pages
 * import { BookingProvider, Booker } from "@mrfinch/booking/react";
 * import { api } from "./convex/_generated/api";
 *
 * function PublicBookingPage() {
 *   return (
 *     <BookingProvider publicApi={api.public}>
 *       <Booker eventTypeId="event-1" resourceId="studio-a" />
 *     </BookingProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Admin pages: the host's admin functions check the caller's role
 * import { BookingProvider } from "@mrfinch/booking/react";
 * import { api } from "./convex/_generated/api";
 *
 * function AdminLayout({ children }) {
 *   return (
 *     <BookingProvider publicApi={api.public} adminApi={api.admin}>
 *       {children}
 *     </BookingProvider>
 *   );
 * }
 * ```
 */
export declare function BookingProvider({ publicApi, adminApi, children, }: BookingProviderProps): import("react").JSX.Element;
/**
 * Hook to access the booking API from within a BookingProvider.
 *
 * Returns the merged API object: public operations from publicApi, admin
 * operations from adminApi (see BookingProvider). Calling a reference does not
 * bypass authorization; your host functions decide who may run them.
 *
 * @throws Error if used outside of a BookingProvider
 *
 * @example
 * ```tsx
 * function MyBookingComponent() {
 *   const api = useBookingAPI();
 *   const eventType = useQuery(api.getEventType, { eventTypeId: "event-1" });
 *   const createBooking = useMutation(api.createBooking);
 * }
 *
 * // Admin UI: render it only inside a provider that has adminApi, and call
 * // hooks unconditionally (a generated reference is never undefined).
 * function CreateResourceButton() {
 *   const api = useBookingAPI();
 *   const createResource = useMutation(api.createResource!);
 *   return <button onClick={() => createResource({ ... })}>Add room</button>;
 * }
 * ```
 */
export declare function useBookingAPI(): BookingAPI;
export {};
//# sourceMappingURL=context.d.ts.map