import React from "react";
interface EventType {
    title: string;
    description?: string;
    lengthInMinutes: number;
    lengthInMinutesOptions?: number[];
    locations?: Array<{
        type: string;
        address?: string;
        public?: boolean;
    }>;
    timezone?: string;
    lockTimeZoneToggle?: boolean;
}
interface EventMetaPanelProps {
    eventType: EventType | undefined;
    selectedDuration: number;
    onDurationChange: (duration: number) => void;
    userTimezone: string;
    onTimezoneChange: (timezone: string) => void;
    timezoneLocked: boolean;
    organizerName?: string;
    organizerAvatar?: string;
    readOnly?: boolean;
}
export declare const EventMetaPanel: React.FC<EventMetaPanelProps>;
export {};
//# sourceMappingURL=event-meta-panel.d.ts.map