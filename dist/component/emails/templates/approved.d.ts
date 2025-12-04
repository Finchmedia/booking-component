export interface BookingApprovedDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    bookingUid?: string;
    managementToken?: string;
    baseUrl?: string;
}
export declare function generateBookingApprovedHTML(details: BookingApprovedDetails): string;
//# sourceMappingURL=approved.d.ts.map