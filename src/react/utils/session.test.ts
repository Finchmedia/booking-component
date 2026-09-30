// @vitest-environment happy-dom

import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { getSessionId } from "./session";
import { formatTime } from "./date-utils";
import { Booker } from "../components/booker/booker";
import { Calendar } from "../components/calendar/calendar";
import { BookingProvider, type PublicBookingAPI } from "../context";

// N22: presence is advisory, so storage that throws, is null or is full must
// not break booking. Real Booker, Calendar, useSlotHold and useConvexSlots;
// only the Convex client transport and the cached query hook are stubbed.

const KEY = "convex-booking-session-id";
// Faked now: the slots stay in the future, and it is 1 March in every zone
const NOW = "2027-03-01T12:00:00.000Z";
const SLOT = "2027-03-09T10:00:00.000Z";

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(async (_args: unknown) => null),
  queries: {} as Record<string, unknown>,
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[reference]),
}));

const API = {
  createBooking: "public:createBooking",
  rescheduleBookingByToken: "public:rescheduleBookingByToken",
  heartbeat: "public:heartbeat",
  leave: "public:leave",
  getEventType: "public:getEventType",
  getResource: "public:getResource",
  hasResourceEventTypeLink: "public:hasResourceEventTypeLink",
  getMonthAvailability: "public:getMonthAvailability",
  getDaySlots: "public:getDaySlots",
  getDatePresence: "public:getDatePresence",
};

const client = {
  mutation: (reference: FunctionReference<"mutation">, args: unknown) =>
    getFunctionName(reference) === API.heartbeat ? mocks.heartbeat(args) : Promise.resolve(null),
} as unknown as ConvexReactClient;

class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

const originalWindow = Object.getOwnPropertyDescriptor(window, "sessionStorage");
const originalGlobal = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

/** Replaces sessionStorage (window and bare identifier) with what `get` returns or throws. */
function defineStorage(get: () => unknown) {
  Object.defineProperty(window, "sessionStorage", { configurable: true, get });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get });
}
const blocked = () => {
  throw new DOMException("Access is denied for this document.", "SecurityError");
};
const full = (stored: string | null) => ({
  getItem: () => stored,
  setItem: () => {
    throw new DOMException("quota", "QuotaExceededError");
  },
});

function withProviders(child: ReturnType<typeof createElement>) {
  return createElement(ConvexProvider, { client },
    createElement(BookingProvider, { publicApi: API as unknown as PublicBookingAPI, children: child }));
}

function StandaloneCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => new Date(2027, 2, 1));
  return createElement(Calendar, {
    resourceId: "r", eventTypeId: "e", onSlotSelect: () => {},
    selectedDate, onDateChange: setSelectedDate, currentMonth: month, onMonthChange: setMonth,
    selectedDuration: 60, onDurationChange: () => {}, timezone: "UTC", onTimezoneChange: () => {},
    timeFormat: "24h", onTimeFormatChange: () => {},
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  mocks.heartbeat.mockClear();
  mocks.queries = {
    [API.getEventType]: { _id: "event-db", id: "e", slug: "e", title: "Session", lengthInMinutes: 60, timezone: "UTC", isActive: true, locations: [] },
    [API.getResource]: { _id: "res-db", id: "r", name: "Room", type: "room", timezone: "UTC", isActive: true },
    [API.hasResourceEventTypeLink]: true,
    [API.getMonthAvailability]: { "2027-03-09": true },
    [API.getDaySlots]: [{ time: SLOT }],
    [API.getDatePresence]: [],
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalWindow) Object.defineProperty(window, "sessionStorage", originalWindow);
  if (originalGlobal) Object.defineProperty(globalThis, "sessionStorage", originalGlobal);
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getSessionId", () => {
  it("CONTROL: with working storage the id is stored and reused, in the existing format", () => {
    const id = getSessionId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    expect(sessionStorage.getItem(KEY)).toBe(id);
    expect(getSessionId()).toBe(id);
    sessionStorage.setItem(KEY, "stored-id");
    expect(getSessionId()).toBe("stored-id");
  });

  it("never throws: blocked, null and full storage give a stable in-memory id", () => {
    const ids: string[] = [];
    for (const get of [blocked, () => null, () => full(null)]) {
      defineStorage(get);
      const id = getSessionId();
      expect(typeof id).toBe("string");
      expect(id).not.toBe("");
      expect(id).not.toBe("server");
      expect(getSessionId()).toBe(id);
      ids.push(id);
    }
    expect(new Set(ids).size).toBe(1); // one id for the page's lifetime
  });

  it("CONTROL: an id that is already stored is returned even when setItem throws", () => {
    defineStorage(() => full("123-abc"));
    expect(getSessionId()).toBe("123-abc");
  });

  it("the in-memory id comes from crypto.randomUUID when available", async () => {
    vi.resetModules();
    const fresh = await import("./session");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("0f8fad5b-d9cb-469f-a165-70867728950e");
    defineStorage(blocked);
    expect(fresh.getSessionId()).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  });

  it("returns 'server' without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(getSessionId()).toBe("server");
  });
});

describe("booking UI with unusable storage", () => {
  it.each([
    ["blocked", blocked],
    ["null", () => null],
    ["full", () => full(null)],
  ])("the Booker renders and holds the chosen slot with %s storage", (_name, get) => {
    defineStorage(get);
    render(withProviders(createElement(Booker, { eventTypeId: "e", resourceId: "r" })));
    fireEvent.click(screen.getByRole("button", { name: formatTime(SLOT, "24h", Intl.DateTimeFormat().resolvedOptions().timeZone) }));
    expect(screen.getByRole("button", { name: "Confirm Booking" })).toBeTruthy();
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
    const { user } = mocks.heartbeat.mock.calls[0][0] as { user: string };
    expect(user).toBe(getSessionId());
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(mocks.heartbeat).toHaveBeenLastCalledWith(expect.objectContaining({ user, slots: expect.arrayContaining([SLOT]) }));
  });

  it("a standalone Calendar renders its slots with blocked storage", () => {
    defineStorage(blocked);
    render(withProviders(createElement(StandaloneCalendar)));
    fireEvent.click(screen.getByRole("button", { name: new Date(2027, 2, 9).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) }));
    expect(screen.getByRole("button", { name: formatTime(SLOT, "24h", "UTC") })).toBeTruthy();
  });
});
