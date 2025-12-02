"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
// ============================================
// CONTEXT
// ============================================
const BookingContext = createContext(null);
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
export function BookingProvider({ publicApi, adminApi, children, }) {
    // Merge public and admin APIs using Proxy to preserve Convex's dynamic function references
    // Note: Spreading Proxy objects (like api.public) doesn't work - it loses the Proxy behavior
    const mergedApi = useMemo(() => {
        if (!adminApi)
            return publicApi;
        // Use Proxy to delegate to both APIs
        return new Proxy(publicApi, {
            get(target, prop) {
                // Check adminApi first (admin overrides public if overlap)
                if (adminApi && prop in adminApi) {
                    return adminApi[prop];
                }
                return target[prop];
            },
        });
    }, [publicApi, adminApi]);
    return (_jsx(BookingContext.Provider, { value: mergedApi, children: children }));
}
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
export function useBookingAPI() {
    const api = useContext(BookingContext);
    if (!api) {
        throw new Error("useBookingAPI must be used within a BookingProvider. " +
            "Wrap your booking components with <BookingProvider publicApi={api.public}>.");
    }
    return api;
}
//# sourceMappingURL=context.js.map