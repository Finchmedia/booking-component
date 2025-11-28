import React from "react";
import type { BookingFormData } from "../../types";
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
interface BookingFormProps {
    eventType: EventType;
    selectedSlot: string;
    selectedDuration: number;
    timezone: string;
    onSubmit: (data: BookingFormData) => Promise<void>;
    onBack: () => void;
    isSubmitting: boolean;
}
export declare const BookingForm: React.FC<BookingFormProps>;
export {};
//# sourceMappingURL=booking-form.d.ts.map