// @vitest-environment happy-dom

import { createElement, type ReactNode } from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedDurations, effectiveSlotInterval, type EventTypeDurations } from "./durations";
import { allowedDurations as exportedAllowed, effectiveSlotInterval as exportedInterval } from "../index";
import { BookingProvider, type PublicBookingAPI } from "../context";
import { Calendar } from "../components/calendar/calendar";
import { useConvexSlots } from "../hooks/use-convex-slots";

// N17: the helpers implement the formulas the package UI already used; the
// Calendar and useConvexSlots request the same slotInterval as before.

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  requests: [] as Array<{ reference: string; args: any }>,
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: string, args: unknown) => {
    if (args === "skip") return undefined;
    mocks.requests.push({ reference, args });
    return mocks.queries[reference];
  },
}));

const API = {
  getEventType: "public:getEventType",
  getMonthAvailability: "public:getMonthAvailability",
  getDaySlots: "public:getDaySlots",
  getDatePresence: "public:getDatePresence",
} as unknown as PublicBookingAPI;

/** Reports the calendar as visible so it loads its slots. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

const provider = ({ children }: { children: ReactNode }) =>
  createElement(BookingProvider, { publicApi: API, children });

/** The slotInterval the Calendar requested for its month and its selected day. */
function calendarSlotIntervals(eventType: EventTypeDurations, selectedDuration: number) {
  mocks.requests = [];
  mocks.queries["public:getEventType"] = {
    _id: "event-db", id: "e", slug: "e", title: "Session", timezone: "UTC", isActive: true, locations: [],
    ...eventType,
  };
  render(createElement(BookingProvider, {
    publicApi: API,
    children: createElement(Calendar, {
      resourceId: "r",
      eventTypeId: "e",
      onSlotSelect: () => {},
      selectedDate: new Date(2027, 2, 9),
      onDateChange: () => {},
      currentMonth: new Date(2027, 2, 1),
      onMonthChange: () => {},
      selectedDuration,
      onDurationChange: () => {},
      timezone: "UTC",
      onTimezoneChange: () => {},
      timeFormat: "24h",
      onTimeFormatChange: () => {},
    }),
  }));
  const intervalsOf = (reference: string) =>
    [...new Set(mocks.requests.filter((r) => r.reference === reference).map((r) => r.args.slotInterval))];
  return {
    month: intervalsOf("public:getMonthAvailability"),
    day: intervalsOf("public:getDaySlots"),
    eventLength: [...new Set(mocks.requests.filter((r) => r.reference === "public:getDaySlots").map((r) => r.args.eventLength))],
  };
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  mocks.queries = {
    "public:getMonthAvailability": {},
    "public:getDaySlots": [],
    "public:getDatePresence": [],
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("allowedDurations", () => {
  it.each([
    ["options", { lengthInMinutes: 30, lengthInMinutesOptions: [60, 90] }, [60, 90]],
    ["options including the length", { lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] }, [30, 60]],
    ["no options", { lengthInMinutes: 45 }, [45]],
    ["empty options", { lengthInMinutes: 45, lengthInMinutesOptions: [] }, [45]],
  ])("%s", (_name, eventType, expected) => {
    expect(allowedDurations(eventType)).toEqual(expected);
  });
});

describe("effectiveSlotInterval", () => {
  it.each([
    ["explicit slotInterval", { lengthInMinutes: 60, lengthInMinutesOptions: [30, 90], slotInterval: 15 }, 15],
    ["options containing the length", { lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] }, 30],
    // The shipped formula counts lengthInMinutes even when it is not an option
    ["length below every option", { lengthInMinutes: 30, lengthInMinutesOptions: [60, 90] }, 30],
    ["length above the shortest option", { lengthInMinutes: 60, lengthInMinutesOptions: [30, 90] }, 30],
    ["no options", { lengthInMinutes: 45 }, 45],
    ["empty options", { lengthInMinutes: 45, lengthInMinutesOptions: [] }, 45],
  ])("%s", (_name, eventType, expected) => {
    expect(effectiveSlotInterval(eventType)).toBe(expected);
  });

  it("is exported from @mrfinch/booking/react with allowedDurations", () => {
    expect(exportedInterval).toBe(effectiveSlotInterval);
    expect(exportedAllowed).toBe(allowedDurations);
  });
});

describe("Calendar and useConvexSlots request the same grid as before", () => {
  // Expected values are the grid the 0.4.2 Calendar requested, written out
  it.each([
    ["{30, [60, 90]} with 60 selected", { lengthInMinutes: 30, lengthInMinutesOptions: [60, 90] }, 60, 30],
    ["{60, [30, 90]} with 90 selected", { lengthInMinutes: 60, lengthInMinutesOptions: [30, 90] }, 90, 30],
    ["slotInterval 15", { lengthInMinutes: 60, lengthInMinutesOptions: [60, 120], slotInterval: 15 }, 120, 15],
    ["no options", { lengthInMinutes: 45 }, 45, 45],
  ])("%s", (_name, eventType, selected, expected) => {
    const requested = calendarSlotIntervals(eventType, selected);
    expect(requested.month).toEqual([expected]);
    expect(requested.day).toEqual([expected]);
    expect(requested.eventLength).toEqual([selected]); // control: the duration still follows the selection
    // A host guard using the helper checks starts on the grid the Calendar shows
    expect(requested.day).toEqual([effectiveSlotInterval(eventType)]);
  });

  it.each([
    ["slotInterval given", [60, 20, [30, 60]], 20],
    ["all durations [30, 60, 90]", [60, undefined, [30, 60, 90]], 30],
    ["options above the selected length", [30, undefined, [60, 90]], 60],
    ["no durations: the selected length", [45, undefined, undefined], 45],
    ["empty durations: the selected length", [45, undefined, []], 45],
  ] as const)("hook with %s", (_name, [eventLength, slotInterval, durations], expected) => {
    mocks.requests = [];
    const { result } = renderHook(
      () => useConvexSlots("r", eventLength, slotInterval, durations ? [...durations] : undefined, true, "UTC"),
      { wrapper: provider }
    );
    act(() => {
      result.current.fetchSlotsForDate("2027-03-09");
      result.current.fetchMonthSlotsFor(2027, 3);
    });
    const intervals = new Set(
      mocks.requests
        .filter((r) => r.reference === "public:getDaySlots" || r.reference === "public:getMonthAvailability")
        .map((r) => r.args.slotInterval)
    );
    expect([...intervals]).toEqual([expected]);
    // Control: both queries were requested
    expect(mocks.requests.map((r) => r.reference)).toEqual(
      expect.arrayContaining(["public:getDaySlots", "public:getMonthAvailability"])
    );
  });
});
