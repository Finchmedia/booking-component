// @vitest-environment happy-dom

import { Component, createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { anyApi, getFunctionName } from "convex/server";
import { Booker, type BookerProps } from "./booker";
import { Calendar } from "../calendar/calendar";
import { BookingProvider, type PublicBookingAPI } from "../../context";

// N1 interim: a host getEventType wrapper maps a missing event type to null.
// Real BookingProvider (generated-style anyApi.public), real convex-helpers
// cached useQuery under ConvexQueryCacheProvider, real convex/react hooks,
// real Booker, Calendar and BookingErrorDialog. Only the client transport is
// faked: watchQuery().localQueryResult() returns a value or throws, the seam a
// ConvexReactClient exposes.

type EventState = "valid" | "null" | "throw";

const EVENT = {
  _id: "event-db", _creationTime: 1, id: "e", slug: "e", title: "Session", lengthInMinutes: 60,
  locations: [], isActive: true, timezone: "UTC", lockTimeZoneToggle: false,
};
const RESOURCE = { _id: "res-db", _creationTime: 1, id: "r", name: "Room", type: "room", timezone: "UTC", isActive: true };
const DELETED = "This event type has been deleted and is no longer available for booking.";

function fakeClient(initial: EventState) {
  const state = { event: initial };
  const listeners = new Set<() => void>();
  const resolve = (name: string): unknown => {
    switch (name) {
      case "public:getEventType":
        if (state.event === "throw") {
          // A host wrapper that lets the component's error through
          throw new Error("[CONVEX Q(public:getEventType)] Server Error\nUncaught Error: Event type not found: e");
        }
        return state.event === "null" ? null : EVENT;
      case "public:getResource":
        return RESOURCE;
      case "public:hasResourceEventTypeLink":
        return true;
      case "public:getMonthAvailability":
        return {};
      case "public:getDaySlots":
      case "public:getDatePresence":
        return [];
      default:
        return undefined;
    }
  };
  const client = {
    watchQuery(query: unknown) {
      const name = getFunctionName(query as never);
      return {
        onUpdate(callback: () => void) {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
        localQueryResult: () => resolve(name),
        journal: () => undefined,
      };
    },
    mutation: vi.fn(async () => null),
  } as unknown as ConvexReactClient;
  /** Delivers the current state to every subscription, as a server update would. */
  const update = (event: EventState) =>
    act(() => {
      state.event = event;
      for (const listener of [...listeners]) listener();
    });
  return { client, update };
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error
      ? createElement("div", { "data-testid": "boundary" }, this.state.error.message)
      : this.props.children;
  }
}

function renderWith(client: ConvexReactClient, child: ReactNode) {
  return render(
    createElement(ConvexProvider, { client },
      createElement(ConvexQueryCacheProvider, null,
        createElement(Boundary, null,
          createElement(BookingProvider, {
            // Inline, as hosts write publicApi={api.public}
            publicApi: anyApi.public as unknown as PublicBookingAPI,
            children: child,
          }))))
  );
}

const booker = (props: Partial<BookerProps> = {}) =>
  createElement(Booker, { eventTypeId: "e", resourceId: "r", ...props });

const calendar = () =>
  createElement(Calendar, {
    resourceId: "r",
    eventTypeId: "e",
    onSlotSelect: () => {},
    selectedDate: null,
    onDateChange: () => {},
    currentMonth: new Date(2027, 2, 1),
    onMonthChange: () => {},
    selectedDuration: 60,
    onDurationChange: () => {},
    timezone: "UTC",
    onTimezoneChange: () => {},
    timeFormat: "24h",
    onTimeFormatChange: () => {},
  });

/** Reports the calendar as visible so it loads its slots. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

const calendarHeading = () => screen.queryByRole("heading", { name: "Session" });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Booker with a null event type", () => {
  it("valid to null mid-session: the calendar is replaced by the event_deleted recovery", async () => {
    const onEventTypeReset = vi.fn();
    const { client, update } = fakeClient("valid");
    renderWith(client, booker({ onEventTypeReset }));
    expect(calendarHeading()).not.toBeNull(); // control: the real Calendar was live

    await update("null");

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain(DELETED);
    expect(calendarHeading()).toBeNull();
    expect(screen.queryByTestId("boundary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Event Selection" }));
    expect(onEventTypeReset.mock.calls).toEqual([[]]); // no arguments, as in 0.4.2
  });

  it("null from the start (unknown id), without a callback: an inline notice", () => {
    const { client } = fakeClient("null");
    renderWith(client, booker());
    expect(screen.getByRole("alert").textContent).toContain(DELETED);
    expect(calendarHeading()).toBeNull();
    expect(screen.queryByTestId("boundary")).toBeNull();
  });

  it("CONTROL: a wrapper that rethrows the component's error still reaches the error boundary", () => {
    const { client } = fakeClient("throw");
    renderWith(client, booker());
    expect(screen.getByTestId("boundary").textContent).toContain("Event type not found");
    expect(screen.queryByText(DELETED)).toBeNull();
  });
});

describe("Calendar with a null event type", () => {
  it("shows the event_deleted notice instead of a calendar", () => {
    const { client } = fakeClient("null");
    renderWith(client, calendar());
    expect(screen.getByRole("alert").textContent).toContain(DELETED);
    expect(calendarHeading()).toBeNull();
    expect(screen.queryByRole("button", { name: /next month/i })).toBeNull();
    expect(screen.queryByTestId("boundary")).toBeNull();
  });

  it("valid to null: the calendar is replaced without an error", async () => {
    const { client, update } = fakeClient("valid");
    renderWith(client, calendar());
    expect(calendarHeading()).not.toBeNull(); // control: the calendar rendered
    expect(screen.getByRole("button", { name: /next month/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    await update("null");

    expect(screen.getByRole("alert").textContent).toContain(DELETED);
    expect(calendarHeading()).toBeNull();
    expect(screen.queryByRole("button", { name: /next month/i })).toBeNull();
    expect(screen.queryByTestId("boundary")).toBeNull();
  });
});
