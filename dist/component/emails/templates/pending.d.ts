export interface BookingPendingDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    bookingUid?: string;
    managementToken?: string;
    baseUrl?: string;
}
export declare function generateBookingPendingHTML(details: BookingPendingDetails): string;
//# sourceMappingURL=pending.d.ts.map