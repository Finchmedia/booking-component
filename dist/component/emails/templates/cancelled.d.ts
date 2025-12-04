export interface BookingCancellationDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    reason?: string;
    bookingUid?: string;
    managementToken?: string;
}
export declare function generateBookingCancellationHTML(details: BookingCancellationDetails): string;
//# sourceMappingURL=cancelled.d.ts.map