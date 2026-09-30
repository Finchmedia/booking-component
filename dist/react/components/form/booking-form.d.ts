import React from "react";
import type { BookingFormData } from "../../types.js";
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
    /** Optional: Show reschedule-specific messaging */
    isRescheduling?: boolean;
    /** Optional: Submission failure, shown as an alert that describes the submit button */
    submitError?: string;
    /**
     * Optional: Contact details to confirm read-only instead of editable fields.
     * The Booker passes the original booking's details when rescheduling, because
     * a reschedule keeps them. Submitting sends these details without validation.
     */
    readOnlyDetails?: BookingFormData;
    /** Optional: 12h/24h format of the selected time (default: "12h") */
    timeFormat?: "12h" | "24h";
    /** Optional: BCP 47 locale for the selected date and time (default: "en-US") */
    locale?: string;
}
export declare const BookingForm: React.FC<BookingFormProps>;
export {};
//# sourceMappingURL=booking-form.d.ts.map