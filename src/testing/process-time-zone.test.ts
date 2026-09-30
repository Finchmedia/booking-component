import { describe, expect, test } from "vitest";
import {
  PROCESS_TIME_ZONES,
  withProcessTimeZone,
  withProcessTimeZones,
} from "./process-time-zone.js";

// No Node types in this project; see process-time-zone.ts.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

// 2027-01-01T12:00Z: winter in the north, summer in Auckland.
const INSTANT = new Date(Date.UTC(2027, 0, 1, 12, 0));
const localWallClock = () =>
  `${INSTANT.getDate()} ${INSTANT.getHours()}:${String(INSTANT.getMinutes()).padStart(2, "0")}`;

describe("withProcessTimeZone", () => {
  test("local Date fields and the Intl default follow the chosen zone", async () => {
    const seen: Record<string, { wallClock: string; intl: string }> = {};
    await withProcessTimeZones(PROCESS_TIME_ZONES, (zone) => {
      seen[zone] = { wallClock: localWallClock(), intl: INSTANT.toLocaleString("en-GB") };
    });
    expect(seen).toEqual({
      UTC: { wallClock: "1 12:00", intl: "01/01/2027, 12:00:00" },
      "Europe/Berlin": { wallClock: "1 13:00", intl: "01/01/2027, 13:00:00" },
      "America/New_York": { wallClock: "1 7:00", intl: "01/01/2027, 07:00:00" },
      "Pacific/Auckland": { wallClock: "2 1:00", intl: "02/01/2027, 01:00:00" },
      "Asia/Kolkata": { wallClock: "1 17:30", intl: "01/01/2027, 17:30:00" },
    });
  });

  test("restores the previous zone, also when the callback throws", async () => {
    const outer = env.TZ;
    const outerWallClock = localWallClock();
    await expect(
      withProcessTimeZone("Pacific/Auckland", () => {
        expect(localWallClock()).toBe("2 1:00");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(env.TZ).toBe(outer);
    expect(localWallClock()).toBe(outerWallClock);
  });

  test("an unset TZ stays unset rather than becoming the string 'undefined'", async () => {
    const outer = env.TZ;
    try {
      delete env.TZ;
      await withProcessTimeZone("America/New_York", () => {
        expect(localWallClock()).toBe("1 7:00");
      });
      expect("TZ" in env).toBe(false);
    } finally {
      if (outer === undefined) delete env.TZ;
      else env.TZ = outer;
    }
  });

  test("rejects an unknown zone without touching TZ", async () => {
    const outer = env.TZ;
    let ran = false;
    await expect(
      withProcessTimeZone("Europe/Atlantis", () => {
        ran = true;
      }),
    ).rejects.toThrow(RangeError);
    expect(ran).toBe(false);
    expect(env.TZ).toBe(outer);
  });

  test("returns the callback's value", async () => {
    await expect(withProcessTimeZone("UTC", async () => INSTANT.getHours())).resolves.toBe(12);
  });
});
