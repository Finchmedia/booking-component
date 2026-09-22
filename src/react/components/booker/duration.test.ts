// @vitest-environment happy-dom

import { createElement, type ComponentProps } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Booker } from "./booker";
import type { Calendar } from "../calendar/calendar";
import type { BookingForm } from "../form/booking-form";
import type { BookingErrorDialog } from "./booking-error-dialog";
import type { EventType, Resource } from "../../types";

const mocks = vi.hoisted(() => ({
  calendar: vi.fn((_props: ComponentProps<typeof Calendar>) => null),
  form: vi.fn((_props: ComponentProps<typeof BookingForm>) => null),
  error: vi.fn((_props: ComponentProps<typeof BookingErrorDialog>) => null),
  query: vi.fn((_reference: string): unknown => undefined),
  mutation: vi.fn(async () => undefined),
  presence: vi.fn(),
}));

vi.mock("../../context", () => ({
  useBookingAPI: () => ({
    getEventType: "event", getResource: "resource", hasResourceEventTypeLink: "link",
    createBooking: "create", rescheduleBookingByToken: "reschedule",
  }),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }));
vi.mock("convex-helpers/react/cache/hooks", () => ({ useQuery: mocks.query }));
vi.mock("../../hooks/use-slot-hold", () => ({ useSlotHold: mocks.presence }));
vi.mock("../calendar", () => ({ Calendar: mocks.calendar, CalendarSkeleton: () => null }));
vi.mock("../form/booking-form", () => ({ BookingForm: mocks.form }));
vi.mock("../form/booking-success", () => ({ BookingSuccess: () => null }));
vi.mock("./booking-error-dialog", () => ({ BookingErrorDialog: mocks.error }));

let event: EventType | undefined;
const resource: Resource = { _id: "resource-db", id: "room", name: "Room", type: "room", timezone: "UTC", isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  event = { _id: "event-db", id: "meeting", title: "Meeting", slug: "meeting", lengthInMinutes: 30, timezone: "UTC" };
  mocks.query.mockImplementation((reference) => reference === "event" ? event : reference === "resource" ? resource : true);
});
afterEach(cleanup);

it("uses the event duration when configuration arrives after the first render", () => {
  const loadedEvent = event;
  event = undefined;
  const { rerender } = render(createElement(Booker, { eventTypeId: "meeting", resourceId: "room" }));
  expect(mocks.calendar).not.toHaveBeenCalled();
  event = loadedEvent;
  rerender(createElement(Booker, { eventTypeId: "meeting", resourceId: "room" }));
  expect(mocks.calendar.mock.lastCall?.[0].selectedDuration).toBe(30);
});

it("keeps a selected duration through the form and reports a removed option instead of silently changing it", () => {
  event = { ...event!, lengthInMinutesOptions: [30, 45] };
  const { rerender } = render(createElement(Booker, { eventTypeId: "meeting", resourceId: "room" }));
  expect(mocks.calendar.mock.lastCall?.[0].selectedDuration).toBe(30);
  act(() => mocks.calendar.mock.lastCall![0].onDurationChange(45));
  expect(mocks.calendar.mock.lastCall?.[0].selectedDuration).toBe(45);
  act(() => mocks.calendar.mock.lastCall![0].onSlotSelect({ slot: "2026-09-23T11:00:00Z", duration: 45 }));
  expect(mocks.form.mock.lastCall?.[0].selectedDuration).toBe(45);
  event = { ...event, lengthInMinutesOptions: [30] };
  rerender(createElement(Booker, { eventTypeId: "meeting", resourceId: "room" }));
  expect(mocks.form.mock.lastCall?.[0].selectedDuration).toBe(45);
  expect(mocks.error.mock.lastCall?.[0].error.type).toBe("duration_invalid");
});
