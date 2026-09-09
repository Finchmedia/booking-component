import React from "react";
import type { BookingSlot } from "../../types";
interface TimeSlotsPanelProps {
    selectedDate: Date | null;
    availableSlots: BookingSlot[];
    reservedSlots: BookingSlot[];
    loading: boolean;
    timeFormat: "12h" | "24h";
    onTimeFormatChange: (format: "12h" | "24h") => void;
    onSlotSelect: (slotTime: string) => void;
    timezone: string;
}
export declare const TimeSlotsPanel: React.FC<TimeSlotsPanelProps>;
export {};
//# sourceMappingURL=time-slots-panel.d.ts.map