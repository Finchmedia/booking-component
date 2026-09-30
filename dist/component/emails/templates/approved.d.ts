import type { BookingEmailContext } from "../../../emails.js";
export interface BookingApprovedDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    /** From bookingEmailLinks; without links the mail asks the guest to get in touch instead. */
    links?: BookingEmailContext["links"];
}
export declare function generateBookingApprovedHTML(details: BookingApprovedDetails): string;
//# sourceMappingURL=approved.d.ts.map