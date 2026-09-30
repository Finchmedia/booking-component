import type { BookingEmailContext } from "../../../emails.js";
export interface BookingRescheduledDetails {
    bookerName: string;
    eventTitle: string;
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
    timezone: string;
    /** From bookingEmailLinks; without links the mail asks the guest to get in touch instead. */
    links?: BookingEmailContext["links"];
}
export declare function generateBookingRescheduledHTML(details: BookingRescheduledDetails): string;
//# sourceMappingURL=rescheduled.d.ts.map