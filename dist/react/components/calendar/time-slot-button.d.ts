import React from "react";
import type { CalcomSlot } from "../../types";
interface TimeSlotButtonProps {
    slot: CalcomSlot;
    timeFormat: "12h" | "24h";
    timezone: string;
    onSlotSelect: (slotTime: string) => void;
    isReserved?: boolean;
}
export declare const TimeSlotButton: React.FC<TimeSlotButtonProps>;
export {};
//# sourceMappingURL=time-slot-button.d.ts.map