"use client";

// This library entry deliberately exports its provider and the matching hook.
/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type {
  AdminBookingAPI,
  BookingAPI,
  PublicBookingAPI,
} from "./contract.js";

export type { AdminBookingAPI, BookingAPI, PublicBookingAPI } from "./contract.js";

// ============================================
// OPERATION OWNERSHIP
// Each operation belongs to one gateway. Generated Convex APIs are proxies
// that report no members and return a reference for any name, so operations
// are routed by these lists, never by `in` or truthiness on the gateways.
// ============================================

/** @internal Every PublicBookingAPI operation, resolved from publicApi. */
export const PUBLIC_OPERATIONS = [
  "getEventType",
  "getEventTypeBySlug",
  "listEventTypes",
  "getAvailability",
  "getMonthAvailability",
  "getDaySlots",
  "createBooking",
  "getBooking",
  "getBookingByUid",
  "getBookingByToken",
  "cancelBookingByToken",
  "rescheduleBookingByToken",
  "getResource",
  "listResources",
  "getEventTypesForResource",
  "hasResourceEventTypeLink",
  "getEffectiveAvailability",
  "heartbeat",
  "leave",
  "getPresence",
  "getDatePresence",
] as const satisfies readonly (keyof PublicBookingAPI)[];

/** @internal Every AdminBookingAPI operation, resolved from adminApi. */
export const ADMIN_OPERATIONS = [
  "createEventType",
  "updateEventType",
  "deleteEventType",
  "toggleEventTypeActive",
  "createReservation",
  "listBookings",
  "cancelReservation",
  "createResource",
  "updateResource",
  "deleteResource",
  "toggleResourceActive",
  "getResourcesForEventType",
  "getResourceIdsForEventType",
  "getEventTypeIdsForResource",
  "linkResourceToEventType",
  "unlinkResourceFromEventType",
  "setResourcesForEventType",
  "setEventTypesForResource",
  "getSchedule",
  "listSchedules",
  "getDefaultSchedule",
  "createSchedule",
  "updateSchedule",
  "deleteSchedule",
  "listDateOverrides",
  "createDateOverride",
  "deleteDateOverride",
  "checkMultiResourceAvailability",
  "createMultiResourceBooking",
  "getBookingWithItems",
  "cancelMultiResourceBooking",
  "registerHook",
  "unregisterHook",
  "transitionBookingState",
  "getBookingHistory",
  "getActivePresenceCount",
] as const satisfies readonly (keyof AdminBookingAPI)[];

/** @internal `true` when the list names every operation of API. */
export type ListsAllOperations<API, List extends readonly (keyof API)[]> =
  [Exclude<keyof API, List[number]>] extends [never] ? true : false;

// A new interface member fails to compile until it is listed
/* eslint-disable @typescript-eslint/no-unused-vars -- compile-time checks only */
const _allPublicListed: ListsAllOperations<PublicBookingAPI, typeof PUBLIC_OPERATIONS> = true;
const _allAdminListed: ListsAllOperations<AdminBookingAPI, typeof ADMIN_OPERATIONS> = true;
/* eslint-enable @typescript-eslint/no-unused-vars */

// ============================================
// RESOLUTION
// ============================================

/**
 * The API useBookingAPI() returns: every public operation from publicApi,
 * every admin operation from adminApi, nothing else. Without adminApi the
 * admin operations are undefined; an operation a gateway lacks is undefined
 * too. A gateway never supplies the other gateway's operations.
 */
function resolveBookingAPI(
  publicApi: PublicBookingAPI,
  adminApi?: Partial<AdminBookingAPI>
): BookingAPI {
  const resolved: Partial<Record<keyof BookingAPI, unknown>> = {};
  for (const key of PUBLIC_OPERATIONS) {
    const reference = publicApi[key];
    if (reference !== undefined) resolved[key] = reference;
  }
  if (adminApi) {
    for (const key of ADMIN_OPERATIONS) {
      const reference = adminApi[key];
      if (reference !== undefined) resolved[key] = reference;
    }
  }
  // The one cast between the host contract and the components. PublicBookingAPI
  // types the operations the components call as FunctionReference_future, which
  // checks host arguments the way Convex validators do; convex-helpers' cached
  // useQuery accepts only a plain FunctionReference. BookingAPI holds the same
  // references typed as plain references with the same arguments and result.
  return resolved as BookingAPI;
}

// ============================================
// CONTEXT
// ============================================

const BookingContext = createContext<BookingAPI | null>(null);

// ============================================
// PROVIDER PROPS
// ============================================

export interface BookingProviderProps {
  /**
   * References to your host's public booking functions, usually the generated
   * `api.public`. Required for all booking flows.
   *
   * The 11 operations the components call are required and type-checked: each
   * host function must accept exactly the arguments the components send and
   * return at least the fields they read (see `BookingUIOperations`). The other
   * public operations are optional.
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
   * resolve only from here: without adminApi they are `undefined`. adminApi
   * never supplies public operations, even when it defines the same names.
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
 * from publicApi, AdminBookingAPI names from adminApi. Admin operations are
 * `undefined` without adminApi, and names outside both interfaces are not
 * passed through.
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
export function BookingProvider({
  publicApi,
  adminApi,
  children,
}: BookingProviderProps) {
  // Resolved from the operation lists: a generated api is a proxy that has no
  // members to spread and returns a reference for any name
  const api = useMemo(
    () => resolveBookingAPI(publicApi, adminApi),
    [publicApi, adminApi]
  );

  return (
    <BookingContext.Provider value={api}>
      {children}
    </BookingContext.Provider>
  );
}

/**
 * Hook to access the booking API from within a BookingProvider.
 *
 * Returns the resolved API: public operations from publicApi, admin operations
 * from adminApi (see BookingProvider). The operations the components call are
 * typed with the contract's arguments and result views; the others are
 * untyped. Calling a reference does not bypass authorization; your host
 * functions decide who may run them.
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
 * // hooks unconditionally (admin operations are undefined without adminApi).
 * function CreateResourceButton() {
 *   const api = useBookingAPI();
 *   const createResource = useMutation(api.createResource!);
 *   return <button onClick={() => createResource({ ... })}>Add room</button>;
 * }
 * ```
 */
export function useBookingAPI(): BookingAPI {
  const api = useContext(BookingContext);
  if (!api) {
    throw new Error(
      "useBookingAPI must be used within a BookingProvider. " +
        "Wrap your booking components with <BookingProvider publicApi={api.public}>."
    );
  }
  return api;
}
