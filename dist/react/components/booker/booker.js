"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useBookingAPI } from "../../context";
import { useSlotHold } from "../../hooks/use-slot-hold";
import { useBookingValidation } from "../../hooks/use-booking-validation";
import { Calendar, CalendarSkeleton } from "../calendar";
import { BookingForm } from "../form/booking-form";
import { BookingSuccess } from "../form/booking-success";
import { BookingErrorDialog } from "./booking-error-dialog";
export function Booker({ eventTypeId, resourceId, title, description, showHeader = true, organizerName, organizerAvatar, onBookingComplete, onEventTypeReset, onNavigate, onAuthRequired, }) {
    const api = useBookingAPI();
    // Step state
    const [bookingStep, setBookingStep] = useState("event-meta");
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [completedBooking, setCompletedBooking] = useState(null);
    // Calendar state (persists across navigation)
    const [selectedDate, setSelectedDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDuration, setSelectedDuration] = useState(60);
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [timeFormat, setTimeFormat] = useState("24h");
    // Mutations
    const createBooking = useMutation(api.createBooking);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Fetch event type, resource, and link state from DB
    const eventType = useQuery(api.getEventType, { eventTypeId });
    const resource = useQuery(api.getResource, { id: resourceId });
    const hasLink = useQuery(api.hasResourceEventTypeLink, {
        resourceId,
        eventTypeId,
    });
    // Calculate effective slot interval (smart defaulting - same logic as useConvexSlots)
    const slotInterval = eventType?.slotInterval ??
        (eventType?.lengthInMinutesOptions &&
            eventType.lengthInMinutesOptions.length > 0
            ? Math.min(...eventType.lengthInMinutesOptions, eventType.lengthInMinutes)
            : eventType?.lengthInMinutes);
    // Real-time Hold: Automatically reserve all affected slots (quantum coverage)
    useSlotHold(resourceId, selectedSlot, selectedDuration, eventTypeId);
    // Reactive validation: Monitor event type, resource, and link state
    const validation = useBookingValidation(eventType, resource, hasLink, selectedDuration, resourceId);
    // Step 1: Calendar slot selection (captures BOTH slot AND duration atomically)
    const handleSlotSelect = (data) => {
        setSelectedSlot(data.slot);
        setSelectedDuration(data.duration); // LOCK the duration at slot selection
        setBookingStep("booking-form");
    };
    // Step 2: Form submission
    const handleFormSubmit = async (formData) => {
        if (!selectedSlot || !eventType)
            return;
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
            const completedBookingData = booking;
            setCompletedBooking(completedBookingData);
            setBookingStep("success");
            // Trigger callback if provided
            onBookingComplete?.(completedBookingData);
        }
        catch (error) {
            console.error("Booking failed:", error);
            // Check for authentication error
            if (error instanceof ConvexError &&
                error.data?.code === "UNAUTHENTICATED") {
                if (onAuthRequired && selectedSlot) {
                    onAuthRequired({
                        slot: selectedSlot,
                        duration: selectedDuration,
                        eventTypeId,
                    });
                    return;
                }
            }
            alert("Booking failed. Please try again.");
        }
        finally {
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
        }
        else if (eventType) {
            setSelectedDuration(eventType.lengthInMinutes);
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
    // Show loading state if event type is still loading
    if (eventType === undefined) {
        return _jsx(CalendarSkeleton, {});
    }
    return (_jsxs(_Fragment, { children: [validation.status === "error" && validation.error && (_jsx(BookingErrorDialog, { error: validation.error, onReset: handleReset, onEventTypeReset: onEventTypeReset, onNavigate: onNavigate })), showHeader &&
                bookingStep === "event-meta" &&
                (title || description) && (_jsxs("div", { className: "text-center mb-8", children: [title && (_jsx("h1", { className: "text-4xl font-bold text-foreground mb-4", children: title })), description && (_jsx("p", { className: "text-muted-foreground", children: description }))] })), bookingStep === "event-meta" && eventType && (_jsx(Calendar, { resourceId: resourceId, eventTypeId: eventType.id, onSlotSelect: handleSlotSelect, title: eventType.title, organizerName: organizerName, organizerAvatar: organizerAvatar, 
                // Controlled state (persists across navigation)
                selectedDate: selectedDate, onDateChange: setSelectedDate, currentMonth: currentMonth, onMonthChange: setCurrentMonth, selectedDuration: selectedDuration, onDurationChange: setSelectedDuration, timezone: timezone, onTimezoneChange: setTimezone, timeFormat: timeFormat, onTimeFormatChange: setTimeFormat })), bookingStep === "booking-form" && selectedSlot && displayedEventType && (_jsx("div", { className: "bg-card rounded-xl border border-border overflow-hidden shadow-2xl", children: _jsx(BookingForm, { eventType: displayedEventType, selectedSlot: selectedSlot, selectedDuration: selectedDuration, timezone: timezone, onSubmit: handleFormSubmit, onBack: handleBack, isSubmitting: isSubmitting }) })), bookingStep === "success" && completedBooking && displayedEventType && (_jsx("div", { className: "bg-card rounded-xl border border-border overflow-hidden shadow-2xl", children: _jsx(BookingSuccess, { booking: completedBooking, eventType: displayedEventType, onBookAnother: handleBookAnother }) }))] }));
}
//# sourceMappingURL=booker.js.map