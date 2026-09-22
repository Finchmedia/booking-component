import { components } from "./_generated/api.js";
import { makeInternalBookingAPI } from "@mrfinch/booking";

// Optional server-only helpers: these exports appear under internal.example.
// The example has no authentication provider, so it exposes no public booking
// API. In an authenticated app, call components.booking directly from public
// functions after checking the caller's role and the target organization.
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

  // Presence (Best-effort UI signals; not inventory locks)
  heartbeat,
  leave,
  getPresence,
  getDatePresence,
  getActivePresenceCount,
} = makeInternalBookingAPI(components.booking);
