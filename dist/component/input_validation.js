// ============================================
// INPUT VALIDATION
// ============================================
//
// Structural checks at the component boundary. The availability queries used
// to accept inputs without a meaning — a zero, negative or NaN event length,
// slot indices outside the day, dates like "2027-02-30" — and answered them
// with silent nonsense (candidates on fully booked days, another day's hours).
// They now fail fast with an "Invalid …" error; calendar days are parsed with
// parseCivilDate (src/shared/time.ts). Host policy (allowed durations, notice,
// horizon) stays in the host.
/** An event length must be a finite number of minutes greater than zero. */
export function assertEventLength(eventLength) {
    if (!Number.isFinite(eventLength) || eventLength <= 0) {
        throw new Error(`Invalid eventLength ${eventLength}: expected a positive number of minutes`);
    }
}
/** Slot indices address the 96 quarter hours of a day: integers 0–95. */
export function assertSlotIndices(slots) {
    for (const slot of slots) {
        if (!Number.isInteger(slot) || slot < 0 || slot > 95) {
            throw new Error(`Invalid availableSlots index ${slot}: expected integers from 0 to 95`);
        }
    }
}
/** A date range must not end before it starts. */
export function assertDateOrder(dateFrom, dateTo) {
    // Canonical dates compare chronologically as strings.
    if (dateFrom > dateTo) {
        throw new Error(`Invalid date range: dateFrom ${dateFrom} is after dateTo ${dateTo}`);
    }
}
// Only accepted zones are remembered, so rejected strings cannot grow the set.
const acceptedTimeZones = new Set();
/** True when Intl accepts `timeZone` (IANA names such as "Europe/Berlin" or "UTC"). */
export function isValidTimeZone(timeZone) {
    if (acceptedTimeZones.has(timeZone))
        return true;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
    }
    catch {
        return false;
    }
    acceptedTimeZones.add(timeZone);
    return true;
}
/**
 * Rejects a time zone that Intl does not accept. Every schedule-aware
 * availability read that uses such a zone would throw.
 */
export function assertTimeZone(timeZone) {
    if (!isValidTimeZone(timeZone)) {
        throw new Error(`Invalid time zone "${timeZone}": expected an IANA time zone such as "Europe/Berlin"`);
    }
}
//# sourceMappingURL=input_validation.js.map