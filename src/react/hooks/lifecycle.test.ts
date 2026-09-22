// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSlotHold } from "./use-slot-hold";
import { useConvexSlots } from "./use-convex-slots";

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

vi.mock("../context", () => ({ useBookingAPI: () => mocks.api }));
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

  it("updates query inputs when resource, duration, month and timezone change", () => {
    const { result, rerender, unmount } = renderHook(
      ({ resource, duration, timezone, enabled }) => useConvexSlots(resource, duration, undefined, [30, 60], enabled, timezone),
      { initialProps: { resource: "room-a", duration: 30, timezone: "UTC", enabled: true } },
    );
    const selected = new Date("2026-09-22T23:30:00Z");
    act(() => {
      result.current.fetchSlots(selected);
      result.current.fetchMonthSlots(new Date(2026, 8, 1));
    });
    expect(mocks.query).toHaveBeenCalledWith("day", { resourceId: "room-a", date: "2026-09-22", eventLength: 30, slotInterval: 30 });
    rerender({ resource: "room-b", duration: 60, timezone: "Europe/Berlin", enabled: true });
    act(() => {
      result.current.fetchSlots(selected);
      result.current.fetchMonthSlots(new Date(2026, 9, 1));
    });
    expect(mocks.query).toHaveBeenCalledWith("day", { resourceId: "room-b", date: "2026-09-23", eventLength: 60, slotInterval: 30 });
    expect(mocks.query).toHaveBeenCalledWith("month", expect.objectContaining({ resourceId: "room-b", eventLength: 60, dateFrom: "2026-09-28", dateTo: "2026-11-01" }));
    rerender({ resource: "room-b", duration: 60, timezone: "Europe/Berlin", enabled: false });
    expect(mocks.query).toHaveBeenCalledWith("day", "skip");
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
});
