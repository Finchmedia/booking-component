export interface BookingRescheduledDetails {
    bookerName: string;
    eventTitle: string;
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
    timezone: string;
    bookingUid?: string;
    managementToken?: string;
    baseUrl?: string;
}
export declare function generateBookingRescheduledHTML(details: BookingRescheduledDetails): string;
//# sourceMappingURL=rescheduled.d.ts.map