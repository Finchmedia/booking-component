// @vitest-environment happy-dom

import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { anyApi, getFunctionName, type FunctionReference } from "convex/server";
import { Booker, type BookerProps } from "./components/booker/booker";
import { BookingProvider } from "./context";
import { useConvexSlots } from "./hooks/use-convex-slots";
import { useSlotPresence } from "./hooks/use-slot-presence";
import { formatTime } from "./utils/date-utils";
import type {
  AvailabilityContextOperations,
  BookingUIOperations,
  BookingView,
  DaySlotView,
  EventTypeView,
  PresenceView,
  PublicBookingAPI,
  PublicBookingAPIWithAvailabilityContext,
  ResourceView,
} from "./contract";
import type { Booking } from "./types";

// F4: the real Booker through the real provider and generated-style api
// against a strict host. Each host function accepts exactly the keys the
// contract declares (a Convex validator rejects others) and returns only the
// view fields, so the UI must send the contract's arguments and read nothing
// more than its views.

type ArgKeys<K extends keyof BookingUIOperations> = keyof BookingUIOperations[K]["args"];
type Declared = { [K in keyof BookingUIOperations]: readonly ArgKeys<K>[] };

/** The keys each host function declares: the contract's base arguments. */
const DECLARED = {
  getEventType: ["eventTypeId"],
  getResource: ["id"],
  hasResourceEventTypeLink: ["resourceId", "eventTypeId"],
  getMonthAvailability: ["resourceId", "dateFrom", "dateTo", "eventLength", "slotInterval"],
  getDaySlots: ["resourceId", "date", "eventLength", "slotInterval"],
  getDatePresence: ["resourceId", "date"],
  getPresence: ["resourceId", "slot"],
  createBooking: ["eventTypeId", "resourceId", "start", "end", "timezone", "booker", "location"],
  rescheduleBookingByToken: ["uid", "token", "newStart", "newEnd"],
  heartbeat: ["resourceId", "slots", "user", "eventTypeId"],
  leave: ["resourceId", "slots", "user"],
} as const satisfies Declared;

// Every argument key of the contract is declared (a new key fails to compile)
type Complete = {
  [K in keyof BookingUIOperations]: [Exclude<ArgKeys<K>, (typeof DECLARED)[K][number]>] extends [never] ? true : false;
};
const complete: false extends Complete[keyof Complete] ? false : true = true;

type ContextArgKeys<K extends keyof AvailabilityContextOperations> = keyof AvailabilityContextOperations[K]["args"];
type ContextDeclared = { [K in keyof AvailabilityContextOperations]: readonly ContextArgKeys<K>[] };

/** With availabilityContext on, the availability queries also declare the context keys. */
const CONTEXT_DECLARED = {
  getMonthAvailability: [...DECLARED.getMonthAvailability, "eventTypeId", "rescheduleContext"],
  getDaySlots: [...DECLARED.getDaySlots, "eventTypeId", "rescheduleContext"],
} as const satisfies ContextDeclared;

type ContextComplete = {
  [K in keyof AvailabilityContextOperations]:
    [Exclude<ContextArgKeys<K>, (typeof CONTEXT_DECLARED)[K][number]>] extends [never] ? true : false;
};
const contextComplete: false extends ContextComplete[keyof ContextComplete] ? false : true = true;

const NOW = "2027-03-01T12:00:00.000Z";
const SLOT = "2027-03-09T10:00:00.000Z";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  /** The keys each host function declares, by operation name */
  declared: {} as Record<string, readonly string[]>,
  /** A result, or a host function computing it from the arguments */
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, (args: Record<string, unknown>) => unknown>,
}));

/** The strict host's validator: undeclared keys fail, as in Convex. */
function validate(name: string, args: Record<string, unknown>) {
  const declared = mocks.declared[name.replace(/^public:/, "")];
  const surplus = Object.keys(args).filter((key) => !declared.includes(key));
  if (surplus.length > 0) throw new Error(`${name}: undeclared argument(s) ${surplus.join(", ")}`);
  // v.object({ uid, token }) rejects nested surplus keys too
  const nested = args.rescheduleContext === undefined ? [] : Object.keys(args.rescheduleContext as object);
  if (nested.some((key) => key !== "uid" && key !== "token")) throw new Error(`${name}: rescheduleContext ${nested.join(", ")}`);
  mocks.calls.push({ name, args });
}

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: FunctionReference<"query">, args: Record<string, unknown> | "skip") => {
    if (args === "skip") return undefined;
    const name = getFunctionName(reference);
    validate(name, args);
    const result = mocks.queries[name];
    return typeof result === "function" ? (result as (args: Record<string, unknown>) => unknown)(args) : result;
  },
}));

const client = {
  mutation: async (reference: FunctionReference<"mutation">, args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    validate(name, args);
    return mocks.mutations[name](args);
  },
} as unknown as ConvexReactClient;

/** Reports the calendar as visible so it loads its slots. */
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

// Only the view fields: a redacted host
const EVENT: EventTypeView = { id: "e", title: "Session", lengthInMinutes: 60, isActive: true };
const RESOURCE: ResourceView = { isActive: true };
const SLOTS: DaySlotView[] = [{ time: SLOT }];
const HOLDS: PresenceView[] = [];
const created = (args: Record<string, unknown>): BookingView => ({
  uid: "bk_new", status: "confirmed", start: args.start as number, end: args.end as number,
  timezone: args.timezone as string, bookerName: "Ada Lovelace",
});
const moved = (args: Record<string, unknown>): BookingView => ({
  uid: "bk_moved", status: "pending", start: args.newStart as number, end: args.newEnd as number,
  timezone: "UTC", bookerName: "Ada",
});
const ORIGINAL: Booking = {
  _id: "b-orig", uid: "booking-1", resourceId: "r", eventTypeId: "e",
  start: Date.parse("2027-03-09T09:00:00Z"), end: Date.parse("2027-03-09T10:00:00Z"), timezone: "UTC",
  status: "confirmed", bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
  managementToken: "tok-1",
};

// Held once: each property read of a generated api returns a new proxy
const publicApi = anyApi.public as unknown as PublicBookingAPI;
// The same proxy, as a host that declares the availability context types it
const contextApi = publicApi as unknown as PublicBookingAPIWithAvailabilityContext;

/** The provider as a host sets it up, with or without the availability context. */
function provider(availabilityContext: boolean, children: ReactNode) {
  if (availabilityContext) {
    mocks.declared = { ...DECLARED, ...CONTEXT_DECLARED };
    return createElement(BookingProvider, { publicApi: contextApi, availabilityContext: true, children });
  }
  return createElement(BookingProvider, { publicApi, children });
}

function renderBooker(props: Partial<BookerProps> = {}, { availabilityContext = false } = {}) {
  return render(
    createElement(ConvexProvider, { client },
      provider(availabilityContext, createElement(Booker, { eventTypeId: "e", resourceId: "r", ...props }))));
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** The key sets sent to each function, sorted. */
function sentKeys() {
  const byName: Record<string, string[][]> = {};
  for (const { name, args } of mocks.calls) {
    const keys = Object.keys(args).sort();
    const seen = (byName[name] ??= []);
    if (!seen.some((known) => known.join() === keys.join())) seen.push(keys);
  }
  return byName;
}

const sorted = (keys: readonly string[]) => [[...keys].sort()];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  sessionStorage.clear();
  mocks.calls = [];
  mocks.declared = { ...DECLARED };
  mocks.queries = {
    "public:getEventType": EVENT,
    "public:getResource": RESOURCE,
    "public:hasResourceEventTypeLink": true,
    "public:getMonthAvailability": { "2027-03-09": true },
    "public:getDaySlots": SLOTS,
    "public:getDatePresence": HOLDS,
    "public:getPresence": [],
  };
  mocks.mutations = {
    "public:createBooking": created,
    "public:rescheduleBookingByToken": moved,
    "public:heartbeat": () => null,
    "public:leave": () => null,
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("arguments against a strict host", () => {
  it("books with exactly the contract's keys and reads only the views", async () => {
    expect(complete).toBe(true);
    const onBookingComplete = vi.fn();
    renderBooker({ onBookingComplete });
    fireEvent.click(screen.getByRole("button", { name: formatTime(SLOT, "24h", Intl.DateTimeFormat().resolvedOptions().timeZone) }));
    fireEvent.change(screen.getByPlaceholderText("John Doe"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByPlaceholderText("john@example.com"), { target: { value: "ada@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Booking" }).closest("form")!);
    await settle();

    expect(screen.getByText("You're booked!")).toBeTruthy();
    expect(onBookingComplete).toHaveBeenCalledWith(expect.objectContaining({ uid: "bk_new" }));
    const sent = sentKeys();
    for (const name of [
      "getEventType", "getResource", "hasResourceEventTypeLink", "getMonthAvailability",
      "getDaySlots", "getDatePresence", "createBooking", "heartbeat", "leave",
    ] as const) {
      expect(sent[`public:${name}`], name).toEqual(sorted(DECLARED[name]));
    }
    // No availability context without the host opting in (0.4.x arguments)
    expect(mocks.calls.some(({ args }) => "rescheduleContext" in args)).toBe(false);
  });

  it("reschedules with exactly the contract's keys, and the token only goes to the move", async () => {
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(screen.getByRole("button", { name: formatTime(SLOT, "24h", "UTC") }));
    await settle();

    // The status is a plain string; "pending" shows the request heading
    expect(screen.getByText("Reschedule Request Submitted")).toBeTruthy();
    expect(sentKeys()["public:rescheduleBookingByToken"]).toEqual(sorted(DECLARED.rescheduleBookingByToken));
    const withToken = mocks.calls.filter(({ args }) => JSON.stringify(args).includes("tok-1"));
    expect(withToken.map(({ name }) => name)).toEqual(["public:rescheduleBookingByToken"]);
  });

  it("fails loudly when the UI sends a key the host does not declare (control)", () => {
    expect(() => validate("public:getDaySlots", { resourceId: "r", date: "2027-03-09", eventLength: 60, slotInterval: 60, eventTypeId: "e" }))
      .toThrow("undeclared argument(s) eventTypeId");
  });

  it("checks presence of one slot with the contract's keys", () => {
    const { result } = renderHook(() => useSlotPresence("r", SLOT), {
      wrapper: ({ children }) => createElement(BookingProvider, { publicApi, children }),
    });
    expect(result.current.isLocked).toBe(false);
    expect(sentKeys()["public:getPresence"]).toEqual(sorted(DECLARED.getPresence));
  });
});

// F13 (R1): with BookingProvider's availabilityContext on, the slot queries
// carry the selected event type and, when rescheduling, the booking being
// moved with its token. Without it they are exactly the 0.4.x arguments.
describe("availability context (opt-in)", () => {
  // The original occupies 09:00–10:00: a move to 09:30 overlaps it
  const OVERLAP = "2027-03-09T09:30:00.000Z";
  const FREE = "2027-03-09T11:00:00.000Z";
  const RESCHEDULE_CONTEXT = { uid: "booking-1", token: "tok-1" };

  /** A host that excludes the original's own occupancy for its uid and token only. */
  const honoursContext = (args: Record<string, unknown>) => {
    const context = args.rescheduleContext as { uid: string; token: string } | undefined;
    return context?.uid === ORIGINAL.uid && context.token === ORIGINAL.managementToken;
  };
  const hostDaySlots = (args: Record<string, unknown>): DaySlotView[] =>
    honoursContext(args) ? [{ time: OVERLAP }, { time: FREE }] : [{ time: FREE }];

  const callsOf = (name: string) => {
    const calls = mocks.calls.filter((call) => call.name === `public:${name}`).map(({ args }) => args);
    expect(calls.length, `${name} was queried`).toBeGreaterThan(0);
    return calls;
  };
  const utcSlot = (slot: string) => screen.queryByRole("button", { name: formatTime(slot, "24h", "UTC") });

  it("is off by default: the slot queries get the 0.4.x arguments when rescheduling and creating", () => {
    renderBooker({ originalBooking: ORIGINAL });
    // The calendar opens on March 2027 and selects today, 1 March, in the original's zone (UTC)
    for (const args of callsOf("getMonthAvailability")) {
      expect(JSON.stringify(args)).toBe(JSON.stringify(
        { resourceId: "r", dateFrom: "2027-03-01", dateTo: "2027-04-04", eventLength: 60, slotInterval: 60 }));
    }
    for (const args of callsOf("getDaySlots")) {
      expect(JSON.stringify(args)).toBe(JSON.stringify({ resourceId: "r", date: "2027-03-01", eventLength: 60, slotInterval: 60 }));
    }
    cleanup();
    mocks.calls = [];

    // Creating: the same keys in the same order (the day is today in the browser's zone)
    renderBooker();
    for (const args of callsOf("getMonthAvailability")) expect(Object.keys(args)).toEqual(DECLARED.getMonthAvailability);
    for (const args of callsOf("getDaySlots")) expect(Object.keys(args)).toEqual(DECLARED.getDaySlots);
  });

  it("adds only eventTypeId when creating", () => {
    expect(contextComplete).toBe(true);
    renderBooker({}, { availabilityContext: true });
    fireEvent.click(screen.getByRole("button", { name: formatTime(SLOT, "24h", Intl.DateTimeFormat().resolvedOptions().timeZone) }));

    const sent = sentKeys();
    expect(sent["public:getMonthAvailability"]).toEqual(sorted([...DECLARED.getMonthAvailability, "eventTypeId"]));
    expect(sent["public:getDaySlots"]).toEqual(sorted([...DECLARED.getDaySlots, "eventTypeId"]));
    for (const args of [...callsOf("getMonthAvailability"), ...callsOf("getDaySlots")]) expect(args.eventTypeId).toBe("e");
    // Every other function gets its usual arguments
    for (const name of ["getEventType", "getResource", "hasResourceEventTypeLink", "getDatePresence", "heartbeat"] as const) {
      expect(sent[`public:${name}`], name).toEqual(sorted(DECLARED[name]));
    }
  });

  it("adds eventTypeId and rescheduleContext when rescheduling; the token reaches no other function and no log", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true }, { availabilityContext: true });
    fireEvent.click(utcSlot(SLOT)!);
    await settle();
    expect(screen.getByText("Reschedule Request Submitted")).toBeTruthy();

    const sent = sentKeys();
    expect(sent["public:getMonthAvailability"]).toEqual(sorted(CONTEXT_DECLARED.getMonthAvailability));
    expect(sent["public:getDaySlots"]).toEqual(sorted(CONTEXT_DECLARED.getDaySlots));
    for (const args of [...callsOf("getMonthAvailability"), ...callsOf("getDaySlots")]) {
      expect(args.eventTypeId).toBe("e");
      expect(args.rescheduleContext).toEqual(RESCHEDULE_CONTEXT);
    }
    for (const name of ["getDatePresence", "heartbeat", "leave", "rescheduleBookingByToken"] as const) {
      expect(sent[`public:${name}`], name).toEqual(sorted(DECLARED[name]));
    }
    const withToken = new Set(mocks.calls.filter(({ args }) => JSON.stringify(args).includes("tok-1")).map(({ name }) => name));
    expect(withToken).toEqual(new Set(["public:getMonthAvailability", "public:getDaySlots", "public:rescheduleBookingByToken"]));
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain("tok-1");
  });

  it("offers and makes a move overlapping the original when the host honours the context", async () => {
    mocks.queries["public:getDaySlots"] = hostDaySlots;
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true }, { availabilityContext: true });
    fireEvent.click(utcSlot(OVERLAP)!);
    await settle();

    expect(screen.getByText("Reschedule Request Submitted")).toBeTruthy();
    expect(callsOf("rescheduleBookingByToken")).toEqual([
      { uid: "booking-1", token: "tok-1", newStart: Date.parse(OVERLAP), newEnd: Date.parse(OVERLAP) + 60 * 60_000 },
    ]);
  });

  it("CONTROL: without the opt-in, or with another booking's token, the overlapping time is not offered", () => {
    mocks.queries["public:getDaySlots"] = hostDaySlots;
    const cases = [
      { original: ORIGINAL, availabilityContext: false },
      { original: { ...ORIGINAL, managementToken: "tok-other" }, availabilityContext: true },
    ];
    for (const { original, availabilityContext } of cases) {
      renderBooker({ originalBooking: original, reuseBookerInfo: true }, { availabilityContext });
      expect(utcSlot(FREE)).toBeTruthy(); // the day's slots were loaded
      expect(utcSlot(OVERLAP)).toBeNull();
      cleanup();
    }
  });

  it("the month view counts a day that only the moved booking fills, through useConvexSlots", () => {
    mocks.queries["public:getMonthAvailability"] = (args: Record<string, unknown>) => ({ "2027-03-09": honoursContext(args) });
    for (const availabilityContext of [false, true]) {
      const { result, unmount } = renderHook(
        () => useConvexSlots("r", 60, 60, undefined, true, "UTC", { eventTypeId: "e", rescheduleContext: RESCHEDULE_CONTEXT }),
        { wrapper: ({ children }) => provider(availabilityContext, children) },
      );
      act(() => result.current.fetchMonthSlotsFor(2027, 3));
      // Queried in both cases; the context is sent only with the opt-in
      expect(result.current.monthSlots).toEqual({ "2027-03-09": availabilityContext });
      unmount();
    }
  });
});
