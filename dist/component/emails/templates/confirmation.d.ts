import type { BookingEmailContext } from "../../../emails.js";
export interface BookingConfirmationDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    resourceId?: string;
    /** From bookingEmailLinks; without links the mail asks the guest to get in touch instead. */
    links?: BookingEmailContext["links"];
}
export declare function generateBookingConfirmationHTML(details: BookingConfirmationDetails): string;
//# sourceMappingURL=confirmation.d.ts.map