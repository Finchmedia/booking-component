export declare const HOOK_EVENTS: readonly ["booking.created", "booking.confirmed", "booking.cancelled", "booking.completed", "presence.timeout"];
export type HookEventType = (typeof HOOK_EVENTS)[number];
export declare const listHooks: any;
export declare const getHook: any;
export declare const registerHook: any;
export declare const updateHook: any;
export declare const unregisterHook: any;
export declare const triggerHooks: any;
export declare const transitionBookingState: any;
export declare const getBookingHistory: any;
//# sourceMappingURL=hooks.d.ts.map