import type { QueryCtx } from "./_generated/server";
import { getRequiredSlots } from "./utils";

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
export async function isAvailable(
    ctx: QueryCtx,
    resourceId: string,
    start: number,
    end: number,
    excludeSlots?: Map<string, number[]>
): Promise<boolean> {
    const requiredSlots = getRequiredSlots(start, end);

    for (const [date, slots] of requiredSlots.entries()) {
        const availability = await ctx.db
            .query("daily_availability")
            .withIndex("by_resource_date", (q) =>
                q.eq("resourceId", resourceId).eq("date", date)
            )
            .unique();

        if (availability) {
            const excluded = excludeSlots?.get(date) ?? [];
            for (const slot of slots) {
                if (availability.busySlots.includes(slot) && !excluded.includes(slot)) {
                    return false;
                }
            }
        }
    }

    return true;
}
