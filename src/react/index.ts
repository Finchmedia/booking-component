"use client";

// Context and Provider
export {
  BookingProvider,
  useBookingAPI,
  type BookingAPI,
  type PublicBookingAPI,
  type AdminBookingAPI,
  type BookingProviderProps,
} from "./context";

// Types
export type {
  BookingStep,
  CalcomSlot,
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
} from "./types";

// Hooks
export {
  useConvexSlots,
  type UseConvexSlotsResult,
} from "./hooks/use-convex-slots";
export { useSlotHold } from "./hooks/use-slot-hold";
export {
  useBookingValidation,
  type ValidationError,
  type ValidationErrorType,
  type ValidationResult,
} from "./hooks/use-booking-validation";
export { useSlotPresence } from "./hooks/use-slot-presence";
export { useIntersectionObserver } from "./hooks/use-intersection-observer";

// Utilities
export { getSessionId } from "./utils/session";
export {
  DAYS,
  MONTHS,
  formatTime,
  generateCalendarDays,
  type CalendarDay,
} from "./utils/date-utils";
export {
  getTimezoneOffset,
  getRegionFromTimezone,
  getTimezoneDisplayName,
  getAvailableTimezones,
  type TimezoneOption,
} from "./utils/timezone-utils";
export {
  formatDate,
  formatTimeDisplay,
  formatDuration,
  formatDateTime,
} from "./utils/formatting";
export { bookingFormSchema, type BookingFormValues } from "./utils/validation";

// Main Components
export { Booker, type BookerProps } from "./components/booker";
export { BookingErrorDialog } from "./components/booker";

// Calendar Components
export {
  Calendar,
  CalendarGrid,
  CalendarNavigation,
  CalendarDayButton,
  TimeSlotsPanel,
  TimeSlotButton,
  EventMetaPanel,
} from "./components/calendar";

// Form Components
export { BookingForm, BookingSuccess } from "./components/form";
