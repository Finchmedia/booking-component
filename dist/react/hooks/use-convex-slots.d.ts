import type { TimeSlot, MonthSlots } from "../types";
export interface UseConvexSlotsResult {
    monthSlots: MonthSlots;
    availableSlots: TimeSlot[];
    reservedSlots: TimeSlot[];
    isLoading: boolean;
    fetchMonthSlots: (currentDate: Date) => void;
    fetchSlots: (date: Date) => void;
}
export declare const useConvexSlots: (resourceId: string, eventLength: number, slotInterval?: number, allDurationOptions?: number[], enabled?: boolean, timezone?: string) => UseConvexSlotsResult;
//# sourceMappingURL=use-convex-slots.d.ts.map