// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useConvexSlots } from "./use-convex-slots";
import { useSlotPresence } from "./use-slot-presence";

// Vitest runs in Node, but the package's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Presence rows emulate the component's getDatePresence: holds whose ISO slot
// starts with the requested UTC date (presence.ts prefix range).

type Hold = { slot: string; user: string };

const mocks = vi.hoisted(() => ({
  query: vi.fn((_reference: string, _args: unknown): unknown => undefined),
  api: {
    getMonthAvailability: "month",
    getDaySlots: "day",
    getDatePresence: "presence",
    getPresence: "slot-presence",
  },
}));

vi.mock("../context", () => ({ useBookingAPI: () => mocks.api, useAvailabilityContextEnabled: () => false }));
vi.mock("convex-helpers/react/cache/hooks", () => ({ useQuery: mocks.query }));

// The hook compares instants only; each case still runs in several process zones.
const PROCESS_ZONES = ["UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland"];
const ORIGINAL_TZ = process.env.TZ;
const ME = "me";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
  mocks.query.mockReset();
  sessionStorage.setItem("convex-booking-session-id", ME);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function serve(daySlots: string[], holds: Hold[]) {
  mocks.query.mockImplementation((reference, args) => {
    if (args === "skip") return undefined;
    if (reference === "day") return daySlots.map((time) => ({ time }));
    if (reference === "presence") {
      const { date } = args as { date: string };
      return holds
        .filter((hold) => hold.slot >= date && hold.slot < date + "\u{FFFF}")
        .map((hold) => ({ ...hold, updated: Date.now() }));
    }
    return {};
  });
}

function run(opts: { date: string; timezone: string; eventLength: number; daySlots: string[]; holds: Hold[] }) {
  serve(opts.daySlots, opts.holds);
  const view = renderHook(() => useConvexSlots("r", opts.eventLength, 15, [], true, opts.timezone));
  act(() => view.result.current.fetchSlotsForDate(opts.date));
  const presenceDates = mocks.query.mock.calls
    .filter(([reference, args]) => reference === "presence" && args !== "skip")
    .map(([, args]) => (args as { date: string }).date);
  return {
    available: view.result.current.availableSlots.map((slot) => slot.time),
    reserved: view.result.current.reservedSlots.map((slot) => slot.time),
    presenceDates: [...new Set(presenceDates)],
    presenceIncomplete: view.result.current.presenceIncomplete,
    view,
  };
}

describe.each(PROCESS_ZONES)("presence overlap by instants (F17) in process TZ %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it("CONTROL: the process zone is in effect", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  describe("UTC day, a slot crossing midnight", () => {
    const base = { date: "2026-09-22", timezone: "UTC", eventLength: 30, daySlots: ["2026-09-22T23:45:00.000Z"] };

    it("a next-day 00:00 hold overlapping 23:45-00:15 marks it Reserved", () => {
      const r = run({ ...base, holds: [{ slot: "2026-09-23T00:00:00.000Z", user: "other" }] });
      expect(r.presenceDates).toEqual(["2026-09-22", "2026-09-23"]);
      expect(r.reserved).toEqual(["2026-09-22T23:45:00.000Z"]);
      expect(r.available).toEqual([]);
    });

    it("CONTROL: a same-day 00:00 hold does not overlap it", () => {
      const r = run({ ...base, holds: [{ slot: "2026-09-22T00:00:00.000Z", user: "other" }] });
      expect(r.reserved).toEqual([]);
      expect(r.available).toEqual(["2026-09-22T23:45:00.000Z"]);
    });

    it("a fetched hold on the neighbouring UTC date never matches by time of day", () => {
      const r = run({
        ...base,
        daySlots: ["2026-09-22T10:00:00.000Z", "2026-09-22T23:45:00.000Z"],
        holds: [{ slot: "2026-09-23T10:00:00.000Z", user: "other" }],
      });
      expect(r.presenceDates).toContain("2026-09-23"); // the hold is fetched
      expect(r.reserved).toEqual([]);
    });
  });

  describe("Auckland day 2027-03-09: 09:00 and 10:00 NZDT are on 8 March UTC", () => {
    const base = {
      date: "2027-03-09", timezone: "Pacific/Auckland", eventLength: 60,
      daySlots: ["2027-03-08T20:00:00.000Z", "2027-03-08T21:00:00.000Z"],
    };

    it("presence is read for the UTC date the candidates are on", () => {
      expect(run({ ...base, holds: [] }).presenceDates).toEqual(["2027-03-08"]);
    });

    it("another session's hold at this day's 10:00 NZDT marks that slot Reserved", () => {
      const r = run({ ...base, holds: [{ slot: "2027-03-08T21:00:00.000Z", user: "other" }] });
      expect(r.reserved).toEqual(["2027-03-08T21:00:00.000Z"]);
      expect(r.available).toEqual(["2027-03-08T20:00:00.000Z"]);
    });

    it("a hold at the next day's 09:00 NZDT leaves this day's 09:00 free", () => {
      const r = run({ ...base, holds: [{ slot: "2027-03-09T20:00:00.000Z", user: "other" }] });
      expect(r.reserved).toEqual([]);
      expect(r.available).toEqual(base.daySlots);
    });

    it("CONTROLS: the viewer's own overlapping hold is ignored; the same hold by another session is not", () => {
      const own = run({ ...base, holds: [{ slot: "2027-03-08T20:15:00.000Z", user: ME }] });
      expect(own.reserved).toEqual([]);
      cleanup();
      const other = run({ ...base, holds: [{ slot: "2027-03-08T20:15:00.000Z", user: "other" }] });
      expect(other.reserved).toEqual(["2027-03-08T20:00:00.000Z"]);
    });
  });

  describe("Berlin window 00:00-02:00 local on 2027-03-09", () => {
    const base = {
      date: "2027-03-09", timezone: "Europe/Berlin", eventLength: 30,
      daySlots: ["2027-03-08T23:00:00.000Z", "2027-03-08T23:30:00.000Z", "2027-03-09T00:00:00.000Z", "2027-03-09T00:30:00.000Z"],
    };

    it("a hold at local 00:30 (previous UTC date) is detected", () => {
      const r = run({ ...base, holds: [{ slot: "2027-03-08T23:30:00.000Z", user: "other" }] });
      expect(r.presenceDates).toEqual(["2027-03-08", "2027-03-09"]);
      expect(r.reserved).toEqual(["2027-03-08T23:30:00.000Z"]);
    });

    it("a hold at the next night's 00:30 is fetched but reserves nothing", () => {
      const r = run({ ...base, holds: [{ slot: "2027-03-09T23:30:00.000Z", user: "other" }] });
      expect(r.reserved).toEqual([]);
      expect(r.available).toEqual(base.daySlots);
    });
  });

  it("Los Angeles evening: a hold on the next UTC date is detected", () => {
    // 2027-06-09 09:00-19:00 PDT; from 17:00 PDT the starts are on 10 June UTC
    const daySlots = ["2027-06-09T16:00:00.000Z", "2027-06-10T00:00:00.000Z", "2027-06-10T01:00:00.000Z"];
    const r = run({ date: "2027-06-09", timezone: "America/Los_Angeles", eventLength: 60, daySlots, holds: [{ slot: "2027-06-10T01:30:00.000Z", user: "other" }] });
    expect(r.presenceDates).toEqual(["2027-06-09", "2027-06-10"]);
    expect(r.reserved).toEqual(["2027-06-10T01:00:00.000Z"]);
  });

  it("a hold that ends when a slot starts, or starts when it ends, does not overlap", () => {
    const daySlots = ["2026-09-22T10:00:00.000Z"];
    const edges = run({
      date: "2026-09-22", timezone: "UTC", eventLength: 60, daySlots,
      holds: [{ slot: "2026-09-22T09:45:00.000Z", user: "other" }, { slot: "2026-09-22T11:00:00.000Z", user: "other" }],
    });
    expect(edges.reserved).toEqual([]);
    cleanup();
    const inside = run({ date: "2026-09-22", timezone: "UTC", eventLength: 60, daySlots, holds: [{ slot: "2026-09-22T10:45:00.000Z", user: "other" }] });
    expect(inside.reserved).toEqual(daySlots); // CONTROL
  });

  it("presence is skipped until the day's slots arrive and is never read for an empty date", () => {
    mocks.query.mockImplementation(() => undefined); // nothing loaded yet
    const { result } = renderHook(() => useConvexSlots("r", 60, 15, [], true, "UTC"));
    act(() => result.current.fetchSlotsForDate("2026-09-22"));
    const presenceArgs = mocks.query.mock.calls.filter(([reference]) => reference === "presence").map(([, args]) => args);
    expect(presenceArgs.length).toBeGreaterThan(0);
    expect(presenceArgs.every((args) => args === "skip")).toBe(true);
    cleanup();
    const loaded = run({ date: "2026-09-22", timezone: "UTC", eventLength: 60, daySlots: ["2026-09-22T10:00:00.000Z"], holds: [] });
    expect(loaded.presenceDates).toEqual(["2026-09-22"]);
    for (const date of loaded.presenceDates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps a fixed number of presence queries when the span changes", () => {
    const r = run({ date: "2026-09-22", timezone: "UTC", eventLength: 30, daySlots: ["2026-09-22T10:00:00.000Z"], holds: [] });
    const presenceArgsOfNextRender = () => {
      mocks.query.mockClear();
      r.view.rerender();
      return mocks.query.mock.calls.filter(([reference]) => reference === "presence").map(([, args]) => args);
    };
    expect(presenceArgsOfNextRender()).toEqual([{ resourceId: "r", date: "2026-09-22" }, "skip", "skip"]);
    serve(["2026-09-22T10:00:00.000Z", "2026-09-22T23:45:00.000Z"], []); // now two dates
    expect(presenceArgsOfNextRender()).toEqual([
      { resourceId: "r", date: "2026-09-22" }, { resourceId: "r", date: "2026-09-23" }, "skip",
    ]);
  });

  describe("bookings longer than a day", () => {
    const daySlots = ["2026-09-22T10:00:00.000Z"];

    it("reads the first three UTC dates, flags presence as incomplete and warns once", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // 10:00 on 22 September + 4000 minutes ends on 25 September: four dates
      const r = run({
        date: "2026-09-22", timezone: "UTC", eventLength: 4000, daySlots,
        holds: [{ slot: "2026-09-25T02:00:00.000Z", user: "other" }], // overlaps, but on the unread date
      });
      expect(r.presenceDates).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
      expect(r.presenceIncomplete).toBe(true);
      expect(r.available).toEqual(daySlots); // nothing is disabled because of an unread date
      r.view.rerender();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/presence/);
    });

    it("still reserves a slot for an overlapping hold on a read date", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = run({ date: "2026-09-22", timezone: "UTC", eventLength: 4000, daySlots, holds: [{ slot: "2026-09-24T12:00:00.000Z", user: "other" }] });
      expect(r.reserved).toEqual(daySlots);
    });

    it("CONTROL: a 2000-minute booking within three dates is complete and does not warn", () => {
      // 10:00 on 22 September + 2000 minutes ends at 19:20 on 23 September
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = run({ date: "2026-09-22", timezone: "UTC", eventLength: 2000, daySlots, holds: [{ slot: "2026-09-23T19:00:00.000Z", user: "other" }] });
      expect(r.presenceDates).toEqual(["2026-09-22", "2026-09-23"]);
      expect(r.presenceIncomplete).toBe(false);
      expect(r.reserved).toEqual(daySlots);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe("useSlotPresence lock flag (N20)", () => {
  function check(rows: Array<{ user: string; updated: number }> | undefined) {
    mocks.query.mockImplementation(() => rows); // rows arrive newest first
    return renderHook(() => useSlotPresence("r", "2027-03-09T10:00:00.000Z")).result.current;
  }

  it("is locked while another session holds the slot, whoever sent the latest heartbeat", () => {
    expect(check([{ user: ME, updated: 2 }, { user: "other", updated: 1 }])).toMatchObject({ isLocked: true, isHeldByMe: true, holderCount: 2 });
    expect(check([{ user: "other", updated: 2 }, { user: ME, updated: 1 }])).toMatchObject({ isLocked: true, isHeldByMe: true, holderCount: 2 });
    expect(check([{ user: "other", updated: 1 }])).toMatchObject({ isLocked: true, isHeldByMe: false, holderCount: 1 });
  });

  it("CONTROLS: only the viewer's hold, no holder and loading are not locked", () => {
    expect(check([{ user: ME, updated: 1 }])).toMatchObject({ isLocked: false, isHeldByMe: true, holderCount: 1 });
    expect(check([])).toMatchObject({ isLocked: false, isHeldByMe: false, holderCount: 0 });
    expect(check(undefined)).toMatchObject({ isLocked: false, isLoading: true });
  });
});
