export interface BookingConfirmationDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    resourceId?: string;
    bookingUid?: string;
    managementToken?: string;
    baseUrl?: string;
}
export declare function generateBookingConfirmationHTML(details: BookingConfirmationDetails): string;
//# sourceMappingURL=confirmation.d.ts.map