"use client";

// Context and Provider
export {
  BookingProvider,
  useBookingAPI,
  type BookingAPI,
  type PublicBookingAPI,
  type AdminBookingAPI,
  type BookingProviderProps,
} from "./context.js";

// Types
export type {
  BookingStep,
  BookingSlot,
  BookingFormData,
  Booking,
  EventType,
  Resource,
  Schedule,
  TimeSlot,
  MonthSlots,
  PresenceRecord,
  BookingValidationError,
  BookingValidationResult,
} from "./types.js";

// Hooks
export {
  useConvexSlots,
  type UseConvexSlotsResult,
} from "./hooks/use-convex-slots.js";
export { useSlotHold } from "./hooks/use-slot-hold.js";
export {
  useBookingValidation,
  type ValidationError,
  type ValidationErrorType,
  type ValidationRecovery,
  type ValidationResult,
} from "./hooks/use-booking-validation.js";
export { useSlotPresence } from "./hooks/use-slot-presence.js";
export { useIntersectionObserver } from "./hooks/use-intersection-observer.js";

// Utilities
export { getSessionId } from "./utils/session.js";
export {
  DAYS,
  MONTHS,
  formatTime,
  generateCalendarDays,
  type CalendarDay,
} from "./utils/date-utils.js";
export {
  getTimezoneOffset,
  getRegionFromTimezone,
  getTimezoneDisplayName,
  getAvailableTimezones,
  type TimezoneOption,
} from "./utils/timezone-utils.js";
export {
  formatDate,
  formatTimeDisplay,
  formatDuration,
  formatDateTime,
} from "./utils/formatting.js";
export { bookingFormSchema, type BookingFormValues } from "./utils/validation.js";
export {
  allowedDurations,
  effectiveSlotInterval,
  type EventTypeDurations,
} from "./utils/durations.js";

// Main Components
export { Booker, type BookerProps } from "./components/booker/index.js";
export { BookingErrorDialog } from "./components/booker/index.js";

// Calendar Components
export {
  Calendar,
  CalendarGrid,
  CalendarNavigation,
  CalendarDayButton,
  TimeSlotsPanel,
  TimeSlotButton,
  EventMetaPanel,
} from "./components/calendar/index.js";

// Form Components
export { BookingForm, BookingSuccess, type CurrentUser } from "./components/form/index.js";
