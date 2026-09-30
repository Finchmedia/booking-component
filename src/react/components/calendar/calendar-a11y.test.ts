// @vitest-environment happy-dom

import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventMetaPanel } from "./event-meta-panel";
import { TimeSlotButton } from "./time-slot-button";
import { CalendarDayButton } from "./calendar-day-button";
import { TimeSlotsPanel } from "./time-slots-panel";
import type { CalendarDay } from "../../utils/date-utils";

// Real components; zones are explicit, so the process TZ does not matter.

afterEach(cleanup);

const EVENT = {
  title: "Session", lengthInMinutes: 30, lengthInMinutesOptions: [30, 60, 90],
  timezone: "UTC", lockTimeZoneToggle: false, locations: [],
};

function renderPanel(props: Partial<ComponentProps<typeof EventMetaPanel>> = {}) {
  const onDurationChange = vi.fn();
  render(createElement(EventMetaPanel, {
    eventType: EVENT, selectedDuration: 30, onDurationChange,
    userTimezone: "UTC", onTimezoneChange: () => {}, timezoneLocked: false, ...props,
  }));
  return onDurationChange;
}

describe("duration choice (O3)", () => {
  it("is a native radio group named 'Duration' with the selected duration checked", () => {
    renderPanel({ selectedDuration: 60 });
    const group = screen.getByRole("group", { name: "Duration" });
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual(["30min", "1h", "1h 30min"]);
    for (const radio of radios) {
      expect(group.contains(radio)).toBe(true);
      expect(radio.type).toBe("radio"); // native: Tab reaches the group, arrow keys move within it
      expect(radio.name).toBe(radios[0].name);
      expect(radio.tabIndex).toBe(0);
    }
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    expect(screen.getByRole("radio", { name: "1h" })).toBe(radios[1]);
  });

  it("choosing a duration reports it through onDurationChange", () => {
    const onDurationChange = renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "1h" }));
    expect(onDurationChange).toHaveBeenCalledWith(60);
    fireEvent.click(screen.getByText("1h 30min")); // the label selects its radio
    expect(onDurationChange).toHaveBeenLastCalledWith(90);
  });

  it("read-only mode and single-duration events render no radios", () => {
    renderPanel({ readOnly: true });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("30min")).toBeTruthy(); // CONTROL: the duration is still shown
    cleanup();
    renderPanel({ eventType: { ...EVENT, lengthInMinutesOptions: [30] } });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("the time zone row does not pretend to be clickable (O1)", () => {
    renderPanel();
    const row = screen.getByText(/^UTC/).closest("div")!;
    expect(row.className).not.toContain("cursor-pointer");
    expect(row.querySelector("button, a, [tabindex]")).toBeNull();
  });
});

describe("slot names (O3)", () => {
  it("a reserved slot is named by its time; free slots keep the time as their name", () => {
    render(createElement("div", null,
      createElement(TimeSlotButton, { slot: { time: "2027-03-09T10:00:00.000Z" }, timeFormat: "24h", timezone: "UTC", onSlotSelect: () => {} }),
      createElement(TimeSlotButton, { slot: { time: "2027-03-09T11:00:00.000Z" }, timeFormat: "24h", timezone: "UTC", onSlotSelect: () => {}, isReserved: true }),
    ));
    expect(screen.getByRole("button", { name: "10:00" })).toBeTruthy(); // CONTROL
    const reserved = screen.getByRole("button", { name: "11:00, reserved" }) as HTMLButtonElement;
    expect(reserved.disabled).toBe(true);
    expect(reserved.textContent).toBe("Reserved");
  });
});

describe("day buttons (O3)", () => {
  const day = (date: Date, state: Partial<CalendarDay>): CalendarDay => ({
    date, day: date.getDate(), isCurrentMonth: true, isPast: false, isToday: false,
    isSelected: false, hasSlots: true, disabled: false, ...state,
  });

  it("expose the full date, the selected day and today", () => {
    const march = (d: number) => new Date(2027, 2, d); // local midnight, as generateCalendarDays builds them
    const name = (d: number) => march(d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const onDateSelect = vi.fn();
    render(createElement("div", null,
      createElement(CalendarDayButton, { day: day(march(9), { isSelected: true }), onDateSelect }),
      createElement(CalendarDayButton, { day: day(march(10), { isToday: true }), onDateSelect }),
      createElement(CalendarDayButton, { day: day(march(11), {}), onDateSelect }),
    ));
    const selected = screen.getByRole("button", { name: name(9) });
    const today = screen.getByRole("button", { name: name(10) });
    const other = screen.getByRole("button", { name: name(11) });
    expect(name(9)).toMatch(/2027/);
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(today.getAttribute("aria-current")).toBe("date");
    // CONTROLS: the states are not set on every day
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(today.getAttribute("aria-pressed")).toBe("false");
    for (const button of [selected, other]) expect(button.hasAttribute("aria-current")).toBe(false);
    fireEvent.click(other);
    expect(onDateSelect).toHaveBeenCalledWith(march(11));
  });
});

describe("time format toggles (O3)", () => {
  it("expose which format is pressed", () => {
    const onTimeFormatChange = vi.fn();
    render(createElement(TimeSlotsPanel, {
      selectedDate: new Date(2027, 2, 9), availableSlots: [], reservedSlots: [], loading: false,
      timeFormat: "24h", onTimeFormatChange, onSlotSelect: () => {}, timezone: "UTC",
    }));
    expect(screen.getByRole("button", { name: "24h" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "12h" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "12h" }));
    expect(onTimeFormatChange).toHaveBeenCalledWith("12h");
  });
});
