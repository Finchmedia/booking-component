// @vitest-environment happy-dom

import { createElement } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { anyApi, getFunctionName, type FunctionReference } from "convex/server";
import { Booker, type BookerProps } from "./components/booker/booker";
import { BookingProvider } from "./context";
import { useSlotPresence } from "./hooks/use-slot-presence";
import { formatTime } from "./utils/date-utils";
import type {
  BookingUIOperations,
  BookingView,
  DaySlotView,
  EventTypeView,
  PresenceView,
  PublicBookingAPI,
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

const NOW = "2027-03-01T12:00:00.000Z";
const SLOT = "2027-03-09T10:00:00.000Z";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, (args: Record<string, unknown>) => unknown>,
}));

/** The strict host's validator: undeclared keys fail, as in Convex. */
function validate(name: string, args: Record<string, unknown>) {
  const operation = name.replace(/^public:/, "") as keyof typeof DECLARED;
  const declared: readonly string[] = DECLARED[operation];
  const surplus = Object.keys(args).filter((key) => !declared.includes(key));
  if (surplus.length > 0) throw new Error(`${name}: undeclared argument(s) ${surplus.join(", ")}`);
  mocks.calls.push({ name, args });
}

vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: (reference: FunctionReference<"query">, args: Record<string, unknown> | "skip") => {
    if (args === "skip") return undefined;
    const name = getFunctionName(reference);
    validate(name, args);
    return mocks.queries[name];
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

function renderBooker(props: Partial<BookerProps> = {}) {
  return render(
    createElement(ConvexProvider, { client },
      createElement(BookingProvider, {
        publicApi,
        children: createElement(Booker, { eventTypeId: "e", resourceId: "r", ...props }),
      })));
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
