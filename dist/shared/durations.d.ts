/** The event type fields that decide its durations and slot grid. */
export type EventTypeDurations = {
    lengthInMinutes: number;
    lengthInMinutesOptions?: readonly number[];
    slotInterval?: number;
};
/**
 * The durations (minutes) the Booker offers and accepts for an event type:
 * `lengthInMinutesOptions` when it has any, otherwise `[lengthInMinutes]`.
 */
export declare function allowedDurations(eventType: EventTypeDurations): readonly number[];
/**
 * The slot grid (minutes between offered starts) the Calendar requests for an
 * event type, whatever duration is selected: `slotInterval` when set,
 * otherwise the shortest of `lengthInMinutes` and `lengthInMinutesOptions`.
 * `lengthInMinutes` counts even when it is not one of the options.
 *
 * A host function that recomputes the offered starts, for example to check a
 * requested start, should use the same grid so it accepts every start the
 * Calendar shows.
 */
export declare function effectiveSlotInterval(eventType: EventTypeDurations): number;
//# sourceMappingURL=durations.d.ts.map