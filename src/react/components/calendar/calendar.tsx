"use client";

import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { CalendarGrid } from "./calendar-grid.js";
import { TimeSlotsPanel } from "./time-slots-panel.js";
import { EventMetaPanel } from "./event-meta-panel.js";
import { CalendarSkeleton } from "./calendar-skeleton.js";
import { BookingErrorDialog } from "../booker/booking-error-dialog.js";
import { useBookingAPI } from "../../context.js";
import { useConvexSlots } from "../../hooks/use-convex-slots.js";
import { eventDeletedError } from "../../hooks/use-booking-validation.js";
import { useIntersectionObserver } from "../../hooks/use-intersection-observer.js";
import { fromLocalFields, toLocalMidnight, todayIn } from "../../utils/civil-date.js";
import { effectiveSlotInterval } from "../../utils/durations.js";

interface CalendarProps {
  resourceId: string;
  eventTypeId: string; // Event type ID (contains duration, timezone, etc.)
  onSlotSelect: (data: { slot: string; duration: number }) => void; // Pass both slot AND duration
  title?: string;
  description?: string;
  showHeader?: boolean;
  organizerName?: string; // Organizer name to display
  organizerAvatar?: string; // Organizer avatar URL

  // Controlled state props (lifted to parent). Days are carriers: a Date's
  // local calendar fields name the day, as in the Dates this calendar emits.
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  selectedDuration: number;
  onDurationChange: (duration: number) => void;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  timeFormat: "12h" | "24h";
  onTimeFormatChange: (format: "12h" | "24h") => void;
  /** Optional: disables slot selection, e.g. while a reschedule is being sent */
  disabled?: boolean;
}

export const Calendar: React.FC<CalendarProps> = (props) => {
  const api = useBookingAPI();

  // Fetch event type configuration
  const eventType = useQuery(api.getEventType, { eventTypeId: props.eventTypeId });

  // Show loading state if event type is still loading
  if (eventType === undefined) {
    return <CalendarSkeleton />;
  }

  // A missing event type (the host's getEventType resolved null) cannot be
  // booked: show the "deleted" notice instead of its calendar
  if (eventType === null) {
    return <BookingErrorDialog error={eventDeletedError(props.resourceId)} />;
  }

  return <CalendarContent {...props} eventType={eventType} />;
};

// Inner component: all hooks called unconditionally (no early return before hooks)
const CalendarContent: React.FC<
  CalendarProps & { eventType: NonNullable<ReturnType<typeof useQuery>> }
> = ({
  resourceId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- F13: slot queries do not send the event type yet (0.5.0)
  eventTypeId: _eventTypeId,
  onSlotSelect,
  title,
  description,
  showHeader,
  organizerName,
  organizerAvatar,
  // Controlled state
  selectedDate,
  onDateChange,
  currentMonth,
  onMonthChange,
  selectedDuration,
  onDurationChange,
  timezone,
  onTimezoneChange,
  timeFormat,
  onTimeFormatChange,
  disabled,
  // Loaded data
  eventType,
}) => {
  const isTimezoneLocked = eventType?.lockTimeZoneToggle || false;

  // Use controlled duration from props
  const eventLength = selectedDuration;

  // One slot grid for every selected duration (the event's slotInterval or its
  // shortest duration); hosts checking starts use the same helper
  const slotInterval = effectiveSlotInterval(eventType);

  // Intersection observer to detect when calendar becomes visible
  const [calendarRef, , hasIntersected] =
    useIntersectionObserver({
      rootMargin: "500px",
      triggerOnce: true,
    });

  // Use Convex hook for slots data - only enabled when visible
  const {
    monthSlots,
    availableSlots,
    reservedSlots,
    isLoading,
    fetchMonthSlotsFor,
    fetchSlotsForDate,
  } = useConvexSlots(
    resourceId,
    eventLength,
    slotInterval,
    undefined, // allDurationOptions: only used without a slotInterval
    hasIntersected,
    timezone // Days are civil dates; only the deprecated fetchSlots reads the zone
  );

  // Handle date selection: the clicked cell's label is the day queried
  const handleDateSelect = (date: Date) => {
    onDateChange(date);
    fetchSlotsForDate(fromLocalFields(date));
  };

  // Navigation
  const goToPreviousMonth = () => {
    onMonthChange(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const goToNextMonth = () => {
    onMonthChange(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const monthYear = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();

  // Fetch month slots when calendar becomes visible or month changes.
  useEffect(() => {
    if (hasIntersected) {
      fetchMonthSlotsFor(monthYear, monthIndex + 1);
    }
  }, [hasIntersected, monthYear, monthIndex, fetchMonthSlotsFor]);

  // Auto-select today (in the display zone) when month slots are loaded
  useEffect(() => {
    if (!selectedDate && Object.keys(monthSlots).length > 0) {
      onDateChange(toLocalMidnight(todayIn(timezone)));
    }
  }, [monthSlots, selectedDate, onDateChange, timezone]);

  // Fetch slots for selected date when it changes (including on mount with persisted date)
  useEffect(() => {
    if (selectedDate) {
      fetchSlotsForDate(fromLocalFields(selectedDate));
    }
  }, [selectedDate, fetchSlotsForDate]);

  return (
    <div
      ref={calendarRef}
      className="bg-card overflow-hidden rounded-xl border border-border shadow"
    >
      {/* Optional Header */}
      {showHeader && (
        <div className="border-b border-border p-6 text-center">
          <h1 className="mb-2 text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      )}

      {/* 3-Column Layout: Event Meta | Calendar | Time Slots */}
      <div className="flex flex-col md:flex-row">
        {/* Event Meta Panel */}
        <EventMetaPanel
          eventType={eventType}
          selectedDuration={selectedDuration}
          onDurationChange={onDurationChange}
          userTimezone={timezone}
          onTimezoneChange={onTimezoneChange}
          timezoneLocked={isTimezoneLocked}
          organizerName={organizerName}
          organizerAvatar={organizerAvatar}
        />

        {/* Calendar Grid */}
        <CalendarGrid
          currentDate={currentMonth}
          selectedDate={selectedDate}
          monthSlots={monthSlots}
          onDateSelect={handleDateSelect}
          onPreviousMonth={goToPreviousMonth}
          onNextMonth={goToNextMonth}
          timezone={timezone}
        />

        {/* Time Slots Panel */}
        <TimeSlotsPanel
          selectedDate={selectedDate}
          availableSlots={availableSlots}
          reservedSlots={reservedSlots}
          loading={isLoading}
          timeFormat={timeFormat}
          onTimeFormatChange={onTimeFormatChange}
          onSlotSelect={(slot) =>
            onSlotSelect({ slot, duration: selectedDuration })
          }
          timezone={timezone}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
