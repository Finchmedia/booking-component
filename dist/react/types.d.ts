export type BookingStep = "event-meta" | "booking-form" | "success";
export interface CalcomSlot {
    time: string;
    attendees?: number;
}
export interface BookingFormData {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
}
export interface Booking {
    _id: string;
    uid: string;
    resourceId: string;
    eventTypeId: string;
    start: number;
    end: number;
    timezone: string;
    status: "pending" | "confirmed" | "cancelled" | "completed" | "rescheduled";
    bookerName: string;
    bookerEmail: string;
    bookerPhone?: string;
    bookerNotes?: string;
    eventTitle: string;
    eventDescription?: string;
    location?: {
        type: string;
        value?: string;
    };
    createdAt?: number;
    updatedAt?: number;
}
export interface EventType {
    _id: string;
    id: string;
    title: string;
    slug: string;
    description?: string;
    lengthInMinutes: number;
    lengthInMinutesOptions?: number[];
    slotInterval?: number;
    locations?: Array<{
        type: string;
        address?: string;
        public?: boolean;
    }>;
    isActive?: boolean;
    timezone: string;
    lockTimeZoneToggle?: boolean;
    bufferBefore?: number;
    bufferAfter?: number;
    minNoticeMinutes?: number;
    maxFutureMinutes?: number;
    requiresConfirmation?: boolean;
    scheduleId?: string;
    organizationId?: string;
}
export interface Resource {
    _id: string;
    id: string;
    name: string;
    type: string;
    description?: string;
    timezone: string;
    isActive: boolean;
    isFungible?: boolean;
    isStandalone?: boolean;
    quantity?: number;
    organizationId?: string;
}
export interface Schedule {
    _id: string;
    id: string;
    name: string;
    timezone: string;
    isDefault: boolean;
    organizationId: string;
    weeklyHours: Array<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }>;
}
export interface TimeSlot {
    time: string;
    attendees: number;
}
export type MonthSlots = Record<string, boolean>;
export interface PresenceRecord {
    slot: string;
    user: string;
    updated: number;
}
export type BookingValidationError = {
    type: "event_type_not_found";
} | {
    type: "event_type_inactive";
} | {
    type: "resource_not_found";
} | {
    type: "resource_inactive";
} | {
    type: "resource_not_linked";
} | {
    type: "duration_invalid";
    validDurations: number[];
};
export interface BookingValidationResult {
    status: "loading" | "valid" | "error";
    error?: BookingValidationError;
}
//# sourceMappingURL=types.d.ts.map