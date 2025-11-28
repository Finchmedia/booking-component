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
    /** Callback when booking is successfully created */
    onBookingComplete?: (booking: Booking) => void;
    /** Callback to reset event type selection (for embedded Booker) */
    onEventTypeReset?: () => void;
    /** Callback for navigation (used when resource is deleted/deactivated) */
    onNavigate?: (path: string) => void;
}
export declare function Booker({ eventTypeId, resourceId, title, description, showHeader, organizerName, organizerAvatar, onBookingComplete, onEventTypeReset, onNavigate, }: BookerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=booker.d.ts.map