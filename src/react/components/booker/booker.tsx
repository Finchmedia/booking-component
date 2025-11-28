"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useBookingAPI } from "../../context";
import { useSlotHold } from "../../hooks/use-slot-hold";
import { useBookingValidation } from "../../hooks/use-booking-validation";
import { Calendar } from "../calendar/calendar";
import { BookingForm } from "../form/booking-form";
import { BookingSuccess } from "../form/booking-success";
import { BookingErrorDialog } from "./booking-error-dialog";
import type {
  BookingStep,
  BookingFormData,
  Booking,
  EventType,
  Resource,
} from "../../types";

export interface BookerProps {
  /** Event type ID to book */
  eventTypeId: string;
  /** Resource ID to book (e.g., "studio-a") */
  resourceId: string;
  /** Optional header title */
  title?: string;
  /** Optional header description */
  description?: string;
  /** Show/hide header section (default: true) */
  showHeader?: boolean;
  /** Organizer display name */
  organizerName?: string;
  /** Organizer avatar URL */
  organizerAvatar?: string;
  /** Callback when booking is successfully created */
  onBookingComplete?: (booking: Booking) => void;
  /** Callback to reset event type selection (for embedded Booker) */
  onEventTypeReset?: () => void;
  /** Callback for navigation (used when resource is deleted/deactivated) */
  onNavigate?: (path: string) => void;
}

export function Booker({
  eventTypeId,
  resourceId,
  title,
  description,
  showHeader = true,
  organizerName,
  organizerAvatar,
  onBookingComplete,
  onEventTypeReset,
  onNavigate,
}: BookerProps) {
  const api = useBookingAPI();

  // Step state
  const [bookingStep, setBookingStep] = useState<BookingStep>("event-meta");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(
    null
  );

  // Calendar state (persists across navigation)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [timezone, setTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");

  // Mutations
  const createBooking = useMutation(api.createBooking);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch event type, resource, and link state from DB
  const eventType = useQuery(api.getEventType, { eventTypeId }) as
    | EventType
    | null
    | undefined;
  const resource = useQuery(api.getResource, { id: resourceId }) as
    | Resource
    | null
    | undefined;
  const hasLink = useQuery(api.hasResourceEventTypeLink, {
    resourceId,
    eventTypeId,
  }) as boolean | null | undefined;

  // Calculate effective slot interval (smart defaulting - same logic as useConvexSlots)
  const slotInterval =
    eventType?.slotInterval ??
    (eventType?.lengthInMinutesOptions &&
    eventType.lengthInMinutesOptions.length > 0
      ? Math.min(
          ...eventType.lengthInMinutesOptions,
          eventType.lengthInMinutes
        )
      : eventType?.lengthInMinutes);

  // Real-time Hold: Automatically reserve all affected slots (quantum coverage)
  useSlotHold(resourceId, selectedSlot, selectedDuration, eventTypeId);

  // Reactive validation: Monitor event type, resource, and link state
  const validation = useBookingValidation(
    eventType,
    resource,
    hasLink,
    selectedDuration,
    resourceId
  );

  // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
  const handleSlotSelect = (data: { slot: string; duration: number }) => {
    setSelectedSlot(data.slot);
    setSelectedDuration(data.duration); // LOCK the duration at slot selection
    setBookingStep("booking-form");
  };

  // Step 2: Form submission
  const handleFormSubmit = async (formData: BookingFormData) => {
    if (!selectedSlot || !eventType) return;

    setIsSubmitting(true);

    try {
      const start = new Date(selectedSlot).getTime();
      const end = start + selectedDuration * 60 * 1000;

      const booking = await createBooking({
        eventTypeId: eventType.id,
        resourceId,
        start,
        end,
        timezone,
        booker: formData,
        location: {
          type: "address",
          value: eventType.locations?.[0]?.address || "Studio A",
        },
      });

      // Cast the result to Booking type
      const completedBookingData = booking as unknown as Booking;
      setCompletedBooking(completedBookingData);
      setBookingStep("success");

      // Trigger callback if provided
      onBookingComplete?.(completedBookingData);
    } catch (error) {
      console.error("Booking failed:", error);
      alert("Booking failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Back to calendar
  const handleBack = () => {
    setBookingStep("event-meta");
    setSelectedSlot(null); // Release the hold
  };

  // Reset flow
  const handleBookAnother = () => {
    setBookingStep("event-meta");
    setSelectedSlot(null);
    setCompletedBooking(null);
  };

  // Reset calendar state (for duration_invalid error)
  const handleReset = () => {
    setBookingStep("event-meta");
    setSelectedSlot(null);
    // Reset to first available duration
    if (eventType?.lengthInMinutesOptions?.length) {
      setSelectedDuration(Math.min(...eventType.lengthInMinutesOptions));
    } else if (eventType) {
      setSelectedDuration(eventType.lengthInMinutes);
    }
  };

  // Memoize event type with selected duration for display
  const displayedEventType = useMemo(() => {
    if (!eventType) return undefined;
    return {
      ...eventType,
      lengthInMinutes: selectedDuration, // Override base length with user selection
    };
  }, [eventType, selectedDuration]);

  // Show loading state if event type is still loading
  if (eventType === undefined) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2xl p-8">
        <div className="h-64 w-full bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  return (
    <>
      {/* Error Dialog (blocking) */}
      {validation.status === "error" && validation.error && (
        <BookingErrorDialog
          error={validation.error}
          onReset={handleReset}
          onEventTypeReset={onEventTypeReset}
          onNavigate={onNavigate}
        />
      )}

      {/* Optional Header */}
      {showHeader &&
        bookingStep === "event-meta" &&
        (title || description) && (
          <div className="text-center mb-8">
            {title && (
              <h1 className="text-4xl font-bold text-foreground mb-4">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>
        )}

      {/* Step 1: Calendar View */}
      {bookingStep === "event-meta" && eventType && (
        <Calendar
          resourceId={resourceId}
          eventTypeId={eventType.id}
          onSlotSelect={handleSlotSelect}
          title={eventType.title}
          organizerName={organizerName}
          organizerAvatar={organizerAvatar}
          // Controlled state (persists across navigation)
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          selectedDuration={selectedDuration}
          onDurationChange={setSelectedDuration}
          timezone={timezone}
          onTimezoneChange={setTimezone}
          timeFormat={timeFormat}
          onTimeFormatChange={setTimeFormat}
        />
      )}

      {/* Step 2: Booking Form */}
      {bookingStep === "booking-form" && selectedSlot && displayedEventType && (
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2xl">
          <BookingForm
            eventType={displayedEventType}
            selectedSlot={selectedSlot}
            selectedDuration={selectedDuration}
            timezone={timezone}
            onSubmit={handleFormSubmit}
            onBack={handleBack}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Step 3: Success Screen */}
      {bookingStep === "success" && completedBooking && displayedEventType && (
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2xl">
          <BookingSuccess
            booking={completedBooking}
            eventType={displayedEventType}
            onBookAnother={handleBookAnother}
          />
        </div>
      )}
    </>
  );
}
