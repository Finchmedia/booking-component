/// <reference types="vite/client" />
/**
 * F18: listBookings' `limit` bounds the read.
 *
 * The organization, resource and event-type branches collected their whole
 * index range and only then filtered and sliced, so `{ organizationId,
 * limit: 10 }` read the organization's entire history. The event-type branch
 * read `by_event_type`, where dates could not narrow the range at all. With a
 * positive integer limit the branches now stream their range and stop once
 * enough bookings match; `by_event_type_start` narrows the event-type range by
 * date. The output is identical to before for every argument combination,
 * including the order of equal starts (newest-created first, oldest-created
 * first in the event-type branch) and the earlier meaning of 0, negative and
 * fractional limits. Checked here against a copy of the 0.4.2 implementation.
 *
 * Reads are counted with a ctx whose db counts every document a query hands
 * to the handler (collect/take/first/unique and async iteration); the
 * registered query is cross-checked for identical output.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { listBookings } from "./public.js";
import {
  BOOKER, LOCATION, ORG, TUESDAY, book, seedFungibleResource, seedResource, setup, utc, type T,
} from "./setup.test.js";

type Args = {
  organizationId?: string;
  resourceId?: string;
  eventTypeId?: string;
  status?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
};
type Booking = Doc<"bookings">;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = utc("2026-01-01", "10:00");
const STATUSES = ["confirmed", "pending", "cancelled", "provisional", "declined", "completed"];

// ============================================
// Instrumentation
// ============================================

function countingQuery(query: object, count: () => void): object {
  return new Proxy(query, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        if (prop === "collect" || prop === "take") {
          return result.then((docs: unknown[]) => (docs.forEach(count), docs));
        }
        if (prop === "first" || prop === "unique") {
          return result.then((doc: unknown) => (doc && count(), doc));
        }
        if (prop === "next") {
          return result.then((step: IteratorResult<unknown>) => (step.done || count(), step));
        }
        const chained = result && typeof result === "object" && typeof result.then !== "function";
        return chained ? countingQuery(result, count) : result;
      };
    },
  });
}

/** `ctx` whose bookings queries count the documents they hand out. */
function counting(ctx: any): { ctx: any; reads: () => number } {
  let reads = 0;
  const count = () => void reads++;
  const db = new Proxy(ctx.db, {
    get(target, prop) {
      if (prop === "query") return (table: string) => countingQuery(target.query(table), count);
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ctx: { ...ctx, db }, reads: () => reads };
}

const handler = (listBookings as unknown as { _handler: (ctx: any, args: Args) => Promise<Booking[]> })._handler;

async function measured(t: T, args: Args) {
  const { rows, reads } = await t.run(async (ctx) => {
    const counted = counting(ctx);
    return { rows: await handler(counted.ctx, args), reads: counted.reads() };
  });
  // The registered query (validators included) returns the same.
  const registered = await t.query(api.public.listBookings, args);
  expect(rows.map((b) => b.uid)).toEqual(registered.map((b) => b.uid));
  return { uids: rows.map((b) => b.uid), reads };
}

// ============================================
// The 0.4.2 implementation, as the reference
// ============================================

async function listBookingsBefore(ctx: any, args: Args): Promise<Booking[]> {
  let bookings: Booking[];
  const { dateFrom, dateTo } = args;

  if (args.organizationId) {
    const organizationId = args.organizationId;
    bookings = await ctx.db
      .query("bookings")
      .withIndex("by_org_start", (q: any) => {
        const byOrg = q.eq("organizationId", organizationId);
        const from = dateFrom !== undefined ? byOrg.gte("start", dateFrom) : byOrg;
        return dateTo !== undefined ? from.lte("start", dateTo) : from;
      })
      .order("desc")
      .collect();
  } else if (args.resourceId) {
    const resourceId = args.resourceId;
    bookings = await ctx.db
      .query("bookings")
      .withIndex("by_resource_start", (q: any) => {
        const byResource = q.eq("resourceId", resourceId);
        const from = dateFrom !== undefined ? byResource.gte("start", dateFrom) : byResource;
        return dateTo !== undefined ? from.lte("start", dateTo) : from;
      })
      .order("desc")
      .collect();
  } else if (args.eventTypeId) {
    // 0.4.2 read the whole range of `by_event_type` (["eventTypeId"], removed
    // in 0.4.3), which yields creation order: the same rows, from
    // by_event_type_start without a date bound, put back into that order.
    const eventTypeId = args.eventTypeId;
    const rows: Booking[] = await ctx.db
      .query("bookings")
      .withIndex("by_event_type_start", (q: any) => q.eq("eventTypeId", eventTypeId))
      .collect();
    bookings = rows.sort((a, b) => a._creationTime - b._creationTime);
  } else {
    bookings = await ctx.db.query("bookings").order("desc").take(1000);
  }

  if (args.organizationId) bookings = bookings.filter((b) => b.organizationId === args.organizationId);
  if (args.resourceId) bookings = bookings.filter((b) => b.resourceId === args.resourceId);
  if (args.eventTypeId) bookings = bookings.filter((b) => b.eventTypeId === args.eventTypeId);
  if (!args.status) bookings = bookings.filter((b) => b.status !== "provisional");
  if (args.status) bookings = bookings.filter((b) => b.status === args.status);
  if (dateFrom !== undefined) bookings = bookings.filter((b) => b.start >= dateFrom);
  if (dateTo !== undefined) bookings = bookings.filter((b) => b.start <= dateTo);
  bookings.sort((a, b) => b.start - a.start);
  if (args.limit) bookings = bookings.slice(0, args.limit);
  return bookings;
}

/** The selector's index range, newest start first (what the stream walks). */
async function rangeOf(ctx: any, args: Args): Promise<Booking[] | null> {
  const [index, field, value] = args.organizationId
    ? ["by_org_start", "organizationId", args.organizationId]
    : args.resourceId
      ? ["by_resource_start", "resourceId", args.resourceId]
      : args.eventTypeId
        ? ["by_event_type_start", "eventTypeId", args.eventTypeId]
        : [];
  if (!index) return null;
  return await ctx.db
    .query("bookings")
    .withIndex(index, (q: any) => {
      const eq = q.eq(field, value);
      const from = args.dateFrom !== undefined ? eq.gte("start", args.dateFrom) : eq;
      return args.dateTo !== undefined ? from.lte("start", args.dateTo) : from;
    })
    .order("desc")
    .collect();
}

const isStreamed = (args: Args) =>
  args.limit !== undefined && Number.isInteger(args.limit) && args.limit > 0;

/**
 * Documents the stream must read: up to the limit-th match; in the event-type
 * branch up to the first row after that match's start group.
 */
function expectedReads(range: Booking[], allMatches: Booking[], limit: number, oldestFirstTies: boolean) {
  if (allMatches.length < limit) return range.length;
  const cut = allMatches[limit - 1];
  if (!oldestFirstTies) return range.findIndex((b) => b._id === cut._id) + 1;
  const next = range.findIndex((b) => b.start < cut.start);
  return next === -1 ? range.length : next + 1;
}

type Tally = { combos: number; multiRow: number; tiedOutput: number; streamed: number; savedReads: number };

/** Compares new and 0.4.2 output (and stream reads) for every combination. */
async function compareAll(t: T, selectors: Args[], statuses: Array<string | undefined>, dates: Args[], limits: Array<number | undefined>) {
  return await t.run(async (ctx) => {
    const tally: Tally = { combos: 0, multiRow: 0, tiedOutput: 0, streamed: 0, savedReads: 0 };
    for (const selector of selectors) for (const status of statuses) for (const date of dates) for (const limit of limits) {
      const args: Args = { ...selector, ...date, ...(status !== undefined && { status }), ...(limit !== undefined && { limit }) };
      const expected = await listBookingsBefore(ctx, args);
      const counted = counting(ctx);
      const actual = await handler(counted.ctx, args);
      expect(actual.map((b) => b._id), JSON.stringify(args)).toEqual(expected.map((b) => b._id));

      tally.combos++;
      if (expected.length > 1) tally.multiRow++;
      if (new Set(expected.map((b) => b.start)).size < expected.length) tally.tiedOutput++;

      const range = await rangeOf(ctx, args);
      if (range && isStreamed(args)) {
        const allMatches = await listBookingsBefore(ctx, { ...args, limit: undefined });
        const oldestFirstTies = !args.organizationId && !args.resourceId;
        expect(counted.reads(), `reads ${JSON.stringify(args)}`).toBe(
          expectedReads(range, allMatches, args.limit!, oldestFirstTies)
        );
        tally.streamed++;
        if (counted.reads() < range.length) tally.savedReads++;
      }
    }
    return tally;
  });
}

// ============================================
// Fixtures
// ============================================

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function row(uid: string, start: number, over: Partial<Booking> = {}) {
  return {
    resourceId: "res-1", actorId: "a@example.com", start, end: start + HOUR, status: "confirmed", uid,
    eventTypeId: "et-1", organizationId: ORG, timezone: "UTC", bookerName: "A",
    bookerEmail: "a@example.com", eventTitle: "E", location: { type: "address" }, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

/** `n` rows over 8 start values (many ties), random selectors and statuses, in random creation order. */
async function seedRandom(t: T, seed: number, n: number) {
  const random = mulberry32(seed);
  const pick = <V,>(values: V[]) => values[Math.floor(random() * values.length)];
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) {
      const organizationId = pick(["org-1", "org-2", undefined]);
      const { organizationId: _default, ...base } = row(`s${seed}-${i}`, BASE + pick([0, 1, 2, 3, 4, 5, 6, 7]) * HOUR, {
        resourceId: pick(["res-1", "res-2", "pool-1"]),
        eventTypeId: pick(["et-1", "et-2"]),
        status: pick(STATUSES),
      });
      await ctx.db.insert("bookings", organizationId ? { ...base, organizationId } : base);
    }
  });
}

async function insertDaily(t: T, n: number, over: (i: number) => Partial<Booking> = () => ({})) {
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) await ctx.db.insert("bookings", row(`u${i}`, BASE + i * DAY, over(i)));
  });
}

// ============================================
// Tests
// ============================================

describe("listBookings output is unchanged", () => {
  // One backend per seed; every combination runs inside one transaction.
  test.each([11, 29])(
    "randomized (seed %i): every selector × status × dates × limit matches 0.4.2, reads bounded",
    async (seed) => {
      const selectors: Args[] = [
        { organizationId: "org-1" }, { organizationId: "org-2" }, { resourceId: "res-1" }, { resourceId: "pool-1" },
        { eventTypeId: "et-1" }, { eventTypeId: "et-2" }, { organizationId: "org-1", resourceId: "res-2" },
        { organizationId: "org-2", eventTypeId: "et-1" }, { resourceId: "res-1", eventTypeId: "et-2" },
        { organizationId: "", eventTypeId: "et-1" }, {},
      ];
      const statuses = [undefined, "confirmed", "provisional", ""];
      const dates: Args[] = [
        {}, { dateFrom: BASE + 2 * HOUR }, { dateTo: BASE + 5 * HOUR },
        { dateFrom: BASE + 2 * HOUR, dateTo: BASE + 5 * HOUR }, { dateFrom: BASE + 5 * HOUR, dateTo: BASE + 2 * HOUR },
      ];
      const limits = [undefined, 1, 2, 3, 7, 1000, 0, -1, 1.5];

      const { t } = setup();
      await seedRandom(t, seed, 100);
      const tally = await compareAll(t, selectors, statuses, dates, limits);

      expect(tally.combos).toBe(selectors.length * statuses.length * dates.length * limits.length);
      // CONTROLS against vacuity: many multi-row results, equal starts in the
      // output, and the stream both taken and cheaper than the range.
      expect(tally.multiRow).toBeGreaterThan(tally.combos / 3);
      expect(tally.tiedOutput).toBeGreaterThan(tally.combos / 5);
      expect(tally.streamed).toBe(10 * statuses.length * dates.length * 5);
      expect(tally.savedReads).toBeGreaterThan(tally.streamed / 2);

      // Spot check through the registered query.
      for (const args of [{ eventTypeId: "et-1", limit: 3 }, { organizationId: "org-1", status: "", limit: 2 }]) {
        const expected = await t.run(async (ctx) => (await listBookingsBefore(ctx, args)).map((b) => b.uid));
        expect((await t.query(api.public.listBookings, args)).map((b) => b.uid)).toEqual(expected);
      }
    },
    30_000
  );

  test("equal starts at the cut: the event-type branch still returns the oldest-created first", async () => {
    const { t } = setup();
    await insertDaily(t, 3); // u0..u2, one per day
    const newest = BASE + 3 * DAY;
    await t.run(async (ctx) => {
      for (const uid of ["tie-a", "tie-b", "tie-c", "tie-d", "tie-e"]) await ctx.db.insert("bookings", row(uid, newest));
    });

    const byEventType = await measured(t, { eventTypeId: "et-1", limit: 2 });
    expect(byEventType.uids).toEqual(["tie-a", "tie-b"]);
    expect(byEventType.reads).toBe(6); // the whole tie group plus the row after it
    // The organization branch keeps index order: newest-created first, no read-ahead.
    const byOrganization = await measured(t, { organizationId: ORG, limit: 2 });
    expect(byOrganization.uids).toEqual(["tie-e", "tie-d"]);
    expect(byOrganization.reads).toBe(2);
    // CONTROL: the same order without a limit (collect path).
    expect((await measured(t, { eventTypeId: "et-1" })).uids.slice(0, 6)).toEqual([
      "tie-a", "tie-b", "tie-c", "tie-d", "tie-e", "u2",
    ]);
  });

  test("real pool and bundle bookings with equal starts match 0.4.2", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const other = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "res-2", eventTypeId: "et-1" });
    const at = (time: string) => utc(TUESDAY, time);
    const bundle = (resources: Array<{ resourceId: string }>, time: string) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId, resources, start: at(time), end: at(time) + HOUR,
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      });

    await book(t, seed, at("10:00"), at("11:00"));
    await bundle([{ resourceId: "pool-1" }, { resourceId: "res-2" }], "10:00");
    await bundle([{ resourceId: "pool-1" }], "10:00");
    await bundle([{ resourceId: "res-1" }, { resourceId: "pool-1" }], "12:00");
    await t.mutation(api.public.createProvisionalBooking, {
      resourceId: other.resourceId, eventTypeId: other.eventTypeId, start: at("12:00"), end: at("13:00"),
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
    await book(t, other, at("14:00"), at("15:00"));

    const tally = await compareAll(
      t,
      [{ organizationId: ORG }, { resourceId: "res-1" }, { resourceId: "pool-1" }, { resourceId: "res-2" },
        { eventTypeId: "et-1" }, { eventTypeId: "et-2" }, {}],
      [undefined, "provisional", "confirmed"],
      [{}, { dateFrom: at("10:00"), dateTo: at("12:00") }],
      [undefined, 1, 2, 5, 0, -1, 1.5]
    );
    expect(tally.tiedOutput).toBeGreaterThan(0);
    expect(tally.multiRow).toBeGreaterThan(10);
  });
});

describe("listBookings reads", () => {
  test("a limit bounds the read; dates narrow every selector, the event type's included", async () => {
    const { t } = setup();
    const N = 300;
    await insertDaily(t, N, (i) => (i === 7 ? { status: "pending" } : {}));

    for (const selector of [{ organizationId: ORG }, { resourceId: "res-1" }, { eventTypeId: "et-1" }]) {
      const one = await measured(t, { ...selector, limit: 1 });
      expect(one.uids).toEqual([`u${N - 1}`]);
      // The event-type branch reads one row past the match to close its start group.
      expect(one.reads).toBe("eventTypeId" in selector ? 2 : 1);
    }

    // A rare status reads up to its first match: the limit plus the skipped rows.
    const pending = await measured(t, { organizationId: ORG, status: "pending", limit: 1 });
    expect(pending).toEqual({ uids: ["u7"], reads: N - 7 });

    const window = { dateFrom: BASE + 10 * DAY, dateTo: BASE + 11 * DAY };
    for (const selector of [{ organizationId: ORG }, { resourceId: "res-1" }, { eventTypeId: "et-1" }]) {
      const inWindow = await measured(t, { ...selector, ...window });
      expect(inWindow).toEqual({ uids: ["u11", "u10"], reads: 2 });
    }
    expect(await measured(t, { eventTypeId: "et-1", ...window, limit: 1 })).toEqual({ uids: ["u11"], reads: 2 });
  });

  test("unchanged: without a positive integer limit a selector reads its whole range", async () => {
    const { t } = setup();
    const N = 300;
    await insertDaily(t, N);
    for (const limit of [undefined, 0, -1, 1.5]) {
      expect((await measured(t, { organizationId: ORG, limit })).reads).toBe(N);
      expect((await measured(t, { eventTypeId: "et-1", limit })).reads).toBe(N);
    }
    // No selector: the most recently created 1000 rows, whatever the limit.
    expect(await measured(t, { limit: 1 })).toEqual({ uids: [`u${N - 1}`], reads: N });
  });

  test("unchanged: 0 means no limit, a negative limit drops rows from the end, fractions truncate", async () => {
    const { t } = setup();
    await insertDaily(t, 3);
    for (const selector of [{ organizationId: ORG }, { eventTypeId: "et-1" }]) {
      expect((await measured(t, { ...selector, limit: 0 })).uids).toEqual(["u2", "u1", "u0"]);
      expect((await measured(t, { ...selector, limit: -1 })).uids).toEqual(["u2", "u1"]);
      expect((await measured(t, { ...selector, limit: 1.5 })).uids).toEqual(["u2"]);
    }
  });
});

describe("listBookings documented limits", () => {
  test("no selector considers only the 1000 most recently created bookings", async () => {
    const { t } = setup();
    const future = utc("2031-01-01", "10:00"); // after every filler start
    await t.run((ctx) => ctx.db.insert("bookings", row("early", future, { status: "pending" })));
    await insertDaily(t, 999);
    // CONTROL: with 999 newer rows the early booking is still considered.
    expect((await t.query(api.public.listBookings, { status: "pending" })).map((b) => b.uid)).toEqual(["early"]);

    await t.run((ctx) => ctx.db.insert("bookings", row("u999", BASE + 999 * DAY)));
    expect(await t.query(api.public.listBookings, {})).toHaveLength(1000);
    expect(await t.query(api.public.listBookings, { status: "pending" })).toEqual([]);
    // A selector finds it.
    expect(
      (await t.query(api.public.listBookings, { organizationId: ORG, status: "pending", limit: 1 })).map((b) => b.uid)
    ).toEqual(["early"]);
  });

  test("resourceId lists a bundle under its primary resource only, a pool-first bundle included", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });
    await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId: "res-2", eventTypeId: "et-1" });
    const at = (time: string) => utc(TUESDAY, time);
    const bundle = (resources: Array<{ resourceId: string }>, time: string) =>
      t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId, resources, start: at(time), end: at(time) + HOUR,
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
    const poolFirst = await bundle([{ resourceId: "pool-1" }, { resourceId: "res-2" }], "10:00");
    const roomFirst = await bundle([{ resourceId: "res-1" }, { resourceId: "pool-1" }], "12:00");

    for (const limit of [undefined, 5]) {
      const ids = async (resourceId: string) =>
        (await t.query(api.public.listBookings, { resourceId, limit })).map((b) => b._id);
      expect(await ids("pool-1")).toEqual([poolFirst._id]);
      expect(await ids("res-1")).toEqual([roomFirst._id]);
      expect(await ids("res-2")).toEqual([]);
    }
    // CONTROL: both bundles hold their secondary resources.
    const items = await t.query(api.multi_resource.getBookingWithItems, { bookingId: poolFirst._id });
    expect(items?.items.map((item) => item.resourceId)).toEqual(["pool-1", "res-2"]);
  });

  test("deleteEventType still refuses while bookings of the event type exist", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    await t.mutation(api.public.createEventType, {
      id: "et-unused", slug: "et-unused", title: "Unused", lengthInMinutes: 60, timezone: "UTC",
      lockTimeZoneToggle: false, locations: [], organizationId: ORG,
    });
    await book(t, seed, utc(TUESDAY, "10:00"), utc(TUESDAY, "11:00"));
    await expect(t.mutation(api.public.deleteEventType, { id: "et-1" })).rejects.toThrow(
      "Cannot delete event type with existing bookings. Deactivate it instead."
    );
    // CONTROL: an event type without bookings is deleted.
    expect(await t.mutation(api.public.deleteEventType, { id: "et-unused" })).toEqual({ success: true });
  });
});
