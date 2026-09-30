"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../../context.js";
import { useSlotHold } from "../../hooks/use-slot-hold.js";
import { useBookingValidation } from "../../hooks/use-booking-validation.js";
import { resolveBookingErrorMessage } from "../../utils/booking-error.js";
import { toLocalMidnight, todayIn } from "../../utils/civil-date.js";
import { allowedDurations } from "../../../shared/durations.js";
import { Calendar, CalendarSkeleton } from "../calendar/index.js";
import { BookingForm, type CurrentUser } from "../form/booking-form.js";
import { BookingSuccess } from "../form/booking-success.js";
import { BookingErrorDialog } from "./booking-error-dialog.js";
import { getRecoveryAction } from "./recovery.js";
import type { BookingStep, BookingFormData, Booking } from "../../types.js";
import type { BookingView, EventTypeView } from "../../contract.js";

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
  /**
   * Callback when a booking is created or moved. Receives the result of your
   * createBooking or rescheduleBookingByToken function, typed as the fields
   * the contract requires (`BookingView`). An error it throws is logged; the
   * booking is not reported as failed.
   */
  onBookingComplete?: (booking: BookingView) => void;
  /**
   * Callback to reset event type selection (for embedded Booker). Used when the
   * event type is deleted or deactivated or the resource is unlinked.
   */
  onEventTypeReset?: () => void;
  /**
   * Callback for navigation (used when resource is deleted/deactivated).
   * `path` is the deprecated recoveryPath (a demo route); navigate to your own
   * resource page. Without the matching callback the Booker shows the error
   * inline instead of a blocking dialog.
   */
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
 * The first configured location's address, never an invented one. The type is
 * "address" as before; without a configured address there is no value.
 */
function bookingLocation(locations: EventTypeView["locations"]): { type: string; value?: string } {
  const address = locations?.[0]?.address;
  return address ? { type: "address", value: address } : { type: "address" };
}

/** A completed submission and what its success screen shows, fixed when it completed. */
interface Completion {
  booking: BookingView;
  eventType: { title: string; description?: string; lengthInMinutes: number };
  isRescheduling: boolean;
  timeFormat: "12h" | "24h";
}

/**
 * Calls a host callback. What it throws is logged: a host bug must neither turn
 * a booking into a reported failure nor escape as an unhandled rejection.
 */
function callHost(name: string, callback: () => void) {
  try {
    callback();
  } catch (error) {
    console.error(`Booker: ${name} threw:`, error);
  }
}

/**
 * A new event type, resource or original booking starts a fresh flow: the keyed
 * inner component resets step, slot, duration and calendar state, and releases
 * any held slot. The key is a JSON array, so no id can collide with another
 * pair ("a", "b|c" vs "a|b", "c").
 *
 * Completed submissions are held here, outside the keyed flow, so a submission
 * still pending when the flow is replaced is not lost: when it succeeds, the
 * flow mounted by then shows the success screen for the booking that was made,
 * with its own event type and time format, and onBookingComplete is called
 * once. A failure after the replacement is only logged and passed to
 * onBookingError, because nothing was booked and the user has moved on.
 */
export function Booker(props: BookerProps) {
  const identity = JSON.stringify([
    props.eventTypeId,
    props.resourceId,
    props.originalBooking?.uid ?? "",
  ]);
  const [completion, setCompletion] = useState<Completion | null>(null);
  // Rule: every submission of any flow gets the next number when it is sent.
  // The confirmation shown is the completed submission that started last: a
  // submission that completes after a later one has completed is recorded
  // (its onBookingComplete still runs, the booking was made) but not shown, so
  // an older request resolving late never replaces a newer confirmation.
  const lastStarted = useRef(0);
  const lastCompleted = useRef(0);
  const startSubmission = () => ++lastStarted.current;
  const completeSubmission = (submission: number, next: Completion) => {
    if (submission < lastCompleted.current) return; // A later one is shown
    lastCompleted.current = submission;
    setCompletion(next);
  };
  return (
    <BookerFlow
      key={identity}
      {...props}
      completion={completion}
      onSubmissionStart={startSubmission}
      onCompletion={completeSubmission}
    />
  );
}

interface BookerFlowProps extends BookerProps {
  /** The completed submission that started last, across all flows of this Booker */
  completion: Completion | null;
  /** Numbers a submission as it is sent */
  onSubmissionStart: () => number;
  /** Reports a completed submission; the Booker decides whether it is shown */
  onCompletion: (submission: number, completion: Completion) => void;
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
  completion,
  onSubmissionStart,
  onCompletion,
}: BookerFlowProps) {
  const api = useBookingAPI();

  // Detect reschedule mode
  const isRescheduling = !!originalBooking;

  // Step state
  const [bookingStep, setBookingStep] = useState<BookingStep>("event-meta");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Calendar state (persists across navigation)
  const [timezone, setTimezone] = useState<string>(
    originalBooking?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Open on the month that contains today in the display zone
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    toLocalMidnight(todayIn(timezone))
  );
  // Pre-populate duration from original booking if rescheduling
  const [requestedDuration, setSelectedDuration] = useState<number>(
    originalBooking
      ? Math.round((originalBooking.end - originalBooking.start) / 60000)
      : 60
  );
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("24h");
  // Confirm and success steps use the calendar's (browser) locale
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;

  // Mutations
  const createBooking = useMutation(api.createBooking);
  // Reschedule mutation (for token-based public reschedule). The contract
  // requires it, but an untyped hand-built API can lack it at runtime. useMutation
  // needs a reference on every render, so it then stays bound to createBooking;
  // reschedule paths check it instead.
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

  // Each new completion replaces the current step with its success screen: this
  // flow's own, or one a replaced flow sent after an identity change. One that
  // predates this flow was already shown by the flow it belongs to.
  const [shownCompletion, setShownCompletion] = useState(completion);
  if (completion !== shownCompletion) {
    setShownCompletion(completion);
    setSelectedSlot(null); // The booking replaces the advisory hold
    setBookingError(null);
    setBookingStep("success");
  }

  // Fetch event type, resource, and link state from DB
  const eventType = useQuery(api.getEventType, { eventTypeId });
  const resource = useQuery(api.getResource, { id: resourceId });
  const hasLink = useQuery(api.hasResourceEventTypeLink, {
    resourceId,
    eventTypeId,
  });

  // Derive a valid default as event data arrives; no effect/state round-trip.
  // Preserve the original duration in reschedule mode for validation to report.
  const availableDurations = eventType ? allowedDurations(eventType) : [];
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
  // Validation errors never cover a completed booking. While one is shown a new
  // booking cannot proceed. A reschedule is not blocked: the error is an inline
  // notice above the flow and the host's reschedule function decides.
  const validationError = bookingStep === "success" ? undefined : validation.error;
  const isCreateBlocked = !isRescheduling && !!validationError;

  // A step change moves focus to the new step's heading (not on first render)
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedStep = useRef(bookingStep);
  useEffect(() => {
    if (focusedStep.current === bookingStep) return;
    focusedStep.current = bookingStep;
    rootRef.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [bookingStep]);

  // Every visible failure is logged, shown to the user and reported to the host.
  const reportError = (
    phase: BookingPhase,
    error: unknown,
    message = resolveBookingErrorMessage(error)
  ) => {
    console.error(phase === "reschedule" ? "Reschedule failed:" : "Booking failed:", error);
    setBookingError({ phase, message });
    callHost("onBookingError", () => onBookingError?.(error, { phase }));
  };

  // A completed submission goes to the Booker, so its success screen survives
  // this flow being replaced meanwhile and keeps the event type it was made for
  // even if that later resolves to null. Host callbacks run after the mutation,
  // outside its error handling, for every booking made, shown or not.
  const completeBooking = (submission: number, booking: BookingView) => {
    onCompletion(submission, {
      booking,
      eventType: {
        // A host may leave eventTitle out of its result (BookingView); a move
        // keeps the original's title
        title: eventType?.title ?? booking.eventTitle ?? originalBooking?.eventTitle ?? "",
        description: eventType?.description,
        lengthInMinutes: selectedDuration,
      },
      isRescheduling,
      timeFormat,
    });
    callHost("onBookingComplete", () => onBookingComplete?.(booking));
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
    const submission = onSubmissionStart();

    let newBooking: BookingView;
    try {
      const newStart = new Date(newSlot).getTime();
      const newEnd = newStart + selectedDuration * 60 * 1000;

      newBooking = await rescheduleBookingByToken({
        uid: target.uid,
        token: target.token,
        newStart,
        newEnd,
      });
    } catch (error) {
      setSelectedSlot(null); // Release the hold on the slot that was not booked
      reportError("reschedule", error);
      return;
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
    completeBooking(submission, newBooking);
  };

  // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
  const handleSlotSelect = (data: { slot: string; duration: number }) => {
    if (inFlight.current) return; // A move is still being sent
    if (isCreateBlocked) return; // The configuration no longer allows booking
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
    if (isCreateBlocked) return; // The configuration no longer allows booking
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
    const submission = onSubmissionStart();

    let booking: BookingView;
    try {
      const start = new Date(selectedSlot).getTime();
      const end = start + selectedDuration * 60 * 1000;

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
          location: bookingLocation(eventType.locations),
        });
      }
    } catch (error) {
      const isAuthError =
        error instanceof ConvexError &&
        (error.data as { code?: string })?.code === "UNAUTHENTICATED";

      // New bookings hand authentication to the host when it can sign users in
      if (isAuthError && !isRescheduling && onAuthRequired) {
        const slotData = { slot: selectedSlot, duration: selectedDuration, eventTypeId };
        callHost("onAuthRequired", () => onAuthRequired(slotData));
        return;
      }

      reportError(
        phase,
        error,
        resolveBookingErrorMessage(error, isAuthError ? SIGN_IN_MESSAGE : undefined)
      );
      return;
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
    completeBooking(submission, booking);
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
  };

  // Reset calendar state (for duration_invalid error)
  const handleReset = () => {
    setBookingStep("event-meta");
    setSelectedSlot(null);
    // Reset to the shortest available duration
    if (eventType) {
      setSelectedDuration(Math.min(...allowedDurations(eventType)));
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

  // Show loading state if event type is still loading; a success screen needs
  // no event type
  if (eventType === undefined && bookingStep !== "success") {
    return <CalendarSkeleton />;
  }

  // With a host callback for its recovery a validation error is a modal dialog
  // over the flow; without one it replaces the flow, so the page stays usable.
  // When rescheduling it is an inline notice above the flow instead.
  const recoveryHandlers = isRescheduling
    ? {}
    : { onReset: handleReset, onEventTypeReset, onNavigate };
  const showFlow =
    !validationError ||
    isRescheduling ||
    !!getRecoveryAction(validationError, recoveryHandlers);

  return (
    // Inline style, so the layout does not depend on the host's CSS build
    <div ref={rootRef} style={{ display: "contents" }}>
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

      {/* Validation error: modal with a recovery action, inline otherwise */}
      {validationError && (
        <BookingErrorDialog error={validationError} {...recoveryHandlers} />
      )}

      {showFlow && (
        <>
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
          {bookingStep === "success" && completion && (
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2xl">
              <BookingSuccess
                booking={completion.booking}
                eventType={completion.eventType}
                onBookAnother={handleBookAnother}
                isRescheduling={completion.isRescheduling}
                timeFormat={completion.timeFormat}
                locale={locale}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
