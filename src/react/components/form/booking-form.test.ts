// @vitest-environment happy-dom

import { createElement, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingForm } from "./booking-form";
import { BookingSuccess } from "./booking-success";
import type { Booking } from "../../types";

// 15:00Z is 17:00 in Berlin; zones are explicit, so the process TZ does not matter.
const SLOT = "2027-09-01T15:00:00.000Z";

afterEach(cleanup);

function renderForm(props: Partial<ComponentProps<typeof BookingForm>> = {}) {
  const onSubmit = vi.fn(async () => {});
  render(createElement(BookingForm, {
    eventType: { title: "Session", lengthInMinutes: 60 },
    selectedSlot: SLOT,
    selectedDuration: 60,
    timezone: "Europe/Berlin",
    onSubmit,
    onBack: () => {},
    isSubmitting: false,
    ...props,
  }));
  return onSubmit;
}

const booking: Booking = {
  _id: "b", uid: "bk_1", resourceId: "r", eventTypeId: "e", start: Date.parse(SLOT),
  end: Date.parse(SLOT) + 3_600_000, timezone: "Europe/Berlin", status: "confirmed",
  bookerName: "Ada", bookerEmail: "ada@example.com", eventTitle: "Session",
};

function renderSuccess(props: Partial<ComponentProps<typeof BookingSuccess>> = {}) {
  render(createElement(BookingSuccess, {
    booking,
    eventType: { title: "Session", lengthInMinutes: 60 },
    onBookAnother: () => {},
    ...props,
  }));
}

describe("BookingForm and BookingSuccess time format and locale (N18)", () => {
  it("BookingForm shows the selected time in the requested format and locale", () => {
    renderForm();
    expect(screen.getByText("Wednesday, September 1, 2027 at 5:00 PM")).toBeTruthy(); // default unchanged
    cleanup();
    renderForm({ timeFormat: "24h" });
    expect(screen.getByText("Wednesday, September 1, 2027 at 17:00")).toBeTruthy();
    cleanup();
    renderForm({ timeFormat: "24h", locale: "de-DE" });
    expect(screen.getByText("Mittwoch, 1. September 2027 at 17:00")).toBeTruthy();
  });

  it("BookingSuccess shows the booking time in the requested format and locale", () => {
    renderSuccess();
    expect(screen.getByText("Wednesday, September 1, 2027 at 5:00 PM")).toBeTruthy(); // default unchanged
    cleanup();
    renderSuccess({ timeFormat: "24h" });
    expect(screen.getByText("Wednesday, September 1, 2027 at 17:00")).toBeTruthy();
    cleanup();
    renderSuccess({ timeFormat: "12h", locale: "de-DE" });
    expect(screen.getByText(/^Mittwoch, 1\. September 2027 um 5:00\sPM$/)).toBeTruthy();
  });
});

describe("BookingForm submission error (F3)", () => {
  it("announces the error and links it to the submit button", () => {
    renderForm({ submitError: "This time was just taken." });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("This time was just taken.");
    const submit = screen.getByRole("button", { name: "Confirm Booking" });
    expect(submit.getAttribute("aria-describedby")).toBe(alert.id);
    cleanup();
    // CONTROL: no error, no alert and no dangling reference.
    renderForm();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm Booking" }).hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("BookingForm read-only details (N11)", () => {
  it("confirms the given details without inputs or validation", async () => {
    const details = { name: "", email: "ada@example.com", phone: "+49 111", notes: "wheelchair access" };
    const onSubmit = renderForm({ isRescheduling: true, readOnlyDetails: details });
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("+49 111")).toBeTruthy();
    expect(screen.getByText("wheelchair access")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Reschedule" })); });
    expect(onSubmit).toHaveBeenCalledWith(details);
  });

  it("CONTROL: without read-only details a reschedule form stays editable for direct use", () => {
    renderForm({ isRescheduling: true, currentUser: { name: "Ada", email: "ada@example.com" } });
    expect((screen.getByPlaceholderText("John Doe") as HTMLInputElement).value).toBe("Ada");
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});

describe("BookingSuccess after a reschedule (O10)", () => {
  it("offers no 'Book Another', because the original booking was replaced", () => {
    renderSuccess({ isRescheduling: true });
    expect(screen.getByText("Booking Rescheduled!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Book Another" })).toBeNull();
    cleanup();
    // CONTROL: a new booking keeps the action.
    const onBookAnother = vi.fn();
    renderSuccess({ onBookAnother });
    fireEvent.click(screen.getByRole("button", { name: "Book Another" }));
    expect(onBookAnother).toHaveBeenCalledTimes(1);
  });
});

describe("BookingForm labels and error state (O3)", () => {
  it("names each field by its visible label and marks the required ones", () => {
    renderForm();
    const name = screen.getByRole("textbox", { name: "Name" });
    const email = screen.getByRole("textbox", { name: "Email" });
    const phone = screen.getByRole("textbox", { name: "Phone Number" });
    const notes = screen.getByRole("textbox", { name: "Additional Notes" });
    expect(screen.getByLabelText(/^Name/)).toBe(name);
    expect(screen.getByLabelText(/^Email/)).toBe(email);
    expect(name.getAttribute("aria-required")).toBe("true");
    expect(email.getAttribute("aria-required")).toBe("true");
    // CONTROL: optional fields are not marked required
    expect(phone.hasAttribute("aria-required")).toBe(false);
    expect(notes.hasAttribute("aria-required")).toBe(false);
  });

  it("an invalid submit marks each failing field and links it to its error", async () => {
    renderForm();
    const name = screen.getByRole("textbox", { name: "Name" });
    const email = screen.getByRole("textbox", { name: "Email" });
    const phone = screen.getByRole("textbox", { name: "Phone Number" });
    // CONTROL: nothing is invalid before a submit
    for (const field of [name, email]) {
      expect(field.hasAttribute("aria-invalid")).toBe(false);
      expect(field.hasAttribute("aria-describedby")).toBe(false);
    }
    await act(async () => { fireEvent.submit(name.closest("form")!); });
    for (const [field, message] of [[name, "Name is required"], [email, "Please enter a valid email address"]] as const) {
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toBe(message);
    }
    // CONTROL: a valid field stays unmarked
    expect(phone.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("BookingSuccess location (O4)", () => {
  const mapPin = () => document.querySelector(".lucide-map-pin");

  it("shows a location value with a map pin", () => {
    for (const location of [{ type: "address", value: "Main St 1" }, { type: "phone", value: "+49 30 123" }]) {
      renderSuccess({ booking: { ...booking, location } });
      expect(screen.getByText(location.value).parentElement!.contains(mapPin())).toBe(true);
      cleanup();
    }
  });

  it("renders no location row without a value", () => {
    for (const location of [{ type: "unknown" }, { type: "phone" }, { type: "address" }, undefined]) {
      renderSuccess({ booking: { ...booking, location } });
      expect(screen.getByText("Ada")).toBeTruthy(); // CONTROL: the details card rendered
      expect(mapPin()).toBeNull();
      expect(Array.from(document.querySelectorAll("p")).filter((p) => p.textContent === "")).toHaveLength(0);
      cleanup();
    }
  });
});
