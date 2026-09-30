/// <reference types="vite/client" />
/**
 * `rescheduleContext` on getDaySlots and getMonthAvailability (F13, Codex R1).
 *
 * A booker who reschedules holds the booking's uid and management token. With
 * both, the slot queries treat that booking's own slots as free, so a move
 * that overlaps the current time (09:00–10:00 → 09:30–10:30) is offered, as
 * the move mutations already accept it. Without a matching token nothing is
 * excluded and nothing fails: no uid alone, and no credential of one booking,
 * ever frees another booking. `excludeBookingUid` stays for trusted host code;
 * passing both throws. Neither the uid nor the token appears in results or
 * logs.
 */
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { api } from "./_generated/api.js";
import {
  BOOKER,
  LOCATION,
  TUESDAY,
  berlin,
  book,
  seedResource,
  seedResourceWithSchedule,
  setup,
  type SeededSchedule,
  type T,
  type WeeklyHours,
} from "./setup.test.js";

type Context = { uid: string; token: string };
type Extra = { rescheduleContext?: Context; excludeBookingUid?: string };

/** Tuesdays 09:00–10:30 Berlin: on a 30-minute grid the 60-minute starts are 09:00 and 09:30. */
const NARROW: WeeklyHours = [{ dayOfWeek: 2, startTime: "09:00", endTime: "10:30" }];
/** Tuesdays 09:00–12:30 Berlin: starts 09:00 … 11:30. */
const WIDE: WeeklyHours = [{ dayOfWeek: 2, startTime: "09:00", endTime: "12:30" }];

const iso = (time: string) => new Date(berlin(TUESDAY, time)).toISOString();
const hour = (time: string) => [berlin(TUESDAY, time), berlin(TUESDAY, time) + 3_600_000] as const;

function seed(t: T, weeklyHours: WeeklyHours = NARROW, requiresConfirmation?: boolean) {
  return seedResourceWithSchedule(t, { weeklyHours, slotInterval: 30, requiresConfirmation });
}

async function day(t: T, s: SeededSchedule, extra: Extra = {}, resourceId = s.resourceId): Promise<string[]> {
  const slots = await t.query(api.public.getDaySlots, {
    resourceId, date: TUESDAY, eventLength: 60, slotInterval: 30, scheduleId: s.scheduleId, ...extra,
  });
  return slots.map((slot) => slot.time);
}

async function month(t: T, s: SeededSchedule, extra: Extra = {}): Promise<boolean> {
  const days = await t.query(api.public.getMonthAvailability, {
    resourceId: s.resourceId, dateFrom: TUESDAY, dateTo: TUESDAY, eventLength: 60, slotInterval: 30,
    scheduleId: s.scheduleId, ...extra,
  });
  return days[TUESDAY];
}

const contextOf = (booking: { uid: string; managementToken?: string }): Context => ({
  uid: booking.uid,
  token: booking.managementToken!,
});

let t: T;
beforeEach(() => {
  ({ t } = setup());
});

describe("an authorized reschedule", () => {
  test("offers the overlapping moves in the day and month views, and the move is accepted", async () => {
    const s = await seed(t);
    const a = await book(t, s, ...hour("09:00"));
    // CONTROL: the booking's own hour blocks both starts of the day.
    expect(await day(t, s)).toEqual([]);
    expect(await month(t, s)).toBe(false);

    const rescheduleContext = contextOf(a);
    expect(await day(t, s, { rescheduleContext })).toEqual([iso("09:00"), iso("09:30")]);
    expect(await month(t, s, { rescheduleContext })).toBe(true);

    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      ...rescheduleContext, newStart: berlin(TUESDAY, "09:30"), newEnd: berlin(TUESDAY, "10:30"),
    });
    expect(moved).toMatchObject({ status: "confirmed", start: berlin(TUESDAY, "09:30") });
  });

  test("a pending request is excluded like a confirmed booking", async () => {
    const s = await seed(t, NARROW, true);
    const pending = await book(t, s, ...hour("09:00"));
    expect(pending.status).toBe("pending");
    expect(await day(t, s, { rescheduleContext: contextOf(pending) })).toEqual([iso("09:00"), iso("09:30")]);
  });
});

describe("no matching credential: nothing is excluded, and nothing fails", () => {
  test("a wrong token, an unknown uid or a token-less legacy row", async () => {
    const s = await seed(t);
    const a = await book(t, s, ...hour("09:00"));
    const cases: Record<string, Context> = {
      "wrong token": { uid: a.uid, token: "0".repeat(64) },
      "empty token": { uid: a.uid, token: "" },
      "unknown uid": { uid: "bk_unknown", token: a.managementToken! },
    };
    for (const [name, rescheduleContext] of Object.entries(cases)) {
      expect({ name, day: await day(t, s, { rescheduleContext }) }).toEqual({ name, day: [] });
      expect({ name, month: await month(t, s, { rescheduleContext }) }).toEqual({ name, month: false });
    }

    // A legacy createReservation row has no token at all.
    await t.mutation(api.public.cancelBookingByToken, contextOf(a));
    const legacyId = await t.mutation(api.public.createReservation, {
      resourceId: s.resourceId, actorId: BOOKER.email, start: hour("09:00")[0], end: hour("09:00")[1],
    });
    const legacy = (await t.query(api.public.getBooking, { bookingId: legacyId }))!;
    expect(legacy.managementToken).toBeUndefined();
    for (const token of ["", "undefined"]) {
      expect(await day(t, s, { rescheduleContext: { uid: legacy.uid, token } })).toEqual([]);
    }
  });

  test("a cancelled booking's credential does not free the booking that took its slot", async () => {
    const s = await seed(t);
    const a = await book(t, s, ...hour("09:00"));
    await t.mutation(api.public.cancelBookingByToken, contextOf(a));
    await book(t, s, ...hour("09:00"), { booker: { name: "Bea", email: "bea@example.com" } });
    expect(await day(t, s, { rescheduleContext: contextOf(a) })).toEqual([]);
    expect(await month(t, s, { rescheduleContext: contextOf(a) })).toBe(false);
  });

  test("a provisional hold is not rescheduled, so its credential excludes nothing", async () => {
    const s = await seed(t);
    const held = await t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: s.eventTypeId, resourceId: s.resourceId, start: hour("09:00")[0], end: hour("09:00")[1],
      timezone: s.timezone, booker: BOOKER, location: LOCATION,
    });
    expect(held.status).toBe("provisional");
    expect(await day(t, s, { rescheduleContext: contextOf(held) })).toEqual([]);
  });
});

describe("another booking is never excluded", () => {
  test("on the same resource: only the credential's own booking is freed, and mixed credentials free nothing", async () => {
    const s = await seed(t, WIDE);
    const a = await book(t, s, ...hour("09:00"));
    const b = await book(t, s, ...hour("11:00"), { booker: { name: "Bea", email: "bea@example.com" } });
    // CONTROL: A blocks 09:00 and 09:30, B blocks 10:30, 11:00 and 11:30.
    expect(await day(t, s)).toEqual([iso("10:00")]);

    expect(await day(t, s, { rescheduleContext: contextOf(a) })).toEqual([iso("09:00"), iso("09:30"), iso("10:00")]);
    expect(await day(t, s, { rescheduleContext: contextOf(b) })).toEqual([iso("10:00"), iso("10:30"), iso("11:00"), iso("11:30")]);
    for (const rescheduleContext of [
      { uid: a.uid, token: b.managementToken! },
      { uid: b.uid, token: a.managementToken! },
    ]) {
      expect(await day(t, s, { rescheduleContext })).toEqual([iso("10:00")]);
    }
  });

  test("on another resource: a booking there at the same time stays busy", async () => {
    const s = await seed(t);
    const other = await seedResource(t, {
      resourceId: "res-2", eventTypeId: "et-2", scheduleId: s.scheduleId, slotInterval: 30,
    });
    const a = await book(t, s, ...hour("09:00"));
    await book(t, other, ...hour("09:00"), { booker: { name: "Bea", email: "bea@example.com" } });
    // CONTROL: on its own resource the credential frees A.
    expect(await day(t, s, { rescheduleContext: contextOf(a) })).toEqual([iso("09:00"), iso("09:30")]);
    expect(await day(t, s, { rescheduleContext: contextOf(a) }, "res-2")).toEqual([]);
  });

  test("normal creation (no reschedule argument) excludes nothing", async () => {
    const s = await seed(t);
    await book(t, s, ...hour("09:00"));
    expect(await day(t, s, {})).toEqual([]);
    expect(await month(t, s, {})).toBe(false);
  });
});

describe("arguments", () => {
  test("rescheduleContext and excludeBookingUid together throw INVALID_INPUT in both views", async () => {
    const s = await seed(t);
    const a = await book(t, s, ...hour("09:00"));
    const both = { rescheduleContext: contextOf(a), excludeBookingUid: a.uid };
    const message = "Invalid reschedule arguments: pass rescheduleContext or excludeBookingUid, not both";
    await expect(day(t, s, both)).rejects.toMatchObject({ data: { code: "INVALID_INPUT", message } });
    await expect(month(t, s, both)).rejects.toMatchObject({ data: { code: "INVALID_INPUT", message } });
    // CONTROL: each argument alone is accepted and frees the booking.
    expect(await day(t, s, { excludeBookingUid: a.uid })).toEqual([iso("09:00"), iso("09:30")]);
    expect(await day(t, s, { rescheduleContext: contextOf(a) })).toEqual([iso("09:00"), iso("09:30")]);
  });

  describe("the credential is not echoed", () => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    let spies: Array<MockInstance<(...args: unknown[]) => void>>;
    beforeEach(() => {
      spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    });
    afterEach(() => {
      for (const spy of spies) spy.mockRestore();
    });

    test("neither the uid nor the token appears in results or logs", async () => {
      const s = await seed(t);
      const a = await book(t, s, ...hour("09:00"));
      const valid = contextOf(a);
      const results = [
        await day(t, s, { rescheduleContext: valid }),
        await month(t, s, { rescheduleContext: valid }),
        await day(t, s, { rescheduleContext: { uid: a.uid, token: "wrong" } }),
        await month(t, s, { rescheduleContext: { uid: "bk_unknown", token: valid.token } }),
      ];
      // CONTROL: the valid credential took effect.
      expect(results[0]).toHaveLength(2);
      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)));
      for (const text of [JSON.stringify(results), ...logged]) {
        expect(text).not.toContain(valid.token);
        expect(text).not.toContain(valid.uid);
      }
    });
  });
});
