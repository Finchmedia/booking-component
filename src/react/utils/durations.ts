import type { EventType } from "../types.js";

/** The event type fields that decide its durations and slot grid. */
export type EventTypeDurations = Pick<
  EventType,
  "lengthInMinutes" | "lengthInMinutesOptions" | "slotInterval"
>;

/**
 * The durations (minutes) the Booker offers and accepts for an event type:
 * `lengthInMinutesOptions` when it has any, otherwise `[lengthInMinutes]`.
 */
export function allowedDurations(eventType: EventTypeDurations): readonly number[] {
  return eventType.lengthInMinutesOptions?.length
    ? eventType.lengthInMinutesOptions
    : [eventType.lengthInMinutes];
}

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
export function effectiveSlotInterval(eventType: EventTypeDurations): number {
  return (
    eventType.slotInterval ??
    Math.min(eventType.lengthInMinutes, ...(eventType.lengthInMinutesOptions ?? []))
  );
}
