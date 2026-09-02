import type { QueryCtx } from "./_generated/server";
/**
 * Checks whether [start, end) is free on a resource's daily_availability bitmap.
 *
 * @param excludeSlots - Optional slots (dateStr → slot indices, as returned by
 *   getRequiredSlots) that should be treated as free even though they are
 *   marked busy. Used by the reschedule flow: a booking's own slots are still
 *   busy while its new time is validated, so without the exclusion a move to
 *   an overlapping range (e.g. 09:00 → 09:30 with a 60-minute event) would be
 *   wrongly rejected. Only pass the slots of the booking being moved.
 */
export declare function isAvailable(ctx: QueryCtx, resourceId: string, start: number, end: number, excludeSlots?: Map<string, number[]>): Promise<boolean>;
//# sourceMappingURL=availability.d.ts.map