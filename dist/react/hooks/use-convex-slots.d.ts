import type { TimeSlot, MonthSlots } from "../types.js";
import type { AvailabilityContextArgs } from "../contract.js";
export interface UseConvexSlotsResult {
    monthSlots: MonthSlots;
    availableSlots: TimeSlot[];
    reservedSlots: TimeSlot[];
    isLoading: boolean;
    /**
     * True when the displayed slots and their duration span more UTC dates than
     * presence is read for (3), which needs bookings of about a day or longer.
     * Holds after the third date are not shown; bookings still check inventory.
     */
    presenceIncomplete: boolean;
    /**
     * @deprecated Use fetchMonthSlotsFor(year, month). Loads the month of
     * currentDate's local year and month.
     */
    fetchMonthSlots: (currentDate: Date) => void;
    /** Load month availability for a civil month (month 1-12). */
    fetchMonthSlotsFor: (year: number, month: number) => void;
    /**
     * @deprecated Use fetchSlotsForDate("YYYY-MM-DD"). Loads the civil date of
     * this instant in the hook's timezone, which is not the day a local-midnight
     * calendar Date names when that zone is west of the browser's.
     */
    fetchSlots: (date: Date) => void;
    /** Load slots and presence for a civil date "YYYY-MM-DD". */
    fetchSlotsForDate: (date: string) => void;
}
/**
 * Loads the month availability, the free slots of the selected date and the
 * presence holds for one resource.
 *
 * @param context - The availability context for getMonthAvailability and
 * getDaySlots: the selected `eventTypeId` and, when rescheduling, the
 * `rescheduleContext` of the booking being moved. Sent only when the
 * surrounding BookingProvider has `availabilityContext` on; otherwise the
 * queries receive the 0.4.x arguments. Presence queries never receive it.
 */
export declare const useConvexSlots: (resourceId: string, eventLength: number, slotInterval?: number, allDurationOptions?: number[], enabled?: boolean, timezone?: string, context?: AvailabilityContextArgs) => UseConvexSlotsResult;
//# sourceMappingURL=use-convex-slots.d.ts.map