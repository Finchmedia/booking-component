/**
 * Booking statuses are one closed set (F16, D35, owner request): the schema,
 * the history table, transitionBookingState, listBookings and the version 2
 * hook payload share bookingStatusValidator, and the generated types carry
 * the literals instead of `string`. That every status the component writes
 * is in the set is checked end to end by the booking_status_invalid audit
 * test (src/component/audit-checks.test.ts).
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import type { Infer } from "convex/values";
import schema from "../component/schema.js";
import type { Doc } from "../component/_generated/dataModel.js";
import type { ComponentApi } from "../component/_generated/component.js";
import * as root from "../client/index.js";
import { BOOKING_STATUSES, bookingStatusValidator, isBookingStatus, type BookingStatus } from "./booking-status.js";
import { bookingHookEventV2 } from "./hook-events-v2.js";

const literals = (validator: { kind: string; members?: Array<{ value?: unknown }> }) =>
  validator.members?.map((member) => member.value);

describe("BOOKING_STATUSES", () => {
  test("the six statuses, in lifecycle order; the validator has one literal each", () => {
    expect(BOOKING_STATUSES).toEqual(["provisional", "pending", "confirmed", "cancelled", "declined", "completed"]);
    expect(literals(bookingStatusValidator)).toEqual([...BOOKING_STATUSES]);
  });

  test("isBookingStatus accepts exactly the set", () => {
    for (const status of BOOKING_STATUSES) expect(isBookingStatus(status)).toBe(true);
    // "rescheduled" was never stored (a moved original is "cancelled"); "" is the history's creation marker.
    for (const other of ["", "rescheduled", "archived", "Confirmed", undefined, null, 1]) {
      expect(isBookingStatus(other)).toBe(false);
    }
  });

  test("the schema, the history and the version 2 payload use it", () => {
    const bookings = schema.tables.bookings.validator.fields;
    const history = schema.tables.booking_history.validator.fields;
    expect(literals(bookings.status)).toEqual([...BOOKING_STATUSES]);
    expect(literals(history.toStatus)).toEqual([...BOOKING_STATUSES]);
    expect(literals(history.fromStatus)).toEqual(["", ...BOOKING_STATUSES]);
    expect(literals(bookingHookEventV2.fields.status)).toEqual([...BOOKING_STATUSES]);
    expect(literals(bookingHookEventV2.fields.previousStatus)).toEqual([...BOOKING_STATUSES]);
  });

  test("the root entry exports the set, its validator and guard", () => {
    expect(root.BOOKING_STATUSES).toBe(BOOKING_STATUSES);
    expect(root.bookingStatusValidator).toBe(bookingStatusValidator);
    expect(root.isBookingStatus).toBe(isBookingStatus);
  });

  test("types: the stored status, the generated API and the hook payload are BookingStatus, not string", () => {
    expectTypeOf<BookingStatus>().toEqualTypeOf<(typeof BOOKING_STATUSES)[number]>();
    expectTypeOf<root.BookingStatus>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<Doc<"bookings">["status"]>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<Doc<"booking_history">["fromStatus"]>().toEqualTypeOf<BookingStatus | "">();
    expectTypeOf<Infer<typeof bookingHookEventV2>["status"]>().toEqualTypeOf<BookingStatus>();

    type Api = ComponentApi;
    type Listed = Awaited<Api["public"]["listBookings"]["_returnType"]>[number];
    expectTypeOf<Listed["status"]>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<Api["public"]["listBookings"]["_args"]["status"]>().toEqualTypeOf<BookingStatus | undefined>();
    expectTypeOf<Api["hooks"]["transitionBookingState"]["_args"]["toStatus"]>().toEqualTypeOf<BookingStatus>();
  });
});
