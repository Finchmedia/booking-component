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

// Real Booker, Calendar, BookingForm, BookingSuccess and useMutation. Only the
// Convex client transport and the cached query hook are stubbed.

const SLOT_A = "2027-03-09T10:00:00.000Z";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
  queries: {} as Record<string, unknown>,
  queryArgs: [] as Array<[string, unknown]>,
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: string, args: unknown) => {
    mocks.queryArgs.push([reference, args]);
    return args === "skip" ? undefined : mocks.queries[reference];
  },
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
  [API.heartbeat]: async () => null,
  [API.leave]: async () => null,
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

type Location = { type: string; address?: string; public?: boolean };

const EVENT = {
  _id: "event-db", id: "e", slug: "e", title: "Session", lengthInMinutes: 60, timezone: "UTC",
  isActive: true, locations: [] as Location[],
};
const ORIGINAL: Booking = {
  _id: "b-orig", uid: "booking-1", resourceId: "r", eventTypeId: "e",
  start: Date.parse("2027-03-09T09:00:00Z"), end: Date.parse("2027-03-09T10:00:00Z"), timezone: "UTC",
  status: "confirmed", bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
  managementToken: "tok-1",
};

function renderBooker(props: Partial<BookerProps> = {}) {
  return render(
    createElement(ConvexProvider, { client },
      createElement(BookingProvider, {
        publicApi: API as unknown as PublicBookingAPI,
        children: createElement(Booker, { eventTypeId: "e", resourceId: "r", ...props }),
      }))
  );
}

function slotButton(slot: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return screen.getByRole("button", { name: formatTime(slot, "24h", timezone) }) as HTMLButtonElement;
}

function fillContact() {
  fireEvent.change(screen.getByPlaceholderText("John Doe"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByPlaceholderText("john@example.com"), { target: { value: "ada@example.com" } });
}

function submitForm() {
  fireEvent.submit(screen.getByRole("button", { name: /^Confirm (Booking|Reschedule)$/ }).closest("form")!);
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** Stores the submitted location verbatim, as createBooking does. */
function echoBooking(args: {
  start: number; end: number; timezone: string; booker: { name: string; email: string };
  location: { type: string; value?: string };
}): Booking {
  return {
    _id: "b-db", uid: "bk_new", resourceId: "r", eventTypeId: "e", start: args.start, end: args.end,
    timezone: args.timezone, status: "confirmed", bookerName: args.booker.name,
    bookerEmail: args.booker.email, eventTitle: "Session", managementToken: "tok", location: args.location,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
  mocks.create.mockReset();
  mocks.create.mockImplementation(async (args) => echoBooking(args));
  mocks.reschedule.mockReset();
  mocks.queryArgs = [];
  mocks.queries = {
    [API.getEventType]: EVENT,
    [API.getResource]: { _id: "res-db", id: "r", name: "Room", type: "room", timezone: "UTC", isActive: true },
    [API.hasResourceEventTypeLink]: true,
    [API.getMonthAvailability]: { "2027-03-09": true },
    [API.getDaySlots]: [{ time: SLOT_A }],
    [API.getDatePresence]: [],
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Booker step focus (O3)", () => {
  it("moves focus to each new step's heading, but not on first render", async () => {
    renderBooker();
    expect(document.activeElement).toBe(document.body); // CONTROL: the page keeps its focus
    fireEvent.click(slotButton(SLOT_A));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Enter Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Session" }));
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "You're booked!" }));
    fireEvent.click(screen.getByRole("button", { name: "Book Another" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Session" }));
  });

  it("focuses the confirmation after a one-click reschedule", async () => {
    mocks.reschedule.mockImplementation(async (args: { newStart: number; newEnd: number }) => ({
      ...ORIGINAL, uid: "bk_moved", start: args.newStart, end: args.newEnd,
    }));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Booking Rescheduled!" }));
  });
});

describe("Booker duration by keyboard (O3)", () => {
  it("queries, shows and books the duration chosen in the radio group", async () => {
    mocks.queries[API.getEventType] = { ...EVENT, lengthInMinutes: 30, lengthInMinutesOptions: [30, 90] };
    renderBooker();
    const lastDaySlotLength = () => mocks.queryArgs
      .filter(([reference, args]) => reference === API.getDaySlots && args !== "skip")
      .map(([, args]) => (args as { eventLength: number }).eventLength)
      .pop();
    expect(lastDaySlotLength()).toBe(30); // CONTROL: the shortest option is preselected
    // Arrow keys change a native radio's checked state, which fires this change
    fireEvent.click(screen.getByRole("radio", { name: "1h 30min" }));
    expect((screen.getByRole("radio", { name: "1h 30min" }) as HTMLInputElement).checked).toBe(true);
    expect(lastDaySlotLength()).toBe(90);
    fireEvent.click(slotButton(SLOT_A));
    expect(screen.getByText("1h 30min")).toBeTruthy(); // the confirmation step's duration
    fillContact();
    submitForm();
    await settle();
    const { start, end } = mocks.create.mock.calls[0][0] as { start: number; end: number };
    expect((end - start) / 60_000).toBe(90);
  });
});

describe("Booker location (O4)", () => {
  async function bookWith(locations: Location[]) {
    mocks.queries[API.getEventType] = { ...EVENT, locations };
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText("You're booked!")).toBeTruthy();
    return (mocks.create.mock.calls[0][0] as { location: object }).location;
  }

  it.each([
    ["an address (CONTROL)", [{ type: "address", address: "Main St 1", public: true }], { type: "address", value: "Main St 1" }],
    ["an in-person place with an address", [{ type: "in_person", address: "Studio" }], { type: "in_person", value: "Studio" }],
    ["a link", [{ type: "link", address: "https://meet.example/abc" }], { type: "link", value: "https://meet.example/abc" }],
    ["several locations", [{ type: "address", address: "Branch North" }, { type: "address", address: "Branch South" }], { type: "address", value: "Branch North" }],
  ])("submits %s with its configured type and value", async (_name, locations, expected) => {
    expect(await bookWith(locations)).toStrictEqual(expected);
    expect(screen.getByText(expected.value)).toBeTruthy();
  });

  it.each([
    ["no location", [], { type: "unknown" }],
    ["an in-person place without an address", [{ type: "in_person" }], { type: "in_person" }],
    ["a phone location", [{ type: "phone" }], { type: "phone" }],
  ])("submits %s without inventing a value", async (_name, locations, expected) => {
    const location = await bookWith(locations);
    expect(location).toStrictEqual(expected);
    expect(Object.keys(location)).toEqual(["type"]);
    expect(document.body.textContent).not.toContain("Studio A");
    expect(document.querySelector(".lucide-map-pin")).toBeNull();
  });
});
