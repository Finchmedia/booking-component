import React from "react";
import type { Booking } from "../../types.js";
interface EventType {
    title: string;
    description?: string;
    lengthInMinutes: number;
}
interface BookingSuccessProps {
    booking: Booking;
    eventType: EventType;
    onBookAnother: () => void;
    /**
     * Optional: Show reschedule-specific messaging. A reschedule is terminal:
     * the original booking was replaced, so no 'Book Another' action is offered.
     */
    isRescheduling?: boolean;
    /** Optional: 12h/24h time format (default: the locale's convention) */
    timeFormat?: "12h" | "24h";
    /** Optional: BCP 47 locale for the date and time (default: "en-US") */
    locale?: string;
}
export declare const BookingSuccess: React.FC<BookingSuccessProps>;
export {};
//# sourceMappingURL=booking-success.d.ts.map