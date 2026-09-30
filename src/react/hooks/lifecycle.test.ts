// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSlotHold } from "./use-slot-hold";
import { useConvexSlots } from "./use-convex-slots";

// Vitest runs in Node, but the package's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(async (_args: unknown) => undefined),
  leave: vi.fn(async (_args: unknown) => undefined),
  query: vi.fn((_reference: string, _args: unknown): unknown => undefined),
  api: {
    heartbeat: "heartbeat",
    leave: "leave",
    getMonthAvailability: "month",
    getDaySlots: "day",
    getDatePresence: "presence",
  },
}));

vi.mock("../context", () => ({ useBookingAPI: () => mocks.api, useAvailabilityContextEnabled: () => false }));
vi.mock("convex/react", () => ({
  useMutation: (reference: string) => reference === "heartbeat" ? mocks.heartbeat : mocks.leave,
}));
vi.mock("convex-helpers/react/cache/hooks", () => ({ useQuery: mocks.query }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T10:00:00.000Z"));
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.heartbeat.mockResolvedValue(undefined);
  mocks.leave.mockResolvedValue(undefined);
  mocks.query.mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("slot presence lifecycle", () => {
  it("refreshes 15-minute coverage and leaves on duration/resource changes and unmount", async () => {
    const slot = "2026-09-22T23:45:00.000Z";
    const { rerender, unmount, result } = renderHook(
      ({ resource, duration }) => useSlotHold(resource, slot, duration, "event"),
      { initialProps: { resource: "room-a", duration: 30 } },
    );
    const original = {
      resourceId: "room-a", eventTypeId: "event", user: result.current,
      slots: [slot, "2026-09-23T00:00:00.000Z"],
    };
    expect(mocks.heartbeat).toHaveBeenLastCalledWith(original);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);

    rerender({ resource: "room-a", duration: 60 });
    expect(mocks.leave).toHaveBeenCalledWith({
      resourceId: "room-a", user: result.current, slots: original.slots,
    });
    expect(mocks.heartbeat).toHaveBeenLastCalledWith({
      ...original,
      slots: [...original.slots, "2026-09-23T00:15:00.000Z", "2026-09-23T00:30:00.000Z"],
    });
    rerender({ resource: "room-b", duration: 60 });
    expect(mocks.heartbeat).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: "room-b" }));
    unmount();
    expect(mocks.leave).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    const heartbeatCount = mocks.heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(heartbeatCount);
  });

  it("leaves when the slot is cleared and avoids invalid presence requests", () => {
    const { rerender } = renderHook(
      ({ slot, duration }: { slot: string | null; duration: number }) => useSlotHold("room", slot, duration),
      { initialProps: { slot: "2026-09-22T11:00:00Z" as string | null, duration: 30 } },
    );
    rerender({ slot: null, duration: 30 });
    expect(mocks.leave).toHaveBeenCalledTimes(1);
    for (const duration of [0, -15, NaN, Infinity]) {
      rerender({ slot: "2026-09-22T11:00:00Z", duration });
    }
    rerender({ slot: "invalid", duration: 30 });
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries transient heartbeat failures without unhandled rejections", async () => {
    mocks.heartbeat.mockRejectedValueOnce(new Error("Offline"));
    mocks.leave.mockRejectedValueOnce(new Error("Offline"));
    const { unmount } = renderHook(() => useSlotHold("room", "2026-09-22T11:00:00Z", 30));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
    await act(async () => { unmount(); });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("available slot lifecycle", () => {
  it("removes elapsed slots without a server update and clears its timer", async () => {
    mocks.query.mockImplementation((reference, args) => {
      if (args === "skip") return undefined;
      return reference === "day" ? [{ time: "2026-09-22T10:00:15Z" }, { time: "2026-09-22T11:00:00Z" }] : [];
    });
    const { result, unmount } = renderHook(() => useConvexSlots("room", 30, undefined, undefined, true, "UTC"));
    act(() => result.current.fetchSlots(new Date("2026-09-22T12:00:00Z")));
    expect(result.current.availableSlots).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.availableSlots.map((slot) => slot.time)).toEqual(["2026-09-22T11:00:00Z"]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Query keys are civil dates, so they must not depend on the process
// (browser) zone. Each case runs in several; the display zones are east and
// west of some of them.
const PROCESS_ZONES = [
  "UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland", "America/Denver",
  "Europe/London", "Europe/Helsinki", "Asia/Tokyo", "America/Los_Angeles",
];
const ORIGINAL_TZ = process.env.TZ;

/** Arguments of the latest call to one query. */
function lastQuery(reference: string) {
  const calls = mocks.query.mock.calls.filter(([ref]) => ref === reference);
  return calls[calls.length - 1]?.[1];
}

describe.each(PROCESS_ZONES)("slot query keys in process TZ %s", (zone) => {
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

  it("updates query inputs when resource, duration, month and timezone change", () => {
    const { result, rerender, unmount } = renderHook(
      ({ resource, duration, timezone, enabled }) => useConvexSlots(resource, duration, undefined, [30, 60], enabled, timezone),
      { initialProps: { resource: "room-a", duration: 30, timezone: "UTC", enabled: true } },
    );
    act(() => {
      result.current.fetchSlotsForDate("2026-09-22");
      result.current.fetchMonthSlotsFor(2026, 9);
    });
    expect(mocks.query).toHaveBeenCalledWith("day", { resourceId: "room-a", date: "2026-09-22", eventLength: 30, slotInterval: 30 });
    expect(mocks.query).toHaveBeenCalledWith("month", expect.objectContaining({ resourceId: "room-a", dateFrom: "2026-08-31", dateTo: "2026-10-04" }));
    rerender({ resource: "room-b", duration: 60, timezone: "Europe/Berlin", enabled: true });
    act(() => {
      result.current.fetchSlotsForDate("2026-09-23");
      result.current.fetchMonthSlotsFor(2026, 10);
    });
    expect(mocks.query).toHaveBeenCalledWith("day", { resourceId: "room-b", date: "2026-09-23", eventLength: 60, slotInterval: 30 });
    expect(mocks.query).toHaveBeenCalledWith("month", expect.objectContaining({ resourceId: "room-b", eventLength: 60, dateFrom: "2026-09-28", dateTo: "2026-11-01" }));
    // The display zone does not move a civil date
    rerender({ resource: "room-b", duration: 60, timezone: "Pacific/Auckland", enabled: true });
    expect(lastQuery("day")).toMatchObject({ date: "2026-09-23" });
    rerender({ resource: "room-b", duration: 60, timezone: "Europe/Berlin", enabled: false });
    expect(mocks.query).toHaveBeenCalledWith("day", "skip");
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it("the month range is the month's weeks, whichever display zone is used", () => {
    for (const timezone of ["Europe/Berlin", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      mocks.query.mockClear();
      const { result, unmount } = renderHook(() => useConvexSlots("room", 60, undefined, [30, 60], true, timezone));
      act(() => result.current.fetchMonthSlotsFor(2026, 10));
      expect(lastQuery("month")).toMatchObject({ dateFrom: "2026-09-28", dateTo: "2026-11-01" });
      // Months that start on a Monday and end on a Sunday: February 2027 and August 2027
      act(() => result.current.fetchMonthSlotsFor(2027, 2));
      expect(lastQuery("month")).toMatchObject({ dateFrom: "2027-02-01", dateTo: "2027-02-28" });
      act(() => result.current.fetchMonthSlotsFor(2027, 8));
      expect(lastQuery("month")).toMatchObject({ dateFrom: "2027-07-26", dateTo: "2027-09-05" });
      unmount();
    }
  });

  it("deprecated Date fetches keep their meaning: fetchSlots keys the instant in the display zone, fetchMonthSlots reads the local month", () => {
    const { result, rerender } = renderHook(
      ({ timezone }) => useConvexSlots("room", 60, undefined, [30, 60], true, timezone),
      { initialProps: { timezone: "UTC" } },
    );
    const instant = new Date("2026-09-22T23:30:00Z");
    act(() => result.current.fetchSlots(instant));
    expect(lastQuery("day")).toMatchObject({ date: "2026-09-22" });
    rerender({ timezone: "Europe/Berlin" });
    act(() => {
      result.current.fetchSlots(instant);
      result.current.fetchMonthSlots(new Date(2026, 9, 1));
    });
    expect(mocks.query).toHaveBeenCalledWith("day", expect.objectContaining({ date: "2026-09-23" }));
    expect(mocks.query).toHaveBeenCalledWith("month", expect.objectContaining({ dateFrom: "2026-09-28", dateTo: "2026-11-01" }));
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    const { result } = renderHook(() => useConvexSlots("room", 60, undefined, [30, 60], true, "UTC"));
    for (const date of ["", "2026-9-22", "2026-02-30"]) {
      expect(() => result.current.fetchSlotsForDate(date)).toThrow(RangeError);
    }
    expect(() => result.current.fetchMonthSlotsFor(2026, 13)).toThrow(RangeError);
    expect(() => result.current.fetchMonthSlots(new Date(NaN))).toThrow(RangeError);
    expect(mocks.query).not.toHaveBeenCalledWith("day", expect.objectContaining({ date: "" }));
  });
});
