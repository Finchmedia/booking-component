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
/**
 * Current user information for prefilling the form
 * This data typically comes from the authentication provider
 */
export interface CurrentUser {
    /** User's display name */
    name?: string;
    /** User's email address */
    email?: string;
    /** User's avatar URL */
    avatarUrl?: string;
}
interface BookingFormProps {
    eventType: EventType;
    selectedSlot: string;
    selectedDuration: number;
    timezone: string;
    onSubmit: (data: BookingFormData) => Promise<void>;
    onBack: () => void;
    isSubmitting: boolean;
    /** Optional: Current logged-in user for prefilling name/email */
    currentUser?: CurrentUser;
}
export declare const BookingForm: React.FC<BookingFormProps>;
export {};
//# sourceMappingURL=booking-form.d.ts.map