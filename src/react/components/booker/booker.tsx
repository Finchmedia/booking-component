"use client";

import { useState, useMemo, useEffect } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../../context";
import { useSlotHold } from "../../hooks/use-slot-hold";
import { useBookingValidation } from "../../hooks/use-booking-validation";
import { Calendar, CalendarSkeleton } from "../calendar";
import { BookingForm, type CurrentUser } from "../form/booking-form";
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
  /** Current logged-in user for prefilling name/email in the form */
  currentUser?: CurrentUser;
  /** Callback when booking is successfully created */
  onBookingComplete?: (booking: Booking) => void;
  /** Callback to reset event type selection (for embedded Booker) */
  onEventTypeReset?: () => void;
  /** Callback for navigation (used when resource is deleted/deactivated) */
  onNavigate?: (path: string) => void;
  /** Callback when authentication is required (user not signed in) */
  onAuthRequired?: (slotData: { slot: string; duration: number; eventTypeId: string }) => void;
  /**
   * Reschedule mode: Provide the original booking to modify
   * When present, the Booker will call rescheduleBookingByToken instead of createBooking
   */
  originalBooking?: Booking;
  /**
   * Skip the booking form step and reuse original booker info
   * Only applies when originalBooking is provided
   * When true: slot selection → immediate reschedule
   * When false: slot selection → form (with reschedule messaging) → reschedule
   */
  reuseBookerInfo?: boolean;
}

export function Booker({
  eventTypeId,
  resourceId,
  title,
  description,
  showHeader = true,
  organizerName,
  organizerAvatar,
  currentUser,
  onBookingComplete,
  onEventTypeReset,
  onNavigate,
  onAuthRequired,
  originalBooking,
  reuseBookerInfo = false,
}: BookerProps) {
  const api = useBookingAPI();

  // Detect reschedule mode
  const isRescheduling = !!originalBooking;

  // Step state
  const [bookingStep, setBookingStep] = useState<BookingStep>("event-meta");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(
    null
  );

  // Calendar state (persists across navigation)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  // Pre-populate duration from original booking if rescheduling
  const [selectedDuration, setSelectedDuration] = useState<number>(
    originalBooking
      ? Math.round((originalBooking.end - originalBooking.start) / 60000)
      : 60
  );
  const [timezone, setTimezone] = useState<string>(
    originalBooking?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");

  // Mutations
  const createBooking = useMutation(api.createBooking);
  // Reschedule mutation (for token-based public reschedule)
  const rescheduleBookingByToken = api.rescheduleBookingByToken
    ? useMutation(api.rescheduleBookingByToken)
    : null;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error state for booking/reschedule failures
  const [bookingError, setBookingError] = useState<{
    title: string;
    message: string;
  } | null>(null);

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

  // Sync selectedDuration with event type's available options when event type loads
  // This fixes the bug where default duration (60) might not be in the event type's options
  useEffect(() => {
    if (!eventType || originalBooking) return; // Skip if loading or rescheduling (has its own default)

    const availableDurations = eventType.lengthInMinutesOptions?.length
      ? eventType.lengthInMinutesOptions
      : [eventType.lengthInMinutes];

    // Only update if current selection is not valid
    if (!availableDurations.includes(selectedDuration)) {
      // Pick the first available duration (smallest if options exist)
      const newDuration = eventType.lengthInMinutesOptions?.length
        ? Math.min(...eventType.lengthInMinutesOptions)
        : eventType.lengthInMinutes;
      setSelectedDuration(newDuration);
    }
  }, [eventType, originalBooking, selectedDuration]);

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

  // Reschedule handler: Call rescheduleBookingByToken directly (skips form)
  const handleReschedule = async (newSlot: string) => {
    if (!originalBooking || !eventType || !rescheduleBookingByToken || !originalBooking.managementToken) {
      console.error("Cannot reschedule: missing originalBooking, eventType, mutation, or managementToken");
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const newStart = new Date(newSlot).getTime();
      const newEnd = newStart + selectedDuration * 60 * 1000;

      const newBooking = await rescheduleBookingByToken({
        uid: originalBooking.uid,
        token: originalBooking.managementToken,
        newStart,
        newEnd,
      });

      const completedBookingData = newBooking as unknown as Booking;
      setCompletedBooking(completedBookingData);
      setBookingStep("success");
      onBookingComplete?.(completedBookingData);
    } catch (error) {
      console.error("Reschedule failed:", error);
      setBookingError({
        title: "Reschedule Failed",
        message: error instanceof Error ? error.message : "Failed to reschedule booking. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
  const handleSlotSelect = (data: { slot: string; duration: number }) => {
    setSelectedSlot(data.slot);
    setSelectedDuration(data.duration); // LOCK the duration at slot selection

    // If rescheduling with booker info reuse, skip form and reschedule immediately
    if (isRescheduling && reuseBookerInfo) {
      handleReschedule(data.slot);
    } else {
      setBookingStep("booking-form");
    }
  };

  // Step 2: Form submission (handles both new booking and reschedule via form)
  const handleFormSubmit = async (formData: BookingFormData) => {
    if (!selectedSlot || !eventType) return;

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const start = new Date(selectedSlot).getTime();
      const end = start + selectedDuration * 60 * 1000;

      let booking;

      if (isRescheduling && originalBooking && rescheduleBookingByToken && originalBooking.managementToken) {
        // RESCHEDULE PATH: Call reschedule mutation (form was shown for confirmation)
        booking = await rescheduleBookingByToken({
          uid: originalBooking.uid,
          token: originalBooking.managementToken,
          newStart: start,
          newEnd: end,
        });
      } else if (isRescheduling) {
        // Missing required data for reschedule
        throw new Error("Missing management token for reschedule");
      } else {
        // CREATE PATH: Normal booking creation
        booking = await createBooking({
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
      }

      // Cast the result to Booking type
      const completedBookingData = booking as unknown as Booking;
      setCompletedBooking(completedBookingData);
      setBookingStep("success");

      // Trigger callback if provided
      onBookingComplete?.(completedBookingData);
    } catch (error) {
      console.error(isRescheduling ? "Reschedule failed:" : "Booking failed:", error);

      // Check for authentication error (only for new bookings)
      if (
        !isRescheduling &&
        error instanceof ConvexError &&
        (error.data as { code?: string })?.code === "UNAUTHENTICATED"
      ) {
        if (onAuthRequired && selectedSlot) {
          onAuthRequired({
            slot: selectedSlot,
            duration: selectedDuration,
            eventTypeId,
          });
          return;
        }
      }

      setBookingError({
        title: isRescheduling ? "Reschedule Failed" : "Booking Failed",
        message: error instanceof Error ? error.message : "Please try again.",
      });
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
    return <CalendarSkeleton />;
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
            currentUser={
              currentUser ?? (originalBooking
                ? {
                    name: originalBooking.bookerName,
                    email: originalBooking.bookerEmail,
                  }
                : undefined)
            }
            isRescheduling={isRescheduling}
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
            isRescheduling={isRescheduling}
          />
        </div>
      )}
    </>
  );
}
