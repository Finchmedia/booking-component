import { components } from "./_generated/api.js";
import { makeBookingAPI } from "@mrfinch/booking";

// Create the booking API using the Re-Mountable API Functions pattern
// This allows direct re-export to the app's public API
export const {
  // Event Types
  getEventType,
  getEventTypeBySlug,
  listEventTypes,
  createEventType,
  updateEventType,
  deleteEventType,
  toggleEventTypeActive,

  // Availability
  getAvailability,
  getMonthAvailability,
  getDaySlots,

  // Bookings
  createReservation,
  createBooking,
  getBooking,
  getBookingByUid,
  listBookings,
  cancelReservation,

  // Resources
  getResource,
  listResources,
  createResource,
  updateResource,
  deleteResource,
  toggleResourceActive,

  // Resource ↔ Event Type Mapping
  getEventTypesForResource,
  getResourcesForEventType,
  getResourceIdsForEventType,
  getEventTypeIdsForResource,
  hasResourceEventTypeLink,
  linkResourceToEventType,
  unlinkResourceFromEventType,
  setResourcesForEventType,
  setEventTypesForResource,

  // Schedules
  getSchedule,
  listSchedules,
  getDefaultSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getEffectiveAvailability,
  listDateOverrides,
  createDateOverride,
  deleteDateOverride,

  // Multi-Resource Booking
  checkMultiResourceAvailability,
  createMultiResourceBooking,
  getBookingWithItems,
  cancelMultiResourceBooking,

  // Hooks
  registerHook,
  unregisterHook,
  transitionBookingState,
  getBookingHistory,

  // Presence (Real-time slot locking)
  heartbeat,
  leave,
  getPresence,
  getDatePresence,
  getActivePresenceCount,
} = makeBookingAPI(components.booking);
