"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { FunctionReference } from "convex/server";

/**
 * Type for the booking API object.
 * This matches the return type of makeBookingAPI() from src/client/index.ts
 *
 * We use a loose type here to avoid circular dependencies and allow
 * flexibility in how the API is constructed.
 */
export interface BookingAPI {
  // Event Types
  getEventType: FunctionReference<"query", "public", any, any>;
  getEventTypeBySlug: FunctionReference<"query", "public", any, any>;
  listEventTypes: FunctionReference<"query", "public", any, any>;
  createEventType: FunctionReference<"mutation", "public", any, any>;
  updateEventType: FunctionReference<"mutation", "public", any, any>;
  deleteEventType: FunctionReference<"mutation", "public", any, any>;
  toggleEventTypeActive: FunctionReference<"mutation", "public", any, any>;

  // Availability
  getAvailability: FunctionReference<"query", "public", any, any>;
  getMonthAvailability: FunctionReference<"query", "public", any, any>;
  getDaySlots: FunctionReference<"query", "public", any, any>;

  // Bookings
  createReservation: FunctionReference<"mutation", "public", any, any>;
  createBooking: FunctionReference<"mutation", "public", any, any>;
  getBooking: FunctionReference<"query", "public", any, any>;
  getBookingByUid: FunctionReference<"query", "public", any, any>;
  listBookings: FunctionReference<"query", "public", any, any>;
  cancelReservation: FunctionReference<"mutation", "public", any, any>;

  // Resources
  getResource: FunctionReference<"query", "public", any, any>;
  listResources: FunctionReference<"query", "public", any, any>;
  createResource: FunctionReference<"mutation", "public", any, any>;
  updateResource: FunctionReference<"mutation", "public", any, any>;
  deleteResource: FunctionReference<"mutation", "public", any, any>;
  toggleResourceActive: FunctionReference<"mutation", "public", any, any>;

  // Resource ↔ Event Type Mapping
  getEventTypesForResource: FunctionReference<"query", "public", any, any>;
  getResourcesForEventType: FunctionReference<"query", "public", any, any>;
  getResourceIdsForEventType: FunctionReference<"query", "public", any, any>;
  getEventTypeIdsForResource: FunctionReference<"query", "public", any, any>;
  hasResourceEventTypeLink: FunctionReference<"query", "public", any, any>;
  linkResourceToEventType: FunctionReference<"mutation", "public", any, any>;
  unlinkResourceFromEventType: FunctionReference<"mutation", "public", any, any>;
  setResourcesForEventType: FunctionReference<"mutation", "public", any, any>;
  setEventTypesForResource: FunctionReference<"mutation", "public", any, any>;

  // Schedules
  getSchedule: FunctionReference<"query", "public", any, any>;
  listSchedules: FunctionReference<"query", "public", any, any>;
  getDefaultSchedule: FunctionReference<"query", "public", any, any>;
  createSchedule: FunctionReference<"mutation", "public", any, any>;
  updateSchedule: FunctionReference<"mutation", "public", any, any>;
  deleteSchedule: FunctionReference<"mutation", "public", any, any>;
  getEffectiveAvailability: FunctionReference<"query", "public", any, any>;
  listDateOverrides: FunctionReference<"query", "public", any, any>;
  createDateOverride: FunctionReference<"mutation", "public", any, any>;
  deleteDateOverride: FunctionReference<"mutation", "public", any, any>;

  // Multi-Resource Booking
  checkMultiResourceAvailability: FunctionReference<"query", "public", any, any>;
  createMultiResourceBooking: FunctionReference<"mutation", "public", any, any>;
  getBookingWithItems: FunctionReference<"query", "public", any, any>;
  cancelMultiResourceBooking: FunctionReference<"mutation", "public", any, any>;

  // Hooks
  registerHook: FunctionReference<"mutation", "public", any, any>;
  unregisterHook: FunctionReference<"mutation", "public", any, any>;
  transitionBookingState: FunctionReference<"mutation", "public", any, any>;
  getBookingHistory: FunctionReference<"query", "public", any, any>;

  // Presence (Real-time slot locking)
  heartbeat: FunctionReference<"mutation", "public", any, any>;
  leave: FunctionReference<"mutation", "public", any, any>;
  getPresence: FunctionReference<"query", "public", any, any>;
  getDatePresence: FunctionReference<"query", "public", any, any>;
  getActivePresenceCount: FunctionReference<"query", "public", any, any>;
}

const BookingContext = createContext<BookingAPI | null>(null);

export interface BookingProviderProps {
  /**
   * The booking API object, typically from re-exported makeBookingAPI functions.
   *
   * @example
   * // In your convex/booking.ts:
   * export const { getEventType, createBooking, ... } = makeBookingAPI(components.booking);
   *
   * // In your App.tsx:
   * import { api } from "./convex/_generated/api";
   * <BookingProvider api={api.booking}>
   */
  api: BookingAPI;
  children: ReactNode;
}

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
export function BookingProvider({ api, children }: BookingProviderProps) {
  return (
    <BookingContext.Provider value={api}>{children}</BookingContext.Provider>
  );
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
export function useBookingAPI(): BookingAPI {
  const api = useContext(BookingContext);
  if (!api) {
    throw new Error(
      "useBookingAPI must be used within a BookingProvider. " +
        "Make sure to wrap your booking components with <BookingProvider api={api.booking}>."
    );
  }
  return api;
}
