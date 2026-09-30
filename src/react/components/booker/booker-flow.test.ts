// @vitest-environment happy-dom

import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Booker, type BookerProps } from "./booker";
import { BookingProvider, type PublicBookingAPI } from "../../context";
import { formatTime } from "../../utils/date-utils";
import type { Booking } from "../../types";

// Real Booker, Calendar, BookingForm, BookingSuccess, BookingErrorDialog,
// useSlotHold and useMutation. Only the Convex client transport and the
// cached query hook are stubbed.

// Faked now: the slots stay in the future, and it is 1 March in every zone
const NOW = "2027-03-01T12:00:00.000Z";
const SLOT_A = "2027-03-09T10:00:00.000Z";
const SLOT_B = "2027-03-09T12:00:00.000Z";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
  heartbeat: vi.fn(async (_args: unknown) => null),
  leave: vi.fn(async (_args: unknown) => null),
  queries: {} as Record<string, unknown>,
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: string, args: unknown) =>
    args === "skip" ? undefined : mocks.queries[reference],
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

const mutations: Record<string, (args: any) => unknown> = {
  [API.createBooking]: (args) => mocks.create(args),
  [API.rescheduleBookingByToken]: (args) => mocks.reschedule(args),
  [API.heartbeat]: (args) => mocks.heartbeat(args),
  [API.leave]: (args) => mocks.leave(args),
};
const client = {
  mutation: (reference: FunctionReference<"mutation">, args: unknown) =>
    mutations[getFunctionName(reference)](args),
} as unknown as ConvexReactClient;

/** Reports the calendar as visible so it loads its (stubbed) slots. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

const EVENT = {
  _id: "event-db", id: "e", slug: "e", title: "Session", lengthInMinutes: 60, timezone: "UTC",
  isActive: true, locations: [{ type: "address", address: "Main St 1", public: true }],
};
const ORIGINAL: Booking = {
  _id: "b-orig", uid: "booking-1", resourceId: "r", eventTypeId: "e",
  start: Date.parse("2027-03-09T09:00:00Z"), end: Date.parse("2027-03-09T10:00:00Z"), timezone: "UTC",
  status: "confirmed", bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
  managementToken: "tok-1",
};

let api: Record<string, string>;

function renderBooker(props: Partial<BookerProps> = {}) {
  const tree = (next: Partial<BookerProps>) =>
    createElement(ConvexProvider, { client },
      createElement(BookingProvider, {
        publicApi: api as unknown as PublicBookingAPI,
        children: createElement(Booker, { eventTypeId: "e", resourceId: "r", ...next }),
      }));
  const view = render(tree(props));
  return { unmount: view.unmount, rerender: (next: Partial<BookerProps>) => view.rerender(tree(next)) };
}

/** Slot buttons are labelled in the Booker's zone: the browser's, or the original booking's. */
function slotButton(
  slot: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  format: "12h" | "24h" = "24h"
) {
  return screen.getByRole("button", { name: formatTime(slot, format, timezone) }) as HTMLButtonElement;
}

function fillContact() {
  fireEvent.change(screen.getByPlaceholderText("John Doe"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByPlaceholderText("john@example.com"), { target: { value: "ada@example.com" } });
}

function submitButton() {
  return screen.getByRole("button", { name: /^Confirm (Booking|Reschedule)$/ }) as HTMLButtonElement;
}

function submitForm() {
  fireEvent.submit(submitButton().closest("form")!);
}

/** Lets form validation and mutation promises settle. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

function echoBooking(args: { start: number; end: number; timezone: string; booker: { name: string; email: string } }): Booking {
  return {
    _id: "b-db", uid: "bk_new", resourceId: "r", eventTypeId: "e", start: args.start, end: args.end,
    timezone: args.timezone, status: "confirmed", bookerName: args.booker.name,
    bookerEmail: args.booker.email, eventTitle: "Session", managementToken: "tok",
  };
}

function movedBooking(args: { newStart: number; newEnd: number }): Booking {
  return { ...ORIGINAL, _id: "b-moved", uid: "bk_moved", start: args.newStart, end: args.newEnd };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
  api = { ...API };
  mocks.create.mockReset();
  mocks.reschedule.mockReset();
  mocks.heartbeat.mockClear();
  mocks.leave.mockClear();
  mocks.queries = {
    [API.getEventType]: EVENT,
    [API.getResource]: { _id: "res-db", id: "r", name: "Room", type: "room", timezone: "UTC", isActive: true },
    [API.hasResourceEventTypeLink]: true,
    [API.getMonthAvailability]: { "2027-03-09": true },
    [API.getDaySlots]: [{ time: SLOT_A }, { time: SLOT_B }],
    [API.getDatePresence]: [],
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const slotsOf = (call: unknown[] | undefined) => (call?.[0] as { slots: string[] } | undefined)?.slots ?? [];
const heartbeatsFor = (slot: string) => mocks.heartbeat.mock.calls.filter((call) => slotsOf(call).includes(slot));
const leftSlot = (slot: string) => mocks.leave.mock.calls.some((call) => slotsOf(call).includes(slot));

/** Asserts that no heartbeat is sent over the next 15 seconds. */
function expectNoFurtherHeartbeats() {
  const count = mocks.heartbeat.mock.calls.length;
  act(() => { vi.advanceTimersByTime(15_000); });
  expect(mocks.heartbeat).toHaveBeenCalledTimes(count);
}

describe("Booker slot hold (O10)", () => {
  it("holds the slot while the form is open and releases it after a successful booking", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    // CONTROL: the form keeps the hold alive.
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(heartbeatsFor(SLOT_A)).toHaveLength(2);
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText("You're booked!")).toBeTruthy();
    expect(leftSlot(SLOT_A)).toBe(true);
    expectNoFurtherHeartbeats();
  });

  it("releases the hold after a successful reschedule in both reschedule flows", async () => {
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    for (const reuseBookerInfo of [false, true]) {
      mocks.leave.mockClear();
      renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo });
      fireEvent.click(slotButton(SLOT_A, "UTC"));
      if (!reuseBookerInfo) submitForm();
      await settle();
      expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
      expect(leftSlot(SLOT_A)).toBe(true);
      expectNoFurtherHeartbeats();
      cleanup();
    }
  });

  it("releases the failed slot after a one-click reschedule fails", async () => {
    mocks.reschedule.mockRejectedValue(new Error("Server Error"));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(heartbeatsFor(SLOT_A)).toHaveLength(1);
    expect(leftSlot(SLOT_A)).toBe(true);
    expectNoFurtherHeartbeats();
  });

  it("releases the hold on Back and on unmount", () => {
    const view = renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(leftSlot(SLOT_A)).toBe(true);
    expectNoFurtherHeartbeats();

    mocks.leave.mockClear();
    fireEvent.click(slotButton(SLOT_B));
    view.unmount();
    expect(leftSlot(SLOT_B)).toBe(true);
    expectNoFurtherHeartbeats();
  });
});

describe("Booker identity reset (O10)", () => {
  it("starts a fresh flow and releases the old hold when the resource or event type changes", () => {
    for (const change of [{ resourceId: "r-other" }, { eventTypeId: "e-other" }]) {
      mocks.heartbeat.mockClear();
      mocks.leave.mockClear();
      const view = renderBooker();
      fireEvent.click(slotButton(SLOT_A));
      expect(screen.getByRole("button", { name: "Confirm Booking" })).toBeTruthy();
      view.rerender(change);
      expect(screen.queryByRole("button", { name: "Confirm Booking" })).toBeNull();
      expect(slotButton(SLOT_A)).toBeTruthy(); // back on the calendar
      expect(mocks.leave).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "r", slots: expect.arrayContaining([SLOT_A]) }));
      expect(mocks.heartbeat).toHaveBeenCalledTimes(1); // only the original hold
      expectNoFurtherHeartbeats();
      cleanup();
    }
  });

  it("reschedules with the original's duration and zone when originalBooking arrives after mount", async () => {
    mocks.queries[API.getEventType] = { ...EVENT, lengthInMinutes: 30, lengthInMinutesOptions: [30, 60, 90] };
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    const tokyo: Booking = {
      ...ORIGINAL, start: Date.parse("2027-03-08T09:00:00Z"), end: Date.parse("2027-03-08T10:30:00Z"), timezone: "Asia/Tokyo",
    };
    for (const late of [false, true]) {
      mocks.reschedule.mockClear();
      const view = renderBooker({ originalBooking: late ? undefined : tokyo });
      if (late) view.rerender({ originalBooking: tokyo });
      fireEvent.click(slotButton(SLOT_A, "Asia/Tokyo")); // slots are labelled in the original's zone
      expect(screen.getByText(new RegExp(` at ${formatTime(SLOT_A, "24h", "Asia/Tokyo")}$`))).toBeTruthy();
      submitForm();
      await settle();
      const { newStart, newEnd } = mocks.reschedule.mock.calls[0][0] as { newStart: number; newEnd: number };
      expect((newEnd - newStart) / 60_000).toBe(90);
      cleanup();
    }
  });

  it("raises no duration dialog when a late original matches a single-duration event", () => {
    mocks.queries[API.getEventType] = { ...EVENT, lengthInMinutes: 90 };
    const ninety: Booking = { ...ORIGINAL, end: ORIGINAL.start + 90 * 60_000 };
    const view = renderBooker();
    view.rerender({ originalBooking: ninety });
    expect(screen.queryByText("Booking No Longer Available")).toBeNull();
    cleanup();
    // CONTROL: an original whose duration is no longer offered does raise it.
    renderBooker({ originalBooking: { ...ORIGINAL, end: ORIGINAL.start + 45 * 60_000 } });
    expect(screen.getByText("Booking No Longer Available")).toBeTruthy();
  });
});

describe("Booker reschedule success (O10)", () => {
  it("is terminal in both reschedule flows: nothing can move the superseded booking again", async () => {
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    for (const reuseBookerInfo of [false, true]) {
      mocks.reschedule.mockClear();
      renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo });
      fireEvent.click(slotButton(SLOT_A, "UTC"));
      if (!reuseBookerInfo) submitForm();
      await settle();
      expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Book Another" })).toBeNull();
      expect(screen.queryByRole("button", { name: formatTime(SLOT_B, "24h", "UTC") })).toBeNull();
      expect(mocks.reschedule).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("CONTROL: a new booking still offers 'Book Another', which returns to the calendar", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Book Another" }));
    expect(slotButton(SLOT_B)).toBeTruthy();
  });
});

describe("Booker one-click move in flight (N9)", () => {
  it("disables the slots and shows a status while the move is pending; a second click sends nothing", async () => {
    mocks.reschedule.mockImplementation(() => new Promise(() => {}));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    expect(screen.queryByRole("status")).toBeNull();
    expect(slotButton(SLOT_B, "UTC").disabled).toBe(false); // CONTROL
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    expect(screen.getByRole("status").textContent).toMatch(/Rescheduling/);
    expect(slotButton(SLOT_A, "UTC").disabled).toBe(true);
    expect(slotButton(SLOT_B, "UTC").disabled).toBe(true);
    fireEvent.click(slotButton(SLOT_B, "UTC"));
    await settle();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
    expect(heartbeatsFor(SLOT_B)).toHaveLength(0);
  });

  it("ends on the success screen holding nothing when the pending move completes", async () => {
    let complete = () => {};
    mocks.reschedule.mockImplementation(
      (args) => new Promise((resolve) => { complete = () => resolve(movedBooking(args)); })
    );
    const onBookingComplete = vi.fn();
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true, onBookingComplete });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    fireEvent.click(slotButton(SLOT_B, "UTC"));
    await act(async () => complete());
    expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
    expect(onBookingComplete).toHaveBeenCalledTimes(1);
    expect((onBookingComplete.mock.calls[0][0] as Booking).start).toBe(Date.parse(SLOT_A));
    expect(leftSlot(SLOT_A)).toBe(true);
    expect(heartbeatsFor(SLOT_B)).toHaveLength(0);
    expectNoFurtherHeartbeats();
  });

  it("re-enables the slots and removes the status after the move fails", async () => {
    mocks.reschedule.mockRejectedValue(new Error("Server Error"));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(screen.queryByRole("status")).toBeNull();
    expect(slotButton(SLOT_B, "UTC").disabled).toBe(false);
  });
});

describe("Booker reschedule confirmation (N11)", () => {
  const withContact: Booking = { ...ORIGINAL, bookerPhone: "+49 111", bookerNotes: "wheelchair access" };

  it("shows the original contact details read-only and sends only the move", async () => {
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    renderBooker({ originalBooking: withContact });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    for (const value of ["Ada", "ada@example.com", "+49 111", "wheelchair access"]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm Reschedule" }));
    await settle();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.reschedule.mock.calls[0][0] as object).sort()).toEqual(["newEnd", "newStart", "token", "uid"]);
    expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
  });

  it("does not block the move when the original has no name", async () => {
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    renderBooker({ originalBooking: { ...ORIGINAL, bookerName: "" } });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    submitForm();
    await settle();
    expect(screen.queryByText("Name is required")).toBeNull();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: a new booking still sends the entered contact details", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    fireEvent.change(screen.getByPlaceholderText(/Please share anything/), { target: { value: "Bring a tripod" } });
    submitForm();
    await settle();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      booker: { name: "Ada Lovelace", email: "ada@example.com", notes: "Bring a tripod" },
    });
  });
});

describe("Booker time format and locale (N18)", () => {
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = () => Intl.DateTimeFormat().resolvedOptions().locale;

  it.each(["24h", "12h"] as const)("confirm and success steps follow the calendar's %s format and locale", async (format) => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    if (format === "12h") fireEvent.click(screen.getByRole("button", { name: "12h" }));
    const label = slotButton(SLOT_A, zone(), format).textContent!;
    fireEvent.click(slotButton(SLOT_A, zone(), format));
    // Same wording as the calendar: the browser's locale, not a fixed en-US
    const date = new Date(SLOT_A).toLocaleDateString(locale(), {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: zone(),
    });
    const heading = screen.getByRole("heading", { name: "Enter Details" }).nextElementSibling!.textContent!;
    expect(heading).toBe(`${date} at ${label}`);
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText(new RegExp(`${label.replace(/\s/g, "\\s")}$`))).toBeTruthy();
  });
});
