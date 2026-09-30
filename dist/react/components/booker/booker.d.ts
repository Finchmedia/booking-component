import { type CurrentUser } from "../form/booking-form.js";
import type { Booking } from "../../types.js";
import type { BookingView } from "../../contract.js";
type BookingPhase = "create" | "reschedule";
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
    /**
     * Callback when a booking is created or moved. Receives the result of your
     * createBooking or rescheduleBookingByToken function, typed as the fields
     * the contract requires (`BookingView`). An error it throws is logged; the
     * booking is not reported as failed.
     */
    onBookingComplete?: (booking: BookingView) => void;
    /**
     * Callback to reset event type selection (for embedded Booker). Used when the
     * event type is deleted or deactivated or the resource is unlinked.
     */
    onEventTypeReset?: () => void;
    /**
     * Callback for navigation (used when resource is deleted/deactivated).
     * `path` is the deprecated recoveryPath (a demo route); navigate to your own
     * resource page. Without the matching callback the Booker shows the error
     * inline instead of a blocking dialog.
     */
    onNavigate?: (path: string) => void;
    /**
     * Callback when authentication is required for a new booking (user not signed in).
     * Without it, the Booker shows a sign-in message.
     */
    onAuthRequired?: (slotData: {
        slot: string;
        duration: number;
        eventTypeId: string;
    }) => void;
    /**
     * Called when a booking or reschedule attempt fails, in addition to the error
     * message the Booker shows. Use it for telemetry or host notifications.
     * Not called when an authentication error is handed to onAuthRequired.
     */
    onBookingError?: (error: unknown, context: {
        phase: BookingPhase;
    }) => void;
    /**
     * Reschedule mode: Provide the original booking to modify
     * When present, the Booker will call rescheduleBookingByToken instead of createBooking
     * With BookingProvider's `availabilityContext` on, its `uid` and
     * `managementToken` also go to getDaySlots and getMonthAvailability as
     * `rescheduleContext`, so times overlapping it can be offered.
     */
    originalBooking?: Booking;
    /**
     * Skip the confirmation step and reuse original booker info
     * Only applies when originalBooking is provided
     * When true: slot selection → immediate reschedule
     * When false: slot selection → read-only confirmation → reschedule
     * A reschedule always keeps the original contact details.
     */
    reuseBookerInfo?: boolean;
}
/**
 * A new event type, resource or original booking starts a fresh flow: the keyed
 * inner component resets step, slot, duration and calendar state, and releases
 * any held slot. The key is a JSON array, so no id can collide with another
 * pair ("a", "b|c" vs "a|b", "c").
 *
 * Completed submissions are held here, outside the keyed flow, so a submission
 * still pending when the flow is replaced is not lost: when it succeeds and no
 * newer submission was sent meanwhile, the flow mounted by then shows the
 * success screen for the booking that was made, with its own event type and
 * time format. onBookingComplete is called once for every booking made, shown
 * or not. A failure after the replacement is only logged and passed to
 * onBookingError, because nothing was booked and the user has moved on.
 */
export declare function Booker(props: BookerProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=booker.d.ts.map