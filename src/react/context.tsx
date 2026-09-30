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

const PUBLIC_KEYS: ReadonlySet<PropertyKey> = new Set(PUBLIC_OPERATIONS);
const ADMIN_KEYS: ReadonlySet<PropertyKey> = new Set(ADMIN_OPERATIONS);

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
export function BookingProvider({
  publicApi,
  adminApi,
  children,
}: BookingProviderProps) {
  // Merge public and admin APIs using Proxy to preserve Convex's dynamic function references
  // Note: Spreading Proxy objects (like api.public) doesn't work - it loses the Proxy behavior
  const mergedApi = useMemo<BookingAPI>(
    () => {
      // The operations the components call are typed as FunctionReference_future
      // in PublicBookingAPI, which checks host arguments the way Convex
      // validators do; convex-helpers' cached useQuery accepts only a plain
      // FunctionReference. BookingAPI holds the same references as plain ones.
      const target = publicApi as unknown as BookingAPI;
      // Without adminApi every name resolves from publicApi (admin names: deprecated)
      if (!adminApi) return target;
      return new Proxy(target, {
        get(target, prop) {
          if (PUBLIC_KEYS.has(prop)) {
            // A plain-object adminApi's own property still overrides, as before;
            // generated proxies have none, so they never shadow publicApi
            return Object.prototype.hasOwnProperty.call(adminApi, prop)
              ? (adminApi as any)[prop]
              : (target as any)[prop];
          }
          if (ADMIN_KEYS.has(prop)) {
            // Deprecated fallback for a hand-built adminApi without this operation
            return (adminApi as any)[prop] ?? (target as any)[prop];
          }
          // Names outside both interfaces (untyped use) keep the old rule
          return prop in adminApi ? (adminApi as any)[prop] : (target as any)[prop];
        },
      });
    },
    [publicApi, adminApi]
  );

  return (
    <BookingContext.Provider value={mergedApi}>
      {children}
    </BookingContext.Provider>
  );
}

/**
 * Hook to access the booking API from within a BookingProvider.
 *
 * Returns the merged API object: public operations from publicApi, admin
 * operations from adminApi (see BookingProvider). The operations the components
 * call are typed with the contract's arguments and result views; the others
 * are untyped. Calling a reference does not bypass authorization; your host
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
 * // hooks unconditionally (a generated reference is never undefined).
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
