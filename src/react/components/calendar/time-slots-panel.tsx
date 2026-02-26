"use client";

import React from "react";
import type { CalcomSlot } from "../../types";
import { TimeSlotButton } from "./time-slot-button";

interface TimeSlotsPanelProps {
  selectedDate: Date | null;
  availableSlots: CalcomSlot[];
  reservedSlots: CalcomSlot[]; // Slots held by other users
  loading: boolean;
  timeFormat: "12h" | "24h";
  onTimeFormatChange: (format: "12h" | "24h") => void;
  onSlotSelect: (slotTime: string) => void;
  timezone: string; // User's selected/locked timezone for display
}

export const TimeSlotsPanel: React.FC<TimeSlotsPanelProps> = ({
  selectedDate,
  availableSlots,
  reservedSlots,
  loading,
  timeFormat,
  onTimeFormatChange,
  onSlotSelect,
  timezone,
}) => {
  // Use passed timezone for displaying slot times (may be locked to event type TZ)
  const displayTimezone = timezone;

  // Merge available and reserved slots into single chronologically-sorted list
  const allSlots = React.useMemo(() => {
    return [
      ...availableSlots.map((slot) => ({ ...slot, isReserved: false })),
      ...reservedSlots.map((slot) => ({ ...slot, isReserved: true })),
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [availableSlots, reservedSlots]);

  // Format selected date using browser locale (e.g. "Freitag, 20. März")
  const formatSelectedDate = (date: Date | null) => {
    if (!date) return "Select a date";

    return date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  return (
    <div className="w-full border-t border-border md:w-60 lg:w-72 md:border-t-0 md:border-l">
      <div className="p-4 pb-2">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          {formatSelectedDate(selectedDate)}
        </h3>
        <div className="mb-3 flex justify-center">
          <div className="flex overflow-hidden rounded-md border border-border bg-muted">
            <button
              onClick={() => onTimeFormatChange("12h")}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                timeFormat === "12h"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              12h
            </button>
            <button
              onClick={() => onTimeFormatChange("24h")}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                timeFormat === "24h"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              24h
            </button>
          </div>
        </div>
      </div>

      {/* Time Slots */}
      <div className="relative">
        {/* Scroll container with visible scrollbar and height limit */}
        <div
          className="scrollbar-thin scrollbar-track-muted scrollbar-thumb-accent hover:scrollbar-thumb-accent/80 max-h-96 overflow-y-auto px-6 pb-4"
        >
          <div className="space-y-2">
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">
                Please select a date to see available times
              </p>
            ) : loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-9 animate-pulse rounded-md bg-accent"
                  />
                ))}
              </div>
            ) : allSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available times for this date
              </p>
            ) : (
              allSlots.map((slot) => (
                <TimeSlotButton
                  key={slot.time}
                  slot={slot}
                  timeFormat={timeFormat}
                  timezone={displayTimezone}
                  onSlotSelect={onSlotSelect}
                  isReserved={slot.isReserved}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
