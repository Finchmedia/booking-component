// ============================================
// EMAIL MUTATIONS RE-EXPORT
// ============================================
//
// This file preserves the API path `internal.emails.*` by re-exporting
// mutations from the organized emails/ subdirectory.
//
// DO NOT add new code here - add to emails/mutations.ts instead.
// ============================================

export {
    sendBookingConfirmation,
    sendBookingPending,
    sendBookingApproved,
    sendBookingDeclined,
    sendBookingCancellation,
    sendBookingRescheduled,
} from "./emails/mutations.js";
