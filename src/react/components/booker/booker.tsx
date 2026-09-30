"use client";

import { useState, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../../context";
import { useSlotHold } from "../../hooks/use-slot-hold";
import { useBookingValidation } from "../../hooks/use-booking-validation";
import { resolveBookingErrorMessage } from "../../utils/booking-error";
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

type BookingPhase = "create" | "reschedule";

const SIGN_IN_MESSAGE = "Please sign in to continue.";
const RESCHEDULE_NOT_CONFIGURED = "Rescheduling is not configured for this booking page.";

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
  /**
   * Callback when authentication is required for a new booking (user not signed in).
   * Without it, the Booker shows a sign-in message.
   */
  onAuthRequired?: (slotData: { slot: string; duration: number; eventTypeId: string }) => void;
  /**
   * Called when a booking or reschedule attempt fails, in addition to the error
   * message the Booker shows. Use it for telemetry or host notifications.
   * Not called when an authentication error is handed to onAuthRequired.
   */
  onBookingError?: (error: unknown, context: { phase: BookingPhase }) => void;
  /**
   * Reschedule mode: Provide the original booking to modify
   * When present, the Booker will call rescheduleBookingByToken instead of createBooking
   */
  originalBooking?: Booking;
  /**
   * Skip the confirmation step and reuse original booker info
   * Only applies when originalBooking is provided
   * When true: slot selection → immediate reschedule
   * When false: slot selection → read-only confirmation → reschedule
   * A reschedule always keeps the original contact details.
   */
  reuseBookerInfo?: boolean;
}

/**
 * A new event type, resource or original booking starts a fresh flow: the keyed
 * inner component resets step, slot, duration and calendar state, and releases
 * any held slot.
 */
export function Booker(props: BookerProps) {
  const identity = `${props.eventTypeId}|${props.resourceId}|${props.originalBooking?.uid ?? ""}`;
  return <BookerFlow key={identity} {...props} />;
}

function BookerFlow({
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
  onBookingError,
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
  const [requestedDuration, setSelectedDuration] = useState<number>(
    originalBooking
      ? Math.round((originalBooking.end - originalBooking.start) / 60000)
      : 60
  );
  const [timezone, setTimezone] = useState<string>(
    originalBooking?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");
  // Confirm and success steps use the calendar's (browser) locale
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;

  // Mutations
  const createBooking = useMutation(api.createBooking);
  // Reschedule mutation (for token-based public reschedule). useMutation needs a
  // reference on every render, so a hand-built API without the reschedule
  // reference stays bound to createBooking; reschedule paths check it instead.
  const rescheduleBookingByToken = useMutation(
    api.rescheduleBookingByToken ?? api.createBooking
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous guard: repeats in the same tick (double submit, a second slot
  // click during a move) must not send a second mutation before re-render.
  const inFlight = useRef(false);

  // Error state for booking/reschedule failures
  const [bookingError, setBookingError] = useState<{
    phase: BookingPhase;
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
  const _slotInterval =
    eventType?.slotInterval ??
    (eventType?.lengthInMinutesOptions &&
    eventType.lengthInMinutesOptions.length > 0
      ? Math.min(
          ...eventType.lengthInMinutesOptions,
          eventType.lengthInMinutes
        )
      : eventType?.lengthInMinutes);

  // Derive a valid default as event data arrives; no effect/state round-trip.
  // Preserve the original duration in reschedule mode for validation to report.
  const availableDurations = eventType?.lengthInMinutesOptions?.length
    ? eventType.lengthInMinutesOptions
    : eventType ? [eventType.lengthInMinutes] : [];
  const selectedDuration = bookingStep === "event-meta" && !originalBooking && availableDurations.length > 0 &&
    !availableDurations.includes(requestedDuration)
    ? Math.min(...availableDurations)
    : requestedDuration;

  // Advisory presence follows the selected interval; mutations enforce inventory.
  useSlotHold(resourceId, selectedSlot, selectedDuration, eventTypeId);

  // Reactive validation: Monitor event type, resource, and link state
  const validation = useBookingValidation(
    eventType,
    resource,
    hasLink,
    selectedDuration,
    resourceId
  );

  // Every visible failure is logged, shown to the user and reported to the host.
  const reportError = (
    phase: BookingPhase,
    error: unknown,
    message = resolveBookingErrorMessage(error)
  ) => {
    console.error(phase === "reschedule" ? "Reschedule failed:" : "Booking failed:", error);
    setBookingError({ phase, message });
    onBookingError?.(error, { phase });
  };

  // Rescheduling needs the mutation reference and the original's token. A
  // generated API exposes every name, so only hand-built API objects fail here.
  const getRescheduleTarget = () => {
    if (!api.rescheduleBookingByToken) {
      return { error: new Error("Booker: rescheduleBookingByToken is missing from the booking API") };
    }
    if (!originalBooking?.managementToken) {
      return { error: new Error("Booker: originalBooking has no managementToken") };
    }
    return { uid: originalBooking.uid, token: originalBooking.managementToken };
  };

  // Reschedule handler: Call rescheduleBookingByToken directly (skips form)
  const handleReschedule = async (newSlot: string) => {
    const target = getRescheduleTarget();
    if ("error" in target) {
      setSelectedSlot(null); // Nothing is being booked; release the hold
      reportError("reschedule", target.error, RESCHEDULE_NOT_CONFIGURED);
      return;
    }

    inFlight.current = true;
    setIsSubmitting(true);

    try {
      const newStart = new Date(newSlot).getTime();
      const newEnd = newStart + selectedDuration * 60 * 1000;

      const newBooking = await rescheduleBookingByToken({
        uid: target.uid,
        token: target.token,
        newStart,
        newEnd,
      });

      const completedBookingData = newBooking as unknown as Booking;
      setCompletedBooking(completedBookingData);
      setSelectedSlot(null); // The booking replaces the advisory hold
      setBookingStep("success");
      onBookingComplete?.(completedBookingData);
    } catch (error) {
      setSelectedSlot(null); // Release the hold on the slot that was not booked
      reportError("reschedule", error);
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
  const handleSlotSelect = (data: { slot: string; duration: number }) => {
    if (inFlight.current) return; // A move is still being sent
    setBookingError(null);
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
    if (inFlight.current) return; // The same submission is still being sent
    const phase: BookingPhase = isRescheduling ? "reschedule" : "create";
    if (!selectedSlot || !eventType) {
      reportError(phase, new Error("Booker: no slot or event type is selected"), "Please select a time again.");
      return;
    }
    const target = isRescheduling ? getRescheduleTarget() : null;
    if (target && "error" in target) {
      reportError(phase, target.error, RESCHEDULE_NOT_CONFIGURED);
      return;
    }

    inFlight.current = true;
    setIsSubmitting(true);
    setBookingError(null);

    try {
      const start = new Date(selectedSlot).getTime();
      const end = start + selectedDuration * 60 * 1000;

      let booking;

      if (target) {
        // RESCHEDULE PATH: Call reschedule mutation (form was shown for confirmation)
        booking = await rescheduleBookingByToken({
          uid: target.uid,
          token: target.token,
          newStart: start,
          newEnd: end,
        });
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
      setSelectedSlot(null); // The booking replaces the advisory hold
      setBookingStep("success");

      // Trigger callback if provided
      onBookingComplete?.(completedBookingData);
    } catch (error) {
      const isAuthError =
        error instanceof ConvexError &&
        (error.data as { code?: string })?.code === "UNAUTHENTICATED";

      // New bookings hand authentication to the host when it can sign users in
      if (isAuthError && !isRescheduling && onAuthRequired) {
        onAuthRequired({
          slot: selectedSlot,
          duration: selectedDuration,
          eventTypeId,
        });
        return;
      }

      reportError(
        phase,
        error,
        resolveBookingErrorMessage(error, isAuthError ? SIGN_IN_MESSAGE : undefined)
      );
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  // Back to calendar
  const handleBack = () => {
    setBookingStep("event-meta");
    setSelectedSlot(null); // Release the hold
    setBookingError(null);
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

      {/* One-click reschedule feedback on the calendar step */}
      {bookingStep === "event-meta" && bookingError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-medium">
            {bookingError.phase === "reschedule" ? "Reschedule failed" : "Booking failed"}
          </p>
          <p>{bookingError.message}</p>
        </div>
      )}
      {bookingStep === "event-meta" && isSubmitting && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Rescheduling to the selected time...
        </p>
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
          disabled={isSubmitting}
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
            currentUser={currentUser}
            isRescheduling={isRescheduling}
            submitError={bookingError?.message}
            // A reschedule keeps the original contact details: confirm, don't edit
            readOnlyDetails={
              originalBooking
                ? {
                    name: originalBooking.bookerName,
                    email: originalBooking.bookerEmail,
                    phone: originalBooking.bookerPhone,
                    notes: originalBooking.bookerNotes,
                  }
                : undefined
            }
            timeFormat={timeFormat}
            locale={locale}
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
            timeFormat={timeFormat}
            locale={locale}
          />
        </div>
      )}
    </>
  );
}
