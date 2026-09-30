/// <reference types="vite/client" />
/**
 * F18 / Codex R4: listBookingsPage pages through one organization's,
 * resource's or event type's bookings with cursors.
 *
 * Built on the convex-helpers stream paginator (components cannot use
 * `.paginate()`), whose cursor is the complete index key ([selector, start,
 * _creationTime, _id]). Checked here:
 * - every matching booking appears exactly once, in index order (newest
 *   start first), across page sizes, filters, date windows and read caps,
 *   including equal starts split across a page boundary and equal creation
 *   times;
 * - reads are bounded (1,000 rows, or a lower maximumRowsRead), so filtered
 *   pages come back short or empty with isDone false;
 * - reactive re-runs with `endCursor` keep pages adjacent after inserts and
 *   deletes, and a page split at `splitCursor` covers the same rows;
 * - selector, numItems, maximumRowsRead and cursor validation.
 * The reference is the same index range read with ctx.db and filtered.
 */
import { describe, expect, test, vi } from "vitest";
import { jsonToConvex } from "convex/values";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { listBookingsPage } from "./public.js";
import { BOOKING_STATUSES, type BookingStatus } from "../shared/booking-status.js";
import { ORG, setup, utc, type T } from "./setup.test.js";

type Booking = Doc<"bookings">;
type Selector = { organizationId: string } | { resourceId: string } | { eventTypeId: string };
type Filters = { dateFrom?: number; dateTo?: number; status?: BookingStatus; includeProvisional?: boolean };
type PageArgs = Selector & Filters;
type PageOpts = { numItems: number; cursor: string | null; endCursor?: string | null; maximumRowsRead?: number };
type Page = { page: Booking[]; continueCursor: string; isDone: boolean; pageStatus?: string | null; splitCursor?: string | null };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = utc("2026-01-01", "10:00");

const handler = (listBookingsPage as unknown as {
  _handler: (ctx: QueryCtx, args: PageArgs & { paginationOpts: PageOpts }) => Promise<Page>;
})._handler;

const pageOf = (t: T, args: PageArgs, paginationOpts: PageOpts) =>
  t.query(api.public.listBookingsPage, { ...args, paginationOpts });

/** Every page from the start, following continueCursor until isDone. */
async function walk(
  read: (opts: PageOpts) => Promise<Page>,
  numItems: number,
  maximumRowsRead?: number,
): Promise<Page[]> {
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5_000; i++) {
    const page = await read({ numItems, cursor, ...(maximumRowsRead !== undefined && { maximumRowsRead }) });
    pages.push(page);
    if (page.isDone) return pages;
    cursor = page.continueCursor;
  }
  throw new Error("walk did not finish");
}

const uids = (pages: Page[]) => pages.flatMap((page) => page.page.map((booking) => booking.uid));

/** The selector's index range read directly, newest start first, then the filters. */
async function reference(ctx: QueryCtx, args: PageArgs): Promise<string[]> {
  const [index, field, value] =
    "organizationId" in args
      ? (["by_org_start", "organizationId", args.organizationId] as const)
      : "resourceId" in args
        ? (["by_resource_start", "resourceId", args.resourceId] as const)
        : (["by_eventTypeId_and_start", "eventTypeId", args.eventTypeId] as const);
  const rows: Booking[] = await ctx.db
    .query("bookings")
    .withIndex(index, (q: any) => {
      const eq = q.eq(field, value);
      const from = args.dateFrom !== undefined ? eq.gte("start", args.dateFrom) : eq;
      return args.dateTo !== undefined ? from.lte("start", args.dateTo) : from;
    })
    .order("desc")
    .collect();
  return rows
    .filter((booking) =>
      args.status !== undefined
        ? booking.status === args.status
        : args.includeProvisional === true || booking.status !== "provisional",
    )
    .map((booking) => booking.uid);
}

function row(uid: string, start: number, over: Partial<Booking> = {}) {
  return {
    resourceId: "res-1", actorId: "a@example.com", start, end: start + HOUR, status: "confirmed" as BookingStatus, uid,
    eventTypeId: "et-1", organizationId: ORG, timezone: "UTC", bookerName: "A",
    bookerEmail: "a@example.com", eventTitle: "E", location: { type: "address" }, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` rows over 6 start values (many ties), random selectors and statuses. */
async function seedRandom(t: T, seed: number, n: number) {
  const random = mulberry32(seed);
  const pick = <V,>(values: readonly V[]) => values[Math.floor(random() * values.length)];
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) {
      await ctx.db.insert("bookings", row(`s${i}`, BASE + pick([0, 1, 2, 3, 4, 5]) * HOUR, {
        organizationId: pick(["org-1", "org-2"]),
        resourceId: pick(["res-1", "res-2"]),
        eventTypeId: pick(["et-1", "et-2"]),
        status: pick(BOOKING_STATUSES),
      }));
    }
  });
}

async function insertDaily(t: T, n: number, over: (i: number) => Partial<Booking> = () => ({})) {
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) await ctx.db.insert("bookings", row(`u${i}`, BASE + i * DAY, over(i)));
  });
}

describe("listBookingsPage: every matching booking exactly once", () => {
  test("randomized: selectors × filters × dates × page sizes × read caps match the index range", async () => {
    const { t } = setup();
    await seedRandom(t, 7, 90);
    const selectors: Selector[] = [{ organizationId: "org-1" }, { resourceId: "res-2" }, { eventTypeId: "et-1" }];
    const filters: Filters[] = [{}, { includeProvisional: true }, { status: "confirmed" }, { status: "provisional" }];
    const dates: Filters[] = [{}, { dateFrom: BASE + HOUR, dateTo: BASE + 4 * HOUR }];
    const sizes = [1, 4, 50];
    const caps = [undefined, 5];

    const tally = await t.run(async (ctx) => {
      const tally = { walks: 0, multiPage: 0, shortPages: 0, tiedBoundaries: 0 };
      for (const selector of selectors) for (const filter of filters) for (const date of dates) {
        const args: PageArgs = { ...selector, ...filter, ...date };
        const expected = await reference(ctx, args);
        for (const numItems of sizes) for (const cap of caps) {
          const pages = await walk((paginationOpts) => handler(ctx, { ...args, paginationOpts }), numItems, cap);
          const label = JSON.stringify({ args, numItems, cap });
          expect(uids(pages), label).toEqual(expected);
          for (const page of pages) expect(page.page.length, label).toBeLessThanOrEqual(numItems);
          tally.walks++;
          if (pages.length > 2) tally.multiPage++;
          tally.shortPages += pages.filter((page) => !page.isDone && page.page.length < numItems).length;
          for (let i = 1; i < pages.length; i++) {
            const last = pages[i - 1].page[pages[i - 1].page.length - 1];
            const first = pages[i].page[0];
            if (last && first && last.start === first.start) tally.tiedBoundaries++;
          }
        }
      }
      return tally;
    });
    // CONTROLS against vacuity: many walks span pages, filtered pages come
    // back short, and tie groups are split across page boundaries.
    expect(tally.walks).toBe(selectors.length * filters.length * dates.length * sizes.length * caps.length);
    expect(tally.multiPage).toBeGreaterThan(tally.walks / 2);
    expect(tally.shortPages).toBeGreaterThan(0);
    expect(tally.tiedBoundaries).toBeGreaterThan(10);

    // Spot check through the registered query (validators included).
    const args: PageArgs = { organizationId: "org-1", status: "pending" };
    const expected = await t.run((ctx) => reference(ctx, args));
    expect(expected.length).toBeGreaterThan(3);
    expect(uids(await walk((opts) => pageOf(t, args, opts), 2))).toEqual(expected);
  }, 30_000);

  test("equal creation times inside a tie group of equal starts: neither skipped nor repeated", async () => {
    // Far enough in the future that convex-test's creation-time bump rounds
    // away: rows inserted at one instant share a _creationTime, as imported
    // rows can in production.
    const TIED_NOW = Date.UTC(2600, 0, 1);
    const { t } = setup({ now: TIED_NOW });
    await t.run(async (ctx) => {
      for (let i = 0; i < 6; i++) await ctx.db.insert("bookings", row(`tie-${i}`, BASE));
    });
    vi.setSystemTime(TIED_NOW + 1_000);
    await t.run(async (ctx) => {
      await ctx.db.insert("bookings", row("later-start", BASE + HOUR));
      await ctx.db.insert("bookings", row("same-start", BASE));
    });
    const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
    // CONTROL: one group of six with equal start and creation time.
    const tied = rows.filter((booking) => booking.uid.startsWith("tie-"));
    expect(new Set(tied.map((booking) => `${booking.start}/${booking._creationTime}`)).size).toBe(1);

    const expected = await t.run((ctx) => reference(ctx, { organizationId: ORG }));
    expect(expected).toHaveLength(8);
    for (const numItems of [1, 2, 4]) {
      expect(uids(await walk((opts) => pageOf(t, { organizationId: ORG }, opts), numItems))).toEqual(expected);
    }
  });
});

describe("listBookingsPage: bounded reads", () => {
  test("a page reads at most 1,000 rows; a far-future booking created first comes first", async () => {
    const { t } = setup();
    const future = utc("2031-01-01", "10:00");
    await t.run((ctx) => ctx.db.insert("bookings", row("early", future, { status: "pending" })));
    await insertDaily(t, 1_050, (i) => (i === 0 ? { status: "pending" } : {}));
    const args: PageArgs = { organizationId: ORG, status: "pending" };

    const first = await pageOf(t, args, { numItems: 5, cursor: null });
    // "early" starts last, so it is the first row read; then 999 confirmed rows.
    expect(first.page.map((booking) => booking.uid)).toEqual(["early"]);
    expect(first).toMatchObject({ isDone: false, pageStatus: "SplitRequired" });
    const range = await t.run(async (ctx) =>
      ctx.db.query("bookings").withIndex("by_org_start", (q) => q.eq("organizationId", ORG)).order("desc").collect(),
    );
    const key = jsonToConvex(JSON.parse(first.continueCursor)) as unknown[];
    expect(key).toEqual([ORG, range[999].start, range[999]._creationTime, range[999]._id]);

    const rest = await walk(async (opts) => pageOf(t, args, { ...opts, cursor: opts.cursor ?? first.continueCursor }), 5);
    expect(uids(rest)).toEqual(["u0"]);
    // CONTROL: listBookings without a selector misses "early" (its 1,000 newest-created cap).
    expect(await t.query(api.public.listBookings, { status: "pending" })).toEqual([]);
  }, 30_000);

  test("maximumRowsRead lowers the cap; a split page covers the same rows", async () => {
    const { t } = setup();
    await insertDaily(t, 20, (i) => (i % 4 === 0 ? { status: "pending" } : {}));
    const args: PageArgs = { resourceId: "res-1", status: "pending" };

    const capped = await pageOf(t, args, { numItems: 10, cursor: null, maximumRowsRead: 6 });
    // u19..u14 read: u16 is the only pending one.
    expect(capped.page.map((booking) => booking.uid)).toEqual(["u16"]);
    expect(capped).toMatchObject({ isDone: false, pageStatus: "SplitRequired" });
    expect(capped.splitCursor).toEqual(expect.any(String));

    const head = await pageOf(t, args, { numItems: 10, cursor: null, endCursor: capped.splitCursor });
    const tail = await pageOf(t, args, { numItems: 10, cursor: capped.splitCursor!, endCursor: capped.continueCursor });
    expect([...head.page, ...tail.page].map((booking) => booking.uid)).toEqual(["u16"]);
    expect(head.continueCursor).toBe(capped.splitCursor);
    expect(tail.continueCursor).toBe(capped.continueCursor);

    // A caller's larger cap is clamped to 1,000, not rejected.
    const all = await walk((opts) => pageOf(t, args, { ...opts, maximumRowsRead: 5_000 }), 50);
    expect(uids(all)).toEqual(["u16", "u12", "u8", "u4", "u0"]);
  });
});

describe("listBookingsPage: reactive pages stay adjacent", () => {
  test("re-running a page with endCursor keeps inserts and deletes inside it; without it a row is lost", async () => {
    const { t } = setup();
    await insertDaily(t, 6); // u5..u0, newest start first
    const args: PageArgs = { eventTypeId: "et-1" };
    const first = await pageOf(t, args, { numItems: 3, cursor: null });
    expect(first.page.map((booking) => booking.uid)).toEqual(["u5", "u4", "u3"]);

    const u4 = first.page[1];
    await t.run(async (ctx) => {
      await ctx.db.insert("bookings", row("late-1", u4.start + HOUR));
      await ctx.db.insert("bookings", row("late-2", u4.start - HOUR));
      const u5 = first.page[0];
      await ctx.db.delete(u5._id);
    });

    const rerun = await pageOf(t, args, { numItems: 3, cursor: null, endCursor: first.continueCursor });
    expect(rerun.page.map((booking) => booking.uid)).toEqual(["late-1", "u4", "late-2", "u3"]);
    expect(rerun.continueCursor).toBe(first.continueCursor);
    const second = await walk(async (opts) => pageOf(t, args, { ...opts, cursor: opts.cursor ?? first.continueCursor }), 3);
    expect(uids([rerun, ...second])).toEqual(["late-1", "u4", "late-2", "u3", "u2", "u1", "u0"]);

    // CONTROL: the same re-run without endCursor ends earlier, and u3 falls
    // between it and the unchanged second page.
    const withoutEnd = await pageOf(t, args, { numItems: 3, cursor: null });
    expect(withoutEnd.page.map((booking) => booking.uid)).toEqual(["late-1", "u4", "late-2"]);
    expect(uids(second)).not.toContain("u3");
  });
});

describe("listBookingsPage: arguments", () => {
  test("exactly one non-empty selector", async () => {
    const { t } = setup();
    const message = "listBookingsPage needs exactly one of organizationId, resourceId or eventTypeId";
    const opts = { numItems: 5, cursor: null };
    for (const selector of [{}, { organizationId: ORG, resourceId: "res-1" }, { organizationId: "" }, { resourceId: "", eventTypeId: "et-1" }]) {
      await expect(
        t.query(api.public.listBookingsPage, { ...selector, paginationOpts: opts }),
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT", message } });
    }
    // CONTROL: each selector alone works.
    for (const selector of [{ organizationId: ORG }, { resourceId: "res-1" }, { eventTypeId: "et-1" }]) {
      expect(await t.query(api.public.listBookingsPage, { ...selector, paginationOpts: opts })).toMatchObject({ page: [], isDone: true });
    }
  });

  test("numItems and maximumRowsRead are positive integers", async () => {
    const { t } = setup();
    await insertDaily(t, 2);
    for (const numItems of [0, -1, 1.5, Number.NaN]) {
      await expect(pageOf(t, { organizationId: ORG }, { numItems, cursor: null })).rejects.toMatchObject({
        data: { code: "INVALID_INPUT", message: `Invalid numItems ${numItems}: expected a positive integer` },
      });
    }
    for (const maximumRowsRead of [0, -5, 2.5]) {
      await expect(pageOf(t, { organizationId: ORG }, { numItems: 1, cursor: null, maximumRowsRead })).rejects.toMatchObject({
        data: { code: "INVALID_INPUT", message: `Invalid maximumRowsRead ${maximumRowsRead}: expected a positive integer` },
      });
    }
    // CONTROL
    expect((await pageOf(t, { organizationId: ORG }, { numItems: 1, cursor: null, maximumRowsRead: 1 })).page).toHaveLength(1);
  });

  test("a cursor of another selector, or one it did not issue, is rejected; \"[]\" is the end", async () => {
    const { t } = setup();
    await insertDaily(t, 3);
    const byOrg = await pageOf(t, { organizationId: ORG }, { numItems: 1, cursor: null });
    expect(byOrg.isDone).toBe(false);
    const invalid = { data: { code: "INVALID_INPUT", message: "Invalid listBookingsPage cursor" } };
    for (const selector of [{ resourceId: "res-1" }, { eventTypeId: "et-1" }, { organizationId: "org-2" }]) {
      await expect(pageOf(t, selector, { numItems: 1, cursor: byOrg.continueCursor })).rejects.toMatchObject(invalid);
      await expect(pageOf(t, selector, { numItems: 1, cursor: null, endCursor: byOrg.continueCursor })).rejects.toMatchObject(invalid);
    }
    for (const cursor of ["", "nope", "[1]", '{"a":1}', JSON.stringify([ORG, 1, 2])]) {
      await expect(pageOf(t, { organizationId: ORG }, { numItems: 1, cursor })).rejects.toMatchObject(invalid);
    }
    // CONTROLS: the issuing selector continues; the final cursor reads nothing more.
    const next = await pageOf(t, { organizationId: ORG }, { numItems: 5, cursor: byOrg.continueCursor });
    expect(next.page.map((booking) => booking.uid)).toEqual(["u1", "u0"]);
    expect(next.isDone).toBe(true);
    expect(await pageOf(t, { organizationId: ORG }, { numItems: 5, cursor: next.continueCursor })).toMatchObject({
      page: [], isDone: true,
    });
  });

  test("an id ending in \"undefined\" pages normally (the helper escapes it in the cursor)", async () => {
    const { t } = setup();
    await insertDaily(t, 3, () => ({ organizationId: "org-undefined" }));
    const pages = await walk((opts) => pageOf(t, { organizationId: "org-undefined" }, opts), 1);
    expect(uids(pages)).toEqual(["u2", "u1", "u0"]);
  });
});
