"use client";

import React from "react";
import type { BookingSlot } from "../../types.js";
import { formatTime } from "../../utils/date-utils.js";

interface TimeSlotButtonProps {
  slot: BookingSlot;
  timeFormat: "12h" | "24h";
  timezone: string;
  onSlotSelect: (slotTime: string) => void;
  isReserved?: boolean; // Indicates slot is held by another user's presence
  disabled?: boolean; // Selection paused, e.g. while a reschedule is being sent
}

export const TimeSlotButton: React.FC<TimeSlotButtonProps> = ({
  slot,
  timeFormat,
  timezone,
  onSlotSelect,
  isReserved = false,
  disabled = false,
}) => {
  // NOTE: Presence filtering now happens at the list level in use-convex-slots
  // Slots are split into available (free) and reserved (held by other users)
  const time = formatTime(slot.time, timeFormat, timezone);

  return (
    <button
      disabled={isReserved || disabled}
      // A reserved slot still names its time for assistive technology
      aria-label={isReserved ? `${time}, reserved` : undefined}
      onClick={() => !isReserved && !disabled && onSlotSelect(slot.time)}
      className={`w-full rounded-md border px-3 py-2 text-center text-sm font-medium transition-all
        ${
          isReserved
            ? "cursor-not-allowed border-border bg-card text-muted-foreground/50 opacity-60"
            : "border-border bg-muted text-foreground hover:border-foreground/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        }
      `}
    >
      {isReserved ? "Reserved" : time}
    </button>
  );
};
