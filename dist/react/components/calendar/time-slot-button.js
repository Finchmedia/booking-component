"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { formatTime } from "../../utils/date-utils";
export const TimeSlotButton = ({ slot, timeFormat, timezone, onSlotSelect, isReserved = false, }) => {
    // NOTE: Presence filtering now happens at the list level in use-convex-slots
    // Slots are split into available (free) and reserved (held by other users)
    return (_jsx("button", { disabled: isReserved, onClick: () => !isReserved && onSlotSelect(slot.time), className: `w-full rounded-md border px-3 py-2 text-center text-sm font-medium transition-all
        ${isReserved
            ? "cursor-not-allowed border-border bg-card text-muted-foreground/50 opacity-60"
            : "border-border bg-muted text-foreground hover:border-foreground/50 hover:bg-accent"}
      `, children: isReserved ? "Reserved" : formatTime(slot.time, timeFormat, timezone) }));
};
//# sourceMappingURL=time-slot-button.js.map