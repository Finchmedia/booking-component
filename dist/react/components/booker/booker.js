"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { BookingForm } from "../form/booking-form.js";
import { BookingSuccess } from "../form/booking-success.js";
import { BookingErrorDialog } from "./booking-error-dialog.js";
import { getRecoveryAction } from "./recovery.js";
const SIGN_IN_MESSAGE = "Please sign in to continue.";
const RESCHEDULE_NOT_CONFIGURED = "Rescheduling is not configured for this booking page.";
/**
 * The first configured location's address, never an invented one. The type is
 * "address" as before; without a configured address there is no value.
 */
function bookingLocation(locations) {
    const address = locations?.[0]?.address;
    return address ? { type: "address", value: address } : { type: "address" };
}
/**
 * Calls a host callback. What it throws is logged: a host bug must neither turn
 * a booking into a reported failure nor escape as an unhandled rejection.
 */
function callHost(name, callback) {
    try {
        callback();
    }
    catch (error) {
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
 * still pending when the flow is replaced is not lost: when it succeeds and no
 * newer submission was sent meanwhile, the flow mounted by then shows the
 * success screen for the booking that was made, with its own event type and
 * time format. onBookingComplete is called once for every booking made, shown
 * or not. A failure after the replacement is only logged and passed to
 * onBookingError, because nothing was booked and the user has moved on.
 */
export function Booker(props) {
    const identity = JSON.stringify([
        props.eventTypeId,
        props.resourceId,
        props.originalBooking?.uid ?? "",
    ]);
    const [completion, setCompletion] = useState(null);
    // Rule: every submission of any flow gets the next number when it is sent,
    // and only the one sent last decides what is shown: its success screen, or
    // its error in its own form. An older submission that completes after a
    // newer one was sent is recorded (its onBookingComplete still runs, the
    // booking was made) but not shown, so it never covers the newer request's
    // confirmation or failure.
    const lastStarted = useRef(0);
    const startSubmission = () => ++lastStarted.current;
    const completeSubmission = (submission, next) => {
        if (submission !== lastStarted.current)
            return; // A newer one was sent
        setCompletion(next);
    };
    return (_jsx(BookerFlow, { ...props, completion: completion, onSubmissionStart: startSubmission, onCompletion: completeSubmission }, identity));
}
function BookerFlow({ eventTypeId, resourceId, title, description, showHeader = true, organizerName, organizerAvatar, currentUser, onBookingComplete, onEventTypeReset, onNavigate, onAuthRequired, onBookingError, originalBooking, reuseBookerInfo = false, completion, onSubmissionStart, onCompletion, }) {
    const api = useBookingAPI();
    // Detect reschedule mode
    const isRescheduling = !!originalBooking;
    // The booking being moved, for slot queries that exclude its own occupancy.
    // Sent only with the provider's availabilityContext opt-in.
    const rescheduleContext = originalBooking?.managementToken
        ? { uid: originalBooking.uid, token: originalBooking.managementToken }
        : undefined;
    // Step state
    const [bookingStep, setBookingStep] = useState("event-meta");
    const [selectedSlot, setSelectedSlot] = useState(null);
    // Calendar state (persists across navigation)
    const [timezone, setTimezone] = useState(originalBooking?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [selectedDate, setSelectedDate] = useState(null);
    // Open on the month that contains today in the display zone
    const [currentMonth, setCurrentMonth] = useState(() => toLocalMidnight(todayIn(timezone)));
    // Pre-populate duration from original booking if rescheduling
    const [requestedDuration, setSelectedDuration] = useState(originalBooking
        ? Math.round((originalBooking.end - originalBooking.start) / 60000)
        : 60);
    const [timeFormat, setTimeFormat] = useState("24h");
    // Confirm and success steps use the calendar's (browser) locale
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    // Mutations
    const createBooking = useMutation(api.createBooking);
    // Reschedule mutation (for token-based public reschedule). The contract
    // requires it, but an untyped hand-built API can lack it at runtime. useMutation
    // needs a reference on every render, so it then stays bound to createBooking;
    // reschedule paths check it instead.
    const rescheduleBookingByToken = useMutation(api.rescheduleBookingByToken ?? api.createBooking);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Synchronous guard: repeats in the same tick (double submit, a second slot
    // click during a move) must not send a second mutation before re-render.
    const inFlight = useRef(false);
    // Error state for booking/reschedule failures
    const [bookingError, setBookingError] = useState(null);
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
    const validation = useBookingValidation(eventType, resource, hasLink, selectedDuration, resourceId);
    // Validation errors never cover a completed booking. While one is shown a new
    // booking cannot proceed. A reschedule is not blocked: the error is an inline
    // notice above the flow and the host's reschedule function decides.
    const validationError = bookingStep === "success" ? undefined : validation.error;
    const isCreateBlocked = !isRescheduling && !!validationError;
    // A step change moves focus to the new step's heading (not on first render)
    const rootRef = useRef(null);
    const focusedStep = useRef(bookingStep);
    useEffect(() => {
        if (focusedStep.current === bookingStep)
            return;
        focusedStep.current = bookingStep;
        rootRef.current?.querySelector("[data-step-heading]")?.focus();
    }, [bookingStep]);
    // Every visible failure is logged, shown to the user and reported to the host.
    const reportError = (phase, error, message = resolveBookingErrorMessage(error)) => {
        console.error(phase === "reschedule" ? "Reschedule failed:" : "Booking failed:", error);
        setBookingError({ phase, message });
        callHost("onBookingError", () => onBookingError?.(error, { phase }));
    };
    // A completed submission goes to the Booker, so its success screen survives
    // this flow being replaced meanwhile and keeps the event type it was made for
    // even if that later resolves to null. Host callbacks run after the mutation,
    // outside its error handling, for every booking made, shown or not.
    const completeBooking = (submission, booking) => {
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
    const handleReschedule = async (newSlot) => {
        const target = getRescheduleTarget();
        if ("error" in target) {
            setSelectedSlot(null); // Nothing is being booked; release the hold
            reportError("reschedule", target.error, RESCHEDULE_NOT_CONFIGURED);
            return;
        }
        inFlight.current = true;
        setIsSubmitting(true);
        const submission = onSubmissionStart();
        let newBooking;
        try {
            const newStart = new Date(newSlot).getTime();
            const newEnd = newStart + selectedDuration * 60 * 1000;
            newBooking = await rescheduleBookingByToken({
                uid: target.uid,
                token: target.token,
                newStart,
                newEnd,
            });
        }
        catch (error) {
            setSelectedSlot(null); // Release the hold on the slot that was not booked
            reportError("reschedule", error);
            return;
        }
        finally {
            inFlight.current = false;
            setIsSubmitting(false);
        }
        completeBooking(submission, newBooking);
    };
    // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
    const handleSlotSelect = (data) => {
        if (inFlight.current)
            return; // A move is still being sent
        if (isCreateBlocked)
            return; // The configuration no longer allows booking
        setBookingError(null);
        setSelectedSlot(data.slot);
        setSelectedDuration(data.duration); // LOCK the duration at slot selection
        // If rescheduling with booker info reuse, skip form and reschedule immediately
        if (isRescheduling && reuseBookerInfo) {
            handleReschedule(data.slot);
        }
        else {
            setBookingStep("booking-form");
        }
    };
    // Step 2: Form submission (handles both new booking and reschedule via form)
    const handleFormSubmit = async (formData) => {
        if (inFlight.current)
            return; // The same submission is still being sent
        if (isCreateBlocked)
            return; // The configuration no longer allows booking
        const phase = isRescheduling ? "reschedule" : "create";
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
        let booking;
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
            }
            else {
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
        }
        catch (error) {
            const isAuthError = error instanceof ConvexError &&
                error.data?.code === "UNAUTHENTICATED";
            // New bookings hand authentication to the host when it can sign users in
            if (isAuthError && !isRescheduling && onAuthRequired) {
                const slotData = { slot: selectedSlot, duration: selectedDuration, eventTypeId };
                callHost("onAuthRequired", () => onAuthRequired(slotData));
                return;
            }
            reportError(phase, error, resolveBookingErrorMessage(error, isAuthError ? SIGN_IN_MESSAGE : undefined));
            return;
        }
        finally {
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
        if (!eventType)
            return undefined;
        return {
            ...eventType,
            lengthInMinutes: selectedDuration, // Override base length with user selection
        };
    }, [eventType, selectedDuration]);
    // Show loading state if event type is still loading; a success screen needs
    // no event type
    if (eventType === undefined && bookingStep !== "success") {
        return _jsx(CalendarSkeleton, {});
    }
    // With a host callback for its recovery a validation error is a modal dialog
    // over the flow; without one it replaces the flow, so the page stays usable.
    // When rescheduling it is an inline notice above the flow instead.
    const recoveryHandlers = isRescheduling
        ? {}
        : { onReset: handleReset, onEventTypeReset, onNavigate };
    const showFlow = !validationError ||
        isRescheduling ||
        !!getRecoveryAction(validationError, recoveryHandlers);
    return (_jsxs("div", { ref: rootRef, style: { display: "contents" }, children: [showHeader &&
                bookingStep === "event-meta" &&
                (title || description) && (_jsxs("div", { className: "text-center mb-8", children: [title && (_jsx("h1", { className: "text-4xl font-bold text-foreground mb-4", children: title })), description && (_jsx("p", { className: "text-muted-foreground", children: description }))] })), validationError && (_jsx(BookingErrorDialog, { error: validationError, ...recoveryHandlers })), showFlow && (_jsxs(_Fragment, { children: [bookingStep === "event-meta" && bookingError && (_jsxs("div", { role: "alert", className: "mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive", children: [_jsx("p", { className: "font-medium", children: bookingError.phase === "reschedule" ? "Reschedule failed" : "Booking failed" }), _jsx("p", { children: bookingError.message })] })), bookingStep === "event-meta" && isSubmitting && (_jsx("p", { role: "status", className: "mb-4 text-sm text-muted-foreground", children: "Rescheduling to the selected time..." })), bookingStep === "event-meta" && eventType && (_jsx(Calendar, { resourceId: resourceId, eventTypeId: eventType.id, onSlotSelect: handleSlotSelect, title: eventType.title, organizerName: organizerName, organizerAvatar: organizerAvatar, 
                        // Controlled state (persists across navigation)
                        selectedDate: selectedDate, onDateChange: setSelectedDate, currentMonth: currentMonth, onMonthChange: setCurrentMonth, selectedDuration: selectedDuration, onDurationChange: setSelectedDuration, timezone: timezone, onTimezoneChange: setTimezone, timeFormat: timeFormat, onTimeFormatChange: setTimeFormat, disabled: isSubmitting, rescheduleContext: rescheduleContext })), bookingStep === "booking-form" && selectedSlot && displayedEventType && (_jsx("div", { className: "bg-card rounded-xl border border-border overflow-hidden shadow-2xl", children: _jsx(BookingForm, { eventType: displayedEventType, selectedSlot: selectedSlot, selectedDuration: selectedDuration, timezone: timezone, onSubmit: handleFormSubmit, onBack: handleBack, isSubmitting: isSubmitting, currentUser: currentUser, isRescheduling: isRescheduling, submitError: bookingError?.message, 
                            // A reschedule keeps the original contact details: confirm, don't edit
                            readOnlyDetails: originalBooking
                                ? {
                                    name: originalBooking.bookerName,
                                    email: originalBooking.bookerEmail,
                                    phone: originalBooking.bookerPhone,
                                    notes: originalBooking.bookerNotes,
                                }
                                : undefined, timeFormat: timeFormat, locale: locale }) })), bookingStep === "success" && completion && (_jsx("div", { className: "bg-card rounded-xl border border-border overflow-hidden shadow-2xl", children: _jsx(BookingSuccess, { booking: completion.booking, eventType: completion.eventType, onBookAnother: handleBookAnother, isRescheduling: completion.isRescheduling, timeFormat: completion.timeFormat, locale: locale }) }))] }))] }));
}
//# sourceMappingURL=booker.js.map