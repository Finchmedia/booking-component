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
}
export declare const Calendar: React.FC<CalendarProps>;
export {};
//# sourceMappingURL=calendar.d.ts.map