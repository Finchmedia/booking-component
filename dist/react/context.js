"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const BookingContext = createContext(null);
/**
 * Provider component that makes the booking API available to all child components.
 * Wrap your booking UI components with this provider.
 *
 * @example
 * ```tsx
 * import { BookingProvider, Booker } from "@mrfinch/booking/react";
 * import { api } from "./convex/_generated/api";
 *
 * function App() {
 *   return (
 *     <ConvexProvider client={convex}>
 *       <BookingProvider api={api.booking}>
 *         <Booker eventTypeId="event-1" resourceId="studio-a" />
 *       </BookingProvider>
 *     </ConvexProvider>
 *   );
 * }
 * ```
 */
export function BookingProvider({ api, children }) {
    return (_jsx(BookingContext.Provider, { value: api, children: children }));
}
/**
 * Hook to access the booking API from within a BookingProvider.
 *
 * @throws Error if used outside of a BookingProvider
 *
 * @example
 * ```tsx
 * function MyBookingComponent() {
 *   const api = useBookingAPI();
 *   const eventType = useQuery(api.getEventType, { eventTypeId: "event-1" });
 *   const createBooking = useMutation(api.createBooking);
 *   // ...
 * }
 * ```
 */
export function useBookingAPI() {
    const api = useContext(BookingContext);
    if (!api) {
        throw new Error("useBookingAPI must be used within a BookingProvider. " +
            "Make sure to wrap your booking components with <BookingProvider api={api.booking}>.");
    }
    return api;
}
//# sourceMappingURL=context.js.map