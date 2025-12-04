import type { ReactNode } from "react";
import type { FunctionReference } from "convex/server";
type QueryReference = FunctionReference<"query", "public", any, any>;
type MutationReference = FunctionReference<"mutation", "public", any, any>;
/**
 * Public API for the booking flow.
 * These functions can be called without authentication.
 * Used by: Booker, Calendar, public booking pages
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
 * Admin API for managing booking configuration.
 * These functions require authentication and admin permissions.
 * Used by: Admin dashboard, management pages
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
export interface BookingProviderProps {
    /**
     * The public booking API - functions for anonymous browsing and booking.
     * Required for all booking flows.
     *
     * @example
     * // In your convex/public.ts:
     * export const getEventType = publicQuery({ ... });
     * export const createBooking = publicMutation({ ... });
     *
     * // In your App.tsx:
     * import { api } from "./convex/_generated/api";
     * <BookingProvider publicApi={api.public}>
     */
    publicApi: PublicBookingAPI;
    /**
     * The admin booking API - functions requiring authentication.
     * Optional - only needed for admin components.
     *
     * @example
     * // In your convex/admin.ts:
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
 * Implements dependency injection pattern for separating public and admin APIs.
 *
 * ## Two-Gateway Architecture
 *
 * This provider merges two API gateways:
 * - **publicApi** (required): Functions for anonymous browsing and booking
 * - **adminApi** (optional): Functions requiring authentication
 *
 * Components access both through a single `useBookingAPI()` hook.
 * The app controls authorization by deciding which functions to provide.
 *
 * @example
 * ```tsx
 * // Public booking pages (no auth required)
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
 * // Admin pages (auth required)
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
export declare function BookingProvider({ publicApi, adminApi, children, }: BookingProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Hook to access the booking API from within a BookingProvider.
 *
 * Returns the merged API object containing both public and admin functions
 * (if adminApi was provided to the BookingProvider).
 *
 * @throws Error if used outside of a BookingProvider
 *
 * @example
 * ```tsx
 * function MyBookingComponent() {
 *   const api = useBookingAPI();
 *
 *   // Public functions - always available
 *   const eventType = useQuery(api.getEventType, { eventTypeId: "event-1" });
 *   const createBooking = useMutation(api.createBooking);
 *
 *   // Admin functions - only available if adminApi was provided
 *   // TypeScript will show these as optional (with ?)
 *   const createResource = api.createResource
 *     ? useMutation(api.createResource)
 *     : null;
 * }
 * ```
 */
export declare function useBookingAPI(): BookingAPI;
/**
 * @deprecated Use BookingProviderProps with publicApi/adminApi instead.
 * This type is kept for documentation purposes only.
 */
export interface LegacyBookingProviderProps {
    api: PublicBookingAPI & AdminBookingAPI;
    children: ReactNode;
}
export {};
//# sourceMappingURL=context.d.ts.map