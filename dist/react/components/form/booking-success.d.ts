import React from "react";
import type { Booking } from "../../types";
interface EventType {
    title: string;
    description?: string;
    lengthInMinutes: number;
}
interface BookingSuccessProps {
    booking: Booking;
    eventType: EventType;
    onBookAnother: () => void;
    /** Optional: Show reschedule-specific messaging */
    isRescheduling?: boolean;
}
export declare const BookingSuccess: React.FC<BookingSuccessProps>;
export {};
//# sourceMappingURL=booking-success.d.ts.map