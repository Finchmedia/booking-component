/// <reference types="vite/client" />
/**
 * New bookings need a time zone Intl accepts and a booker address that
 * passes the syntax screen of the built-in mail (N4, N5; D15(b), plan
 * PR-55). createBooking, createProvisionalBooking and
 * createMultiResourceBooking reject anything else with INVALID_INPUT before
 * any other check and write nothing: no booking, no reserved slot, no hook
 * job. Whether the address belongs to the booker stays host policy. Bookings
 * stored before 0.5.0 with such values keep working (their mail renders in
 * UTC or is skipped; see src/client/email-delivery-robustness.test.ts).
 */
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api.js";
import type { BookingErrorData } from "../shared/booking-errors.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  getBusySlots,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

const START = utc(TUESDAY, "10:00");
const END = utc(TUESDAY, "11:00");

type Details = { timezone: string; email: string; laterHours?: number };

/** The three creation paths, each for the seeded resource at 10:00–11:00 UTC (plus `laterHours`). */
function creators(t: T, seed: { eventTypeId: string; resourceId: string }) {
  const range = (laterHours = 0) => ({ start: START + laterHours * 3_600_000, end: END + laterHours * 3_600_000 });
  const single = ({ timezone, email, laterHours }: Details) => ({
    eventTypeId: seed.eventTypeId,
    resourceId: seed.resourceId,
    ...range(laterHours),
    timezone,
    booker: { ...BOOKER, email },
    location: LOCATION,
  });
  return {
    createBooking: (details: Details) => t.mutation(api.public.createBooking, single(details)),
    createProvisionalBooking: (details: Details) => t.mutation(api.public.createProvisionalBooking, single(details)),
    createMultiResourceBooking: ({ timezone, email, laterHours }: Details) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId,
        resources: [{ resourceId: seed.resourceId }],
        ...range(laterHours),
        timezone,
        booker: { ...BOOKER, email },
      }),
  };
}

async function rejection(call: Promise<unknown>): Promise<BookingErrorData> {
  const error = await call.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<BookingErrorData>).data;
}

/** Nothing was written: no booking, no slot, no scheduled hook or mail job. */
async function expectNothingWritten(t: T, resourceId: string) {
  expect(await t.query(api.public.listBookings, {})).toEqual([]);
  expect(await getBusySlots(t, resourceId, TUESDAY)).toBeNull();
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  expect(jobs).toEqual([]);
}

const BAD_ZONES = ["Not/AZone", "", "UTC+2", "europe/berlin "];
const BAD_EMAILS = ["x@", "ada", "", "a@b", "ada@example..com", " ada@example.com", "Ada <ada@example.com>", "a b@example.com"];

describe("booking time zone (N4)", () => {
  test.each(BAD_ZONES)("%j is rejected on every creation path and nothing is written", async (timezone) => {
    const { t } = setup();
    const seed = await seedResource(t);
    for (const [name, create] of Object.entries(creators(t, seed))) {
      expect(await rejection(create({ timezone, email: BOOKER.email })), name).toEqual({
        code: "INVALID_INPUT",
        message: `Invalid time zone "${timezone}": expected an IANA time zone such as "Europe/Berlin"`,
      });
    }
    await expectNothingWritten(t, seed.resourceId);
  });

  test("CONTROL: IANA zones and UTC are accepted and stored as given", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const create = creators(t, seed);
    const bookings = [
      await create.createBooking({ timezone: "UTC", email: BOOKER.email }),
      await create.createProvisionalBooking({ timezone: "Europe/Berlin", email: BOOKER.email, laterHours: 1 }),
      await create.createMultiResourceBooking({ timezone: "America/Argentina/Buenos_Aires", email: BOOKER.email, laterHours: 2 }),
    ];
    expect(bookings.map((booking) => booking.timezone)).toEqual(["UTC", "Europe/Berlin", "America/Argentina/Buenos_Aires"]);
  });
});

describe("booker email syntax (N5)", () => {
  test.each(BAD_EMAILS)("%j is rejected on every creation path, not echoed, and nothing is written", async (email) => {
    const { t } = setup();
    const seed = await seedResource(t);
    for (const [name, create] of Object.entries(creators(t, seed))) {
      const data = await rejection(create({ timezone: "UTC", email }));
      expect(data, name).toEqual({
        code: "INVALID_INPUT",
        message: "Invalid booker email: expected an address such as name@example.com",
      });
    }
    await expectNothingWritten(t, seed.resourceId);
  });

  test("CONTROL: plus-addresses, subdomains and internationalized domains are accepted", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const emails = ["a+b@sub.example.co.uk", "jürgen@bücher.example", "first.last@example.io"];
    for (const [i, email] of emails.entries()) {
      const start = START + i * 2 * 3_600_000;
      const booking = await t.mutation(api.public.createBooking, {
        eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start, end: start + 3_600_000,
        timezone: "UTC", booker: { ...BOOKER, email }, location: LOCATION,
      });
      expect(booking.bookerEmail).toBe(email);
    }
  });

  test("the checks run before the booking rules and the slot check", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await creators(t, seed).createBooking({ timezone: "UTC", email: BOOKER.email }); // the slot is taken
    const taken = creators(t, seed);
    for (const [name, create] of Object.entries(taken)) {
      expect((await rejection(create({ timezone: "UTC", email: "ada" }))).code, name).toBe("INVALID_INPUT");
      // CONTROL: with valid details, the taken slot is the failure.
      expect((await rejection(create({ timezone: "UTC", email: BOOKER.email }))).code, name).toBe("SLOT_UNAVAILABLE");
    }
    await expect(
      t.mutation(api.public.createBooking, {
        eventTypeId: "ghost", resourceId: "ghost", start: START, end: START, timezone: "Nowhere", booker: BOOKER, location: LOCATION,
      })
    ).rejects.toThrow('Invalid time zone "Nowhere"');
  });
});
