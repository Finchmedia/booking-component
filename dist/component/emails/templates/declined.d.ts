export interface BookingDeclinedDetails {
    bookerName: string;
    eventTitle: string;
    start: number;
    end: number;
    timezone: string;
    reason?: string;
}
export declare function generateBookingDeclinedHTML(details: BookingDeclinedDetails): string;
//# sourceMappingURL=declined.d.ts.map