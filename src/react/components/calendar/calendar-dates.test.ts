// @vitest-environment happy-dom

import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Calendar } from "./calendar";
import { Booker } from "../booker/booker";
import { BookingProvider, type PublicBookingAPI } from "../../context";
import { formatTime } from "../../utils/date-utils";
import type { Booking } from "../../types";

// Vitest runs in Node, but the package's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// F9: the clicked or auto-selected label, the heading, the highlighted cell and
// the queried day are one civil date, whatever the browser (process) zone and
// display zone. Real Calendar, CalendarGrid, TimeSlotsPanel, Booker and
// useConvexSlots; only the Convex client transport and the cached query hook
// are stubbed. Every case runs in each process zone.

const PROCESS_ZONES = [
  "UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland", "America/Denver", "Europe/London",
];
// East and west of every process zone
const DISPLAY_ZONES = ["Pacific/Honolulu", "America/New_York", "UTC", "Europe/Berlin", "Pacific/Auckland", "Pacific/Kiritimati"];
const ORIGINAL_TZ = process.env.TZ;

const mocks = vi.hoisted(() => ({
  reschedule: vi.fn(),
  queries: {} as Record<string, (args: any) => unknown>,
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: string, args: unknown) =>
    args === "skip" ? undefined : mocks.queries[reference]?.(args),
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
  mutation: (reference: FunctionReference<"mutation">, args: any) =>
    getFunctionName(reference) === API.rescheduleBookingByToken ? mocks.reschedule(args) : Promise.resolve(null),
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
  _id: "event-db", id: "e", slug: "e", title: "Session", lengthInMinutes: 60, slotInterval: 60,
  timezone: "Europe/Berlin", isActive: true, locations: [],
};
/** One slot per day at 14:00Z, so the offered slot shows which day was queried. */
const slotFor = (date: string) => `${date}T14:00:00.000Z`;

function withProviders(child: ReturnType<typeof createElement>) {
  return createElement(ConvexProvider, { client },
    createElement(BookingProvider, { publicApi: API as unknown as PublicBookingAPI, children: child }));
}

function CalendarHarness({ timezone, initialDate, onSlot }: {
  timezone: string; initialDate: () => Date | null; onSlot: (slot: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [month, setMonth] = useState(() => new Date(2027, 8, 1));
  return createElement(Calendar, {
    resourceId: "r", eventTypeId: "e", onSlotSelect: ({ slot }) => onSlot(slot),
    selectedDate, onDateChange: setSelectedDate, currentMonth: month, onMonthChange: setMonth,
    selectedDuration: 60, onDurationChange: () => {}, timezone, onTimezoneChange: () => {},
    timeFormat: "24h", onTimeFormatChange: () => {},
  });
}

const fullDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const heading = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
/** The day button for a September 2027 date, named by its full date. */
const dayButton = (day: number) => screen.getByRole("button", { name: fullDate(new Date(2027, 8, day)) }) as HTMLButtonElement;

/** Every non-skipped call of the logged queries, in order. */
let queryLog: Array<{ reference: string; args: any }> = [];
function queried(reference: string) {
  return queryLog.filter((call) => call.reference === reference).map((call) => call.args);
}

function view() {
  const days = queried(API.getDaySlots).map((args) => args.date);
  return {
    heading: screen.getByRole("heading", { level: 3 }).textContent,
    lastDayKey: days[days.length - 1],
    pressed: screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true" && b.getAttribute("aria-label")).map((b) => b.textContent),
    today: screen.getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "date"),
  };
}

function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  sessionStorage.clear();
  mocks.reschedule.mockReset();
  queryLog = [];
  const log = (reference: string, result: (args: any) => unknown) => (args: any) => {
    queryLog.push({ reference, args });
    return result(args);
  };
  mocks.queries = {
    [API.getEventType]: () => EVENT,
    [API.getResource]: () => ({ _id: "res-db", id: "r", name: "Room", type: "room", timezone: "Europe/Berlin", isActive: true }),
    [API.hasResourceEventTypeLink]: () => true,
    [API.getMonthAvailability]: log(API.getMonthAvailability, () => ({ "2027-09-01": true, "2027-09-02": true })),
    [API.getDaySlots]: log(API.getDaySlots, ({ date }) => [{ time: slotFor(date) }]),
    [API.getDatePresence]: log(API.getDatePresence, () => []),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe.each(PROCESS_ZONES)("Calendar days in process TZ %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  it("CONTROL: the process zone is in effect", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it.each([...new Set([zone, ...DISPLAY_ZONES])])("display %s: clicking label 2 queries, heads, highlights and books 2 September", (display) => {
    setNow("2027-08-20T12:00:00Z");
    const onSlot = vi.fn();
    render(withProviders(createElement(CalendarHarness, { timezone: display, initialDate: () => new Date(2027, 8, 20), onSlot })));
    expect(view().lastDayKey).toBe("2027-09-20"); // CONTROL: the preselected carrier is queried as its label

    act(() => { fireEvent.click(dayButton(2)); });
    const after = view();
    expect(after.lastDayKey).toBe("2027-09-02");
    expect(after.heading).toBe(heading(new Date(2027, 8, 2)));
    expect(after.pressed).toEqual(["2"]);
    expect(queried(API.getDatePresence).map((args) => args.date)).toContain("2027-09-02");

    fireEvent.click(screen.getByRole("button", { name: formatTime(slotFor("2027-09-02"), "24h", display) }));
    expect(onSlot).toHaveBeenCalledWith(slotFor("2027-09-02"));
  });

  // Auto-select picks today in the display zone. [display, now, today there]
  const AUTO_SELECT: Array<[string, string, number]> = [
    ["Europe/Berlin", "2027-09-02T00:30:00Z", 2], // Berlin is on the 2nd, New York still on the 1st
    ["America/New_York", "2027-09-02T00:30:00Z", 1],
    ["America/New_York", "2027-09-01T14:00:00Z", 1], // the same date everywhere
    ["Europe/Berlin", "2027-09-01T14:00:00Z", 1],
    ["Pacific/Kiritimati", "2027-09-01T10:30:00Z", 2],
    ["Pacific/Honolulu", "2027-09-01T10:30:00Z", 1],
  ];

  it.each(AUTO_SELECT)("display %s at %s: auto-select, heading, highlight, query and today name the %sth", (display, now, day) => {
    setNow(now);
    render(withProviders(createElement(CalendarHarness, { timezone: display, initialDate: () => null, onSlot: () => {} })));
    const today = `2027-09-0${day}`;
    const r = view();
    expect(r.lastDayKey).toBe(today);
    expect(r.heading).toBe(heading(new Date(2027, 8, day)));
    expect(r.pressed).toEqual([String(day)]);
    expect(r.today).toEqual([dayButton(day)]);
    expect(dayButton(day).disabled).toBe(false);
  });
});

const ORIGINAL: Booking = {
  _id: "b-orig", uid: "booking-1", resourceId: "r", eventTypeId: "e",
  start: Date.parse("2027-09-10T14:00:00Z"), end: Date.parse("2027-09-10T15:00:00Z"), timezone: "America/New_York",
  status: "confirmed", bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
  managementToken: "tok-1",
};

describe.each(PROCESS_ZONES)("Booker days in process TZ %s", (zone) => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  const monthHeading = () => screen.getByRole("heading", { level: 2 }).textContent;

  it("opens on the month that contains today in the display zone", () => {
    setNow("2027-09-01T02:00:00Z"); // 31 August in New York, 1 September from London eastwards
    render(withProviders(createElement(Booker, { eventTypeId: "e", resourceId: "r", originalBooking: ORIGINAL })));
    expect(monthHeading()).toBe("August 2027");
    cleanup();
    // CONTROL: a new booking displays the browser zone, so it opens on the browser's month
    render(withProviders(createElement(Booker, { eventTypeId: "e", resourceId: "r" })));
    const local = new Date();
    expect(monthHeading()).toBe(`${local.getMonth() === 7 ? "August" : "September"} 2027`);
  });

  it("a one-click reschedule of a New York booking moves to the clicked day", async () => {
    setNow("2027-08-20T12:00:00Z");
    mocks.reschedule.mockImplementation(async (args) => ({ ...ORIGINAL, uid: "moved", start: args.newStart, end: args.newEnd }));
    render(withProviders(createElement(Booker, { eventTypeId: "e", resourceId: "r", originalBooking: ORIGINAL, reuseBookerInfo: true })));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    act(() => { fireEvent.click(dayButton(2)); });
    expect(view().lastDayKey).toBe("2027-09-02");
    fireEvent.click(screen.getByRole("button", { name: formatTime(slotFor("2027-09-02"), "24h", "America/New_York") }));
    await act(async () => {});
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
    expect(mocks.reschedule.mock.calls[0][0]).toMatchObject({ uid: "booking-1", newStart: Date.parse(slotFor("2027-09-02")) });
  });
});
