import type { BookingEmailContext } from "../../../emails.js";
export interface BookingPendingDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    /** From bookingEmailLinks; without links the mail asks the guest to get in touch instead. */
    links?: BookingEmailContext["links"];
}
export declare function generateBookingPendingHTML(details: BookingPendingDetails): string;
//# sourceMappingURL=pending.d.ts.map