import { type CurrentUser } from "../form/booking-form";
import type { Booking } from "../../types";
export interface BookerProps {
    /** Event type ID to book */
    eventTypeId: string;
    /** Resource ID to book (e.g., "studio-a") */
    resourceId: string;
    /** Optional header title */
    title?: string;
    /** Optional header description */
    description?: string;
    /** Show/hide header section (default: true) */
    showHeader?: boolean;
    /** Organizer display name */
    organizerName?: string;
    /** Organizer avatar URL */
    organizerAvatar?: string;
    /** Current logged-in user for prefilling name/email in the form */
    currentUser?: CurrentUser;
    /** Callback when booking is successfully created */
    onBookingComplete?: (booking: Booking) => void;
    /** Callback to reset event type selection (for embedded Booker) */
    onEventTypeReset?: () => void;
    /** Callback for navigation (used when resource is deleted/deactivated) */
    onNavigate?: (path: string) => void;
    /** Callback when authentication is required (user not signed in) */
    onAuthRequired?: (slotData: {
        slot: string;
        duration: number;
        eventTypeId: string;
    }) => void;
    /**
     * Reschedule mode: Provide the original booking to modify
     * When present, the Booker will call rescheduleBookingByToken instead of createBooking
     */
    originalBooking?: Booking;
    /**
     * Skip the booking form step and reuse original booker info
     * Only applies when originalBooking is provided
     * When true: slot selection → immediate reschedule
     * When false: slot selection → form (with reschedule messaging) → reschedule
     */
    reuseBookerInfo?: boolean;
}
export declare function Booker({ eventTypeId, resourceId, title, description, showHeader, organizerName, organizerAvatar, currentUser, onBookingComplete, onEventTypeReset, onNavigate, onAuthRequired, originalBooking, reuseBookerInfo, }: BookerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=booker.d.ts.map