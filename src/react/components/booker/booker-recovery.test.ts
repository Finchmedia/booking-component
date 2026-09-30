// @vitest-environment happy-dom

import { createElement, Fragment } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Booker, type BookerProps } from "./booker";
import { BookingErrorDialog } from "./booking-error-dialog";
import { BookingProvider, type PublicBookingAPI } from "../../context";
import { useBookingValidation, type ValidationRecovery } from "../../hooks/use-booking-validation";
import { formatTime } from "../../utils/date-utils";
import type { Booking, EventType, Resource } from "../../types";

// Real Booker, Calendar, BookingForm, BookingSuccess, BookingErrorDialog,
// useBookingValidation and useMutation. Only the Convex client transport and
// the cached query hook are stubbed. happy-dom does no hit-testing and no
// top-layer inertness, so modality is asserted structurally.

const SLOT_A = "2027-03-09T10:00:00.000Z";
const TITLE = "Booking No Longer Available";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
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

const EVENT = {
  _id: "event-db", id: "e", slug: "e", title: "Session", lengthInMinutes: 60, timezone: "UTC",
  isActive: true, locations: [],
};
const RESOURCE = { _id: "res-db", id: "r", name: "Room", type: "room", timezone: "UTC", isActive: true };
const ORIGINAL: Booking = {
  _id: "b-orig", uid: "booking-1", resourceId: "r", eventTypeId: "e",
  start: Date.parse("2027-03-09T09:00:00Z"), end: Date.parse("2027-03-09T10:00:00Z"), timezone: "UTC",
  status: "confirmed", bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
  managementToken: "tok-1",
};

const hostLinkClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());

/** The Booker below a host link, as on the host's booking pages. */
function renderBooker(props: Partial<BookerProps> = {}) {
  const tree = (next: Partial<BookerProps>) =>
    createElement(Fragment, null,
      createElement("a", { href: "/events", onClick: hostLinkClick }, "Back to Event Types"),
      createElement(ConvexProvider, { client },
        createElement(BookingProvider, {
          publicApi: API as unknown as PublicBookingAPI,
          children: createElement(Booker, { eventTypeId: "e", resourceId: "r", ...next }),
        })));
  const view = render(tree(props));
  return { rerender: (next: Partial<BookerProps>) => view.rerender(tree(next)) };
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

function echoBooking(args: { start: number; end: number; timezone: string; booker: { name: string; email: string } }): Booking {
  return {
    _id: "b-db", uid: "bk_new", resourceId: "r", eventTypeId: "e", start: args.start, end: args.end,
    timezone: args.timezone, status: "confirmed", bookerName: args.booker.name,
    bookerEmail: args.booker.email, eventTitle: "Session", managementToken: "tok",
  };
}

/** Asserts that nothing modal or overlaying is rendered. */
function expectNoModal() {
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.querySelector("dialog, [aria-modal], .fixed, [inert]")).toBeNull();
}

/** Asserts the host link can still be focused and activated. */
function expectHostLinkReachable() {
  const link = screen.getByRole("link", { name: "Back to Event Types" });
  expect(link.closest("[inert], [aria-hidden='true']")).toBeNull();
  link.focus();
  expect(document.activeElement).toBe(link);
  hostLinkClick.mockClear();
  fireEvent.click(link);
  expect(hostLinkClick).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal("IntersectionObserver", VisibleObserver);
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
  mocks.create.mockReset();
  mocks.reschedule.mockReset();
  mocks.queries = {
    [API.getEventType]: EVENT,
    [API.getResource]: RESOURCE,
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

describe("Booker validation error without a recovery callback (N10)", () => {
  it("CONTROL: a valid configuration shows the calendar and no error", () => {
    renderBooker();
    expect(slotButton(SLOT_A)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expectNoModal();
  });

  it("README shape: an inline alert replaces the Booker content; the page stays usable", () => {
    mocks.queries[API.getEventType] = { ...EVENT, isActive: false };
    renderBooker();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(TITLE);
    expect(alert.textContent).toContain("This event type has been deactivated");
    expect(screen.queryByRole("button", { name: formatTime(SLOT_A, "24h", Intl.DateTimeFormat().resolvedOptions().timeZone) })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Session" })).toBeNull(); // the calendar is gone
    expect(screen.queryAllByRole("button")).toHaveLength(0); // no dead action
    expectNoModal();
    expectHostLinkReachable();
  });

  it.each([
    ["host reschedule page: deactivated event", { originalBooking: ORIGINAL }, { [API.getEventType]: { ...EVENT, isActive: false } }],
    ["host resource page: deactivated resource with only onEventTypeReset", { onEventTypeReset: vi.fn() }, { [API.getResource]: { ...RESOURCE, isActive: false } }],
    ["unlinked resource with only onNavigate", { onNavigate: vi.fn() }, { [API.hasResourceEventTypeLink]: false }],
    ["deleted event type", {}, { [API.getEventType]: null }],
  ] as const)("%s: inline alert, no modal", (_name, props, queries) => {
    Object.assign(mocks.queries, queries);
    renderBooker(props);
    expect(screen.getByRole("alert").textContent).toContain(TITLE);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expectNoModal();
    expectHostLinkReachable();
    for (const callback of Object.values(props)) {
      if (typeof callback === "function") expect(callback).not.toHaveBeenCalled();
    }
  });
});

describe("Booker validation error with a recovery callback (N10)", () => {
  it("opens a modal alert dialog focused on its action; the action and Escape recover", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const onEventTypeReset = vi.fn();
    mocks.queries[API.getEventType] = { ...EVENT, isActive: false };
    renderBooker({ onEventTypeReset });
    const dialog = screen.getByRole("alertdialog", { name: TITLE });
    expect(dialog.tagName).toBe("DIALOG");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toMatch(/deactivated/);
    const action = screen.getByRole("button", { name: "Back to Event Selection" });
    expect(document.activeElement).toBe(action);

    fireEvent.click(action);
    expect(onEventTypeReset).toHaveBeenCalledWith("select-event-type");
    // Escape fires "cancel" on a modal dialog: it recovers instead of closing
    const cancel = new Event("cancel", { cancelable: true });
    act(() => { dialog.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented).toBe(true);
    expect(onEventTypeReset).toHaveBeenCalledTimes(2);
  });

  it("resource errors call onNavigate with the deprecated path and the recovery kind", () => {
    const onNavigate = vi.fn();
    mocks.queries[API.getResource] = { ...RESOURCE, isActive: false };
    renderBooker({ onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Back to Resources" }));
    expect(onNavigate).toHaveBeenCalledWith("/book", "select-resource");
  });

  it("a new booking cannot proceed under the dialog: slot and submit send nothing", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    const onEventTypeReset = vi.fn();
    const view = renderBooker({ onEventTypeReset });
    // On the form, the event is deactivated: submitting sends nothing
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    mocks.queries[API.getEventType] = { ...EVENT, isActive: false };
    view.rerender({ onEventTypeReset });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    submitForm();
    await settle();
    expect(mocks.create).not.toHaveBeenCalled();
    // On the calendar, activating a slot does not open the form
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(slotButton(SLOT_A));
    expect(screen.queryByRole("button", { name: "Confirm Booking" })).toBeNull();
    // CONTROL: once the event is active again the same steps book
    mocks.queries[API.getEventType] = EVENT;
    view.rerender({ onEventTypeReset });
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("does not block a reschedule; the backend decides whether the move is allowed", async () => {
    mocks.reschedule.mockImplementation(async (args: { newStart: number; newEnd: number }) => ({
      ...ORIGINAL, uid: "bk_moved", start: args.newStart, end: args.newEnd,
    }));
    mocks.queries[API.getEventType] = { ...EVENT, isActive: false };
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true, onEventTypeReset: vi.fn() });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
  });

  it("duration_invalid still resets the calendar with the real dialog", () => {
    mocks.queries[API.getEventType] = { ...EVENT, lengthInMinutes: 30, lengthInMinutesOptions: [30, 60] };
    const view = renderBooker();
    fireEvent.click(screen.getByRole("radio", { name: "1h" }));
    fireEvent.click(slotButton(SLOT_A));
    mocks.queries[API.getEventType] = { ...EVENT, lengthInMinutes: 30, lengthInMinutesOptions: [30, 90] };
    view.rerender({});
    const reset = screen.getByRole("button", { name: "Reset Calendar" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(document.activeElement).toBe(reset);
    fireEvent.click(reset);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByRole("radio", { name: "30min" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("Booker success step (N10)", () => {
  it.each([
    ["without", {}],
    ["with", { onEventTypeReset: vi.fn() }],
  ] as const)("a configuration change %s a callback does not cover the confirmation", async (_name, props) => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    const view = renderBooker(props);
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText("You're booked!")).toBeTruthy();
    mocks.queries[API.getEventType] = { ...EVENT, isActive: false };
    view.rerender(props);
    expect(screen.getByText("You're booked!")).toBeTruthy();
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expectNoModal();
    // CONTROL: the same change before booking does show the error
    cleanup();
    renderBooker(props);
    expect(screen.getByText(TITLE)).toBeTruthy();
  });
});

describe("BookingErrorDialog used directly (N10)", () => {
  // Hosts may build errors without the new `recovery` field
  const error = { type: "resource_deactivated" as const, message: "Gone.", recoveryPath: "/book" };

  it("is modal only with the callback for the error's recovery", () => {
    const onNavigate = vi.fn();
    render(createElement(BookingErrorDialog, { error, onNavigate }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Resources" }));
    expect(onNavigate).toHaveBeenCalledWith("/book", "select-resource");
    expect(screen.getByRole("alertdialog", { name: TITLE })).toBeTruthy();
    cleanup();
    const onEventTypeReset = vi.fn();
    render(createElement(BookingErrorDialog, { error, onEventTypeReset }));
    expect(screen.getByRole("alert").textContent).toContain("Gone.");
    expect(screen.queryByRole("button")).toBeNull();
    expectNoModal();
  });
});

describe("useBookingValidation recovery kind (N10)", () => {
  const event = EVENT as EventType;
  const resource = RESOURCE as Resource;
  const recoveryOf = (...args: Parameters<typeof useBookingValidation>) =>
    renderHook(() => useBookingValidation(...args)).result.current.error;

  it("names the next step for every error and keeps the deprecated path", () => {
    expect(recoveryOf(null, resource, true, 60, "r")).toMatchObject({ type: "event_deleted", recovery: "select-event-type", recoveryPath: "/book/r" });
    expect(recoveryOf({ ...event, isActive: false }, resource, true, 60, "r")).toMatchObject({ type: "event_deactivated", recovery: "select-event-type" });
    expect(recoveryOf(event, null, true, 60, "r")).toMatchObject({ type: "resource_deleted", recovery: "select-resource", recoveryPath: "/book" });
    expect(recoveryOf(event, { ...resource, isActive: false }, true, 60, "r")).toMatchObject({ type: "resource_deactivated", recovery: "select-resource" });
    expect(recoveryOf(event, resource, true, 45, "r")).toMatchObject({ type: "duration_invalid", recovery: "reset-duration", recoveryPath: "reset" });
    expect(recoveryOf(event, resource, false, 60, "r")).toMatchObject({ type: "resource_unlinked", recovery: "select-event-type" });
    expect(recoveryOf(event, resource, true, 60, "r")).toBeUndefined(); // CONTROL
  });
});

describe("Booker recovery callback types (N10)", () => {
  it("accepts callbacks written for the earlier signatures", () => {
    const earlier: BookerProps = {
      eventTypeId: "e", resourceId: "r",
      onEventTypeReset: () => {},
      onNavigate: (path: string) => void path,
    };
    const current: BookerProps["onNavigate"] = (_path, recovery) => {
      const kind: ValidationRecovery = recovery;
      void kind;
    };
    // @ts-expect-error CONTROL: the path is still a string
    const wrong: BookerProps["onNavigate"] = (path: number) => void path;
    expect([earlier, current, wrong]).toHaveLength(3);
  });
});
