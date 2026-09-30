/**
 * Test-only helpers for running code under a chosen process time zone.
 * `src/testing/` is excluded from the build and from the npm package.
 *
 * Node re-reads `process.env.TZ` on assignment, so local `Date` fields and the
 * `Intl` default zone follow immediately; this works in the edge-runtime and
 * happy-dom test environments alike. Time-sensitive tests use these helpers so
 * that they cannot depend on the zone of the machine that runs them.
 */

// The project compiles without Node types (the component runs on Convex), so
// reach `process.env` through a narrow local type instead of a global one.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

/** East and west of UTC, across the date line, and a half-hour offset. */
export const PROCESS_TIME_ZONES = [
  "UTC",
  "Europe/Berlin",
  "America/New_York",
  "Pacific/Auckland",
  "Asia/Kolkata",
] as const;

/**
 * Runs `fn` with the process time zone set to `timeZone` and restores the
 * previous zone afterwards, also when `fn` throws. An unknown zone is rejected
 * up front, because Node would otherwise fall back to UTC silently.
 */
export async function withProcessTimeZone<T>(
  timeZone: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  new Intl.DateTimeFormat("en-US", { timeZone }); // RangeError for unknown zones
  const previous = env.TZ;
  env.TZ = timeZone;
  try {
    return await fn();
  } finally {
    // Assigning undefined would store the string "undefined".
    if (previous === undefined) delete env.TZ;
    else env.TZ = previous;
  }
}

/** Runs `fn` once per zone, one zone after the other. */
export async function withProcessTimeZones(
  zones: readonly string[],
  fn: (timeZone: string) => unknown,
): Promise<void> {
  for (const zone of zones) {
    await withProcessTimeZone(zone, () => fn(zone));
  }
}
