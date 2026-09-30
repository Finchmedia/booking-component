import React from "react";
import type { BookingSlot } from "../../types.js";
interface TimeSlotsPanelProps {
    selectedDate: Date | null;
    availableSlots: BookingSlot[];
    reservedSlots: BookingSlot[];
    loading: boolean;
    timeFormat: "12h" | "24h";
    onTimeFormatChange: (format: "12h" | "24h") => void;
    onSlotSelect: (slotTime: string) => void;
    timezone: string;
    disabled?: boolean;
}
export declare const TimeSlotsPanel: React.FC<TimeSlotsPanelProps>;
export {};
//# sourceMappingURL=time-slots-panel.d.ts.map