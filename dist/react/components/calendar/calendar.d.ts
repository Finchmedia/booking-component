interface CalendarProps {
    resourceId: string;
    eventTypeId: string;
    onSlotSelect: (data: {
        slot: string;
        duration: number;
    }) => void;
    title?: string;
    description?: string;
    showHeader?: boolean;
    organizerName?: string;
    organizerAvatar?: string;
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
    /**
     * Optional: the booking being rescheduled and its management token. With
     * BookingProvider's `availabilityContext` on, the slot queries send it as
     * `rescheduleContext` (and always `eventTypeId`), so a host that verifies
     * the token offers times overlapping the booking being moved. Ignored
     * without the opt-in; never sent to presence queries.
     */
    rescheduleContext?: {
        uid: string;
        token: string;
    };
}
export declare const Calendar: React.FC<CalendarProps>;
export {};
//# sourceMappingURL=calendar.d.ts.map