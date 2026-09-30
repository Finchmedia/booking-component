// @vitest-environment happy-dom

import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
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
  return render(
    createElement(ConvexProvider, { client },
      createElement(BookingProvider, {
        publicApi: api as unknown as PublicBookingAPI,
        children: createElement(Booker, { eventTypeId: "e", resourceId: "r", ...props }),
      }))
  );
}

/** Slot buttons are labelled in the Booker's zone: the browser's, or the original booking's. */
function slotButton(slot: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return screen.getByRole("button", { name: formatTime(slot, "24h", timezone) }) as HTMLButtonElement;
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

/** A rejection as the Convex client builds it: transport text in `message`, host data forwarded. */
function clientError(data: unknown) {
  const error = new ConvexError(
    "[CONVEX M(public:createBooking)] [Request ID: 0123] Server Error\n  Called by client"
  ) as ConvexError<any>;
  error.data = data;
  return error;
}

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

describe("Booker submission errors (F3)", () => {
  it("CONTROL: a successful booking shows the success screen and no alert", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText("You're booked!")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: client-side validation messages render and nothing is sent", async () => {
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    submitForm();
    await settle();
    expect(screen.getByText("Name is required")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows the host's ConvexError message, never the client's transport text", async () => {
    mocks.create.mockRejectedValue(clientError({ code: "SLOT_TAKEN", message: "This time was just taken." }));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("This time was just taken.");
    expect(document.body.textContent).not.toContain("CONVEX");
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("shows a generic message for a plain server error instead of 'Server Error'", async () => {
    mocks.create.mockRejectedValue(new Error("Server Error"));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again.");
    expect(document.body.textContent).not.toContain("Server Error");
  });

  it("hands UNAUTHENTICATED to onAuthRequired without an alert or error callback", async () => {
    const onAuthRequired = vi.fn();
    const onBookingError = vi.fn();
    mocks.create.mockRejectedValue(clientError({ code: "UNAUTHENTICATED" }));
    renderBooker({ onAuthRequired, onBookingError });
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(onAuthRequired).toHaveBeenCalledWith({ slot: SLOT_A, duration: 60, eventTypeId: "e" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onBookingError).not.toHaveBeenCalled();
  });

  it("shows a sign-in message for UNAUTHENTICATED when onAuthRequired is absent", async () => {
    mocks.create.mockRejectedValue(clientError({ code: "UNAUTHENTICATED" }));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("Please sign in to continue.");
  });

  it("shows a failed reschedule on the confirmation step (CONTROL: success still renders)", async () => {
    mocks.reschedule.mockRejectedValueOnce(clientError("That booking can no longer be moved."));
    renderBooker({ originalBooking: ORIGINAL });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    submitForm();
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("That booking can no longer be moved.");

    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    submitForm();
    await settle();
    expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a failed one-click reschedule above the calendar", async () => {
    mocks.reschedule.mockRejectedValue(clientError({ message: "That time was just taken." }));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Reschedule failed");
    expect(alert.textContent).toContain("That time was just taken.");
    expect(slotButton(SLOT_B, "UTC").disabled).toBe(false);
  });

  it("reports a missing management token as a configuration error and sends nothing", async () => {
    const { managementToken: _omit, ...noToken } = ORIGINAL;
    const onBookingError = vi.fn();
    renderBooker({ originalBooking: noToken, reuseBookerInfo: true, onBookingError });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Rescheduling is not configured for this booking page.");
    expect(onBookingError).toHaveBeenCalledWith(expect.any(Error), { phase: "reschedule" });
    expect(mocks.reschedule).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("keeps a stable mutation binding when the API lacks rescheduleBookingByToken", async () => {
    const { rescheduleBookingByToken: _omit, ...partial } = API;
    api = partial;
    // CONTROL: create mode still renders and books through the real useMutation.
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByText("You're booked!")).toBeTruthy();
    cleanup();
    mocks.create.mockClear();

    for (const reuseBookerInfo of [false, true]) {
      renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo });
      fireEvent.click(slotButton(SLOT_A, "UTC"));
      if (!reuseBookerInfo) submitForm();
      await settle();
      const text = screen.getByRole("alert").textContent ?? "";
      expect(text).toContain("Rescheduling is not configured for this booking page.");
      expect(text).not.toMatch(/token/i);
      cleanup();
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.reschedule).not.toHaveBeenCalled();
  });

  it("clears the alert on retry, on Back and on a new slot", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Server Error"));
    mocks.create.mockImplementation(() => new Promise(() => {}));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByRole("alert")).toBeTruthy();
    submitForm(); // retry
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    cleanup();

    mocks.create.mockReset();
    mocks.create.mockRejectedValue(new Error("Server Error"));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(slotButton(SLOT_A));
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();

    mocks.reschedule.mockRejectedValueOnce(new Error("Server Error"));
    mocks.reschedule.mockImplementation(() => new Promise(() => {}));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(slotButton(SLOT_B, "UTC"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("calls onBookingError once per failure with its phase, in addition to the alert", async () => {
    const onBookingError = vi.fn();
    const createError = new Error("Server Error");
    mocks.create.mockRejectedValue(createError);
    renderBooker({ onBookingError });
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    submitForm();
    await settle();
    expect(onBookingError).toHaveBeenCalledTimes(1);
    expect(onBookingError).toHaveBeenCalledWith(createError, { phase: "create" });
    expect(screen.getByRole("alert")).toBeTruthy();
    cleanup();

    onBookingError.mockClear();
    const moveError = clientError({ message: "Moved elsewhere" });
    mocks.reschedule.mockRejectedValue(moveError);
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true, onBookingError });
    fireEvent.click(slotButton(SLOT_A, "UTC"));
    await settle();
    expect(onBookingError).toHaveBeenCalledTimes(1);
    expect(onBookingError).toHaveBeenCalledWith(moveError, { phase: "reschedule" });
    expect(screen.getByRole("alert").textContent).toContain("Moved elsewhere");
  });
});

describe("Booker in-flight guards", () => {
  it("sends one booking for two submits in the same tick, and a retry after it settles", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Server Error"));
    renderBooker();
    fireEvent.click(slotButton(SLOT_A));
    fillContact();
    const form = submitButton().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    // CONTROL: the guard is released, so a later retry is sent.
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    submitForm();
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(screen.getByText("You're booked!")).toBeTruthy();
  });

  it("sends one move for two slot clicks in the same tick", async () => {
    mocks.reschedule.mockImplementation(() => new Promise(() => {}));
    renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true });
    const [a, b] = [slotButton(SLOT_A, "UTC"), slotButton(SLOT_B, "UTC")];
    act(() => {
      a.click();
      b.click(); // before re-render: only the ref guard can stop it
    });
    await settle();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
    expect(mocks.reschedule).toHaveBeenCalledWith({
      uid: "booking-1", token: "tok-1", newStart: Date.parse(SLOT_A), newEnd: Date.parse(SLOT_A) + 3_600_000,
    });
  });
});

// The project compiles without Node types, so reach the process events through a narrow type.
const nodeProcess = (globalThis as unknown as {
  process: {
    on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
    off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  };
}).process;

describe("Booker host callback errors", () => {
  const hostBug = () => { throw new Error("host bug"); };
  const loggedAsFailure = () =>
    vi.mocked(console.error).mock.calls.some(([first]) => /failed:$/.test(String(first)));

  it("a throwing onBookingComplete keeps the confirmation and is not reported as a failure", async () => {
    mocks.create.mockImplementation(async (args) => echoBooking(args));
    mocks.reschedule.mockImplementation(async (args) => movedBooking(args));
    for (const reschedule of [false, true]) {
      vi.mocked(console.error).mockClear();
      const onBookingComplete = vi.fn(hostBug);
      const onBookingError = vi.fn();
      if (reschedule) {
        renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: true, onBookingComplete, onBookingError });
        fireEvent.click(slotButton(SLOT_A, "UTC"));
      } else {
        renderBooker({ onBookingComplete, onBookingError });
        fireEvent.click(slotButton(SLOT_A));
        fillContact();
        submitForm();
      }
      await settle();
      expect(screen.getByText(reschedule ? "Booking Rescheduled!" : "You're booked!")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(onBookingComplete).toHaveBeenCalledTimes(1);
      expect(onBookingError).not.toHaveBeenCalled();
      expect(loggedAsFailure()).toBe(false);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("onBookingComplete"), expect.any(Error));
      cleanup();
    }
  });

  it("a throwing onBookingError still shows the alert and leaves no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const record = (reason: unknown) => { rejections.push(reason); };
    nodeProcess.on("unhandledRejection", record);
    try {
      mocks.create.mockRejectedValue(new Error("Server Error"));
      mocks.reschedule.mockRejectedValue(new Error("Server Error"));
      for (const flow of ["create", "reschedule form", "one-click reschedule"] as const) {
        const onBookingError = vi.fn(hostBug);
        if (flow === "create") {
          renderBooker({ onBookingError });
          fireEvent.click(slotButton(SLOT_A));
          fillContact();
          submitForm();
        } else {
          renderBooker({ originalBooking: ORIGINAL, reuseBookerInfo: flow === "one-click reschedule", onBookingError });
          fireEvent.click(slotButton(SLOT_A, "UTC"));
          if (flow === "reschedule form") submitForm();
        }
        await settle();
        await settle();
        expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Please try again.");
        expect(onBookingError).toHaveBeenCalledTimes(1);
        cleanup();
      }
    } finally {
      nodeProcess.off("unhandledRejection", record);
    }
    expect(rejections).toEqual([]);
  });
});
