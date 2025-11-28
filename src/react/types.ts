// Core booking step states
export type BookingStep = "event-meta" | "booking-form" | "success";

// Slot interface
export interface CalcomSlot {
  time: string; // ISO timestamp: "2024-11-21T14:00:00.000Z"
  attendees?: number; // For future multi-attendee support
}

// Form data collected from user
export interface BookingFormData {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
}

// Complete booking object (matches extended DB schema)
export interface Booking {
  _id: string;
  uid: string;
  resourceId: string;
  eventTypeId: string;
  start: number;
  end: number;
  timezone: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "rescheduled";
  bookerName: string;
  bookerEmail: string;
  bookerPhone?: string;
  bookerNotes?: string;
  eventTitle: string;
  eventDescription?: string;
  location?: { type: string; value?: string };
  createdAt?: number;
  updatedAt?: number;
}

// Event type from database
export interface EventType {
  _id: string;
  id: string;
  title: string;
  slug: string;
  description?: string;
  lengthInMinutes: number;
  lengthInMinutesOptions?: number[];
  slotInterval?: number;
  locations?: Array<{ type: string; address?: string; public?: boolean }>;
  isActive?: boolean;
  timezone: string;
  lockTimeZoneToggle?: boolean;
  bufferBefore?: number;
  bufferAfter?: number;
  minNoticeMinutes?: number;
  maxFutureMinutes?: number;
  requiresConfirmation?: boolean;
  scheduleId?: string;
  organizationId?: string;
}

// Resource from database
export interface Resource {
  _id: string;
  id: string;
  name: string;
  type: string;
  description?: string;
  timezone: string;
  isActive: boolean;
  isFungible?: boolean;
  isStandalone?: boolean;
  quantity?: number;
  organizationId?: string;
}

// Schedule from database
export interface Schedule {
  _id: string;
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  organizationId: string;
  weeklyHours: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
}

// Time slot for display
export interface TimeSlot {
  time: string;
  attendees: number;
}

// Month slots availability map
export type MonthSlots = Record<string, boolean>;

// Presence record
export interface PresenceRecord {
  slot: string;
  user: string;
  updated: number;
}

// Booking validation error types
export type BookingValidationError =
  | { type: "event_type_not_found" }
  | { type: "event_type_inactive" }
  | { type: "resource_not_found" }
  | { type: "resource_inactive" }
  | { type: "resource_not_linked" }
  | { type: "duration_invalid"; validDurations: number[] };

export interface BookingValidationResult {
  status: "loading" | "valid" | "error";
  error?: BookingValidationError;
}
