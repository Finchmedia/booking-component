import React from "react";
import type { CalcomSlot } from "../../types";
interface TimeSlotsPanelProps {
    selectedDate: Date | null;
    availableSlots: CalcomSlot[];
    reservedSlots: CalcomSlot[];
    loading: boolean;
    isReloading: boolean;
    timeFormat: "12h" | "24h";
    onTimeFormatChange: (format: "12h" | "24h") => void;
    onSlotSelect: (slotTime: string) => void;
}
export declare const TimeSlotsPanel: React.FC<TimeSlotsPanelProps>;
export {};
//# sourceMappingURL=time-slots-panel.d.ts.map