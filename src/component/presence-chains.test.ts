/**
 * Presence cleanup chains (F15, N21) and the orphan sweep.
 *
 * Invariant: every presence marker (`presence_heartbeats` row) has exactly one
 * pending `presence:cleanup` job, the one its `markAsGone` names, and a key
 * without a marker has none.
 *
 * The clock moves in one-second steps and due jobs run after each step, so a
 * cleanup fires 10 s after it was scheduled; holds heartbeat every 5 s like
 * useSlotHold. Presence keys are UTC ISO strings, so the process time zone
 * does not matter.
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import schema from "./schema.js";
import {
  book,
  berlin,
  modules,
  seedResourceWithSchedule,
  setup,
  TUESDAY,
  type T,
} from "./setup.test.js";

const ROOM = "room-1";
const OTHER_ROOM = "room-2";
const SLOT = `${TUESDAY}T10:00:00.000Z`;
const TIMEOUT_MS = 10_000; // presence.ts TIMEOUT_MS

type Hold = { resourceId: string; slots: string[]; user: string };
type Key = { resourceId: string; slot: string; user: string };

function hold(user: string, resourceId = ROOM, slots = [SLOT]): Hold {
  return { resourceId, slots, user };
}

/** The 15-minute quanta a selection of `minutes` starting at `start` holds (as useSlotHold sends them). */
function quanta(start: string, minutes: number): string[] {
  return Array.from({ length: Math.ceil(minutes / 15) }, (_, i) =>
    new Date(Date.parse(start) + i * 15 * 60_000).toISOString()
  );
}

async function snapshot(t: T) {
  return t.run(async (ctx) => ({
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    markers: await ctx.db.query("presence_heartbeats").collect(),
    presence: await ctx.db.query("presence").collect(),
  }));
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
type Job = Snapshot["jobs"][number];

const keyOf = (key: Key) => `${key.resourceId}|${key.user}|${key.slot}`;

function pendingCleanups(s: Snapshot, key?: Key): Job[] {
  return s.jobs.filter(
    (job) =>
      job.name === "presence:cleanup" &&
      job.state.kind === "pending" &&
      (!key || keyOf(job.args[0] as Key) === keyOf(key))
  );
}

/** Keys that break the invariant, e.g. `room-1|ada|… : 2 pending, 1 marker`. */
function invariantViolations(s: Snapshot): string[] {
  const keys = new Map<string, Key>();
  for (const marker of s.markers) keys.set(keyOf(marker), marker);
  for (const job of pendingCleanups(s)) keys.set(keyOf(job.args[0] as Key), job.args[0] as Key);
  const violations: string[] = [];
  for (const [id, key] of keys) {
    const pending = pendingCleanups(s, key);
    const markers = s.markers.filter((marker) => keyOf(marker) === id);
    const ok =
      markers.length === 0
        ? pending.length === 0
        : markers.length === 1 && pending.length === 1 && pending[0]._id === markers[0].markAsGone;
    if (!ok) violations.push(`${id}: ${pending.length} pending, ${markers.length} marker`);
  }
  return violations;
}

/** Moves the clock `seconds` one second at a time, running due jobs after each step. */
async function advance(t: T, seconds: number, onSecond?: (second: number) => Promise<void>) {
  for (let second = 1; second <= seconds; second++) {
    vi.advanceTimersByTime(1000);
    await t.finishInProgressScheduledFunctions();
    if (onSecond) await onSecond(second);
  }
}

/** `advance` with a heartbeat for every hold every 5 s. */
async function keepAlive(t: T, holds: Hold[], seconds: number) {
  await advance(t, seconds, async (second) => {
    if (second % 5 === 0) for (const h of holds) await t.mutation(api.presence.heartbeat, h);
  });
}

type EndState = "canceled" | "failed" | "success";

/**
 * Makes a marker name a job that can no longer run (N21 needs an external
 * failure): its pending job is cancelled, and for "failed" / "success" the
 * marker is pointed at a cleanup job that ended that way. Returns that job.
 */
async function orphanMarker(t: T, key: Key, end: EndState): Promise<Id<"_scheduled_functions">> {
  const named = await t.run(async (ctx) => {
    const marker = (await ctx.db.query("presence_heartbeats").collect()).find(
      (row) => keyOf(row) === keyOf(key)
    )!;
    await ctx.scheduler.cancel(marker.markAsGone);
    if (end === "canceled") return marker.markAsGone;
    // Legacy args that no longer validate fail the job; a key without rows
    // lets it finish without doing anything.
    const endedArgs = end === "failed" ? ({} as Key) : { ...key, user: "nobody" };
    const job = await ctx.scheduler.runAfter(0, internal.presence.cleanup, endedArgs);
    await ctx.db.patch(marker._id, { markAsGone: job });
    return job;
  });
  if (end !== "canceled") {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await advance(t, 1);
    logged.mockRestore();
  }
  const job = await t.run((ctx) => ctx.db.system.get(named));
  expect(job?.state.kind).toBe(end);
  return named;
}

// ============================================
// F15: leave/rejoin no longer multiplies chains
// ============================================

describe("presence chains: one pending cleanup per marker (F15)", () => {
  test("the audit case: five leave/rejoin cycles leave one pending cleanup for three rounds", async () => {
    const { t } = setup();
    const ada = hold("ada");
    await t.mutation(api.presence.heartbeat, ada);
    for (let cycle = 0; cycle < 5; cycle++) {
      await t.mutation(api.presence.leave, ada);
      await t.mutation(api.presence.heartbeat, ada);
    }

    let s = await snapshot(t);
    // CONTROL: the five left jobs exist and were cancelled, not merely absent.
    expect(s.jobs.filter((job) => job.state.kind === "canceled")).toHaveLength(5);
    expect(pendingCleanups(s)).toHaveLength(1);
    expect(s.markers).toHaveLength(1);
    expect(s.markers[0].markAsGone).toBe(pendingCleanups(s)[0]._id);

    let named = s.markers[0].markAsGone;
    for (let round = 1; round <= 3; round++) {
      await keepAlive(t, [ada], 10);
      s = await snapshot(t);
      expect(pendingCleanups(s)).toHaveLength(1);
      expect(s.markers).toHaveLength(1);
      expect(s.markers[0].markAsGone).toBe(pendingCleanups(s)[0]._id);
      // CONTROL: the chain really fired and rescheduled itself this round.
      expect(s.markers[0].markAsGone).not.toBe(named);
      named = s.markers[0].markAsGone;
    }

    await advance(t, 25); // heartbeats stop
    s = await snapshot(t);
    expect(pendingCleanups(s)).toEqual([]);
    expect(s.presence).toEqual([]);
    expect(s.markers).toEqual([]);
  });

  // Call orders recorded with the real useMutation and BookingProvider in the
  // verification (R1–R4, B1) and the third-party leave (U5), replayed here.
  const at = (time: string, minutes: number): Hold => ({
    resourceId: ROOM,
    user: "s1",
    slots: quanta(`${TUESDAY}T${time}:00.000Z`, minutes),
  });
  test.each<[string, (t: T) => Promise<Hold>]>([
    [
      "slot switch 10:00 → 10:15 at 60 min (3 shared quanta)",
      async (t) => {
        await t.mutation(api.presence.heartbeat, at("10:00", 60));
        await keepAlive(t, [at("10:00", 60)], 5);
        await t.mutation(api.presence.leave, at("10:00", 60));
        await t.mutation(api.presence.heartbeat, at("10:15", 60));
        return at("10:15", 60);
      },
    ],
    [
      "duration change 30 → 60 min on the same slot",
      async (t) => {
        await t.mutation(api.presence.heartbeat, at("10:00", 30));
        await t.mutation(api.presence.leave, at("10:00", 30));
        await t.mutation(api.presence.heartbeat, at("10:00", 60));
        return at("10:00", 60);
      },
    ],
    [
      "StrictMode double effect (heartbeat, leave, heartbeat)",
      async (t) => {
        for (const call of [api.presence.heartbeat, api.presence.leave, api.presence.heartbeat]) {
          await t.mutation(call, at("10:00", 60));
        }
        return at("10:00", 60);
      },
    ],
    [
      "Back and reselect after 3 s",
      async (t) => {
        await t.mutation(api.presence.heartbeat, at("10:00", 30));
        await advance(t, 1);
        await t.mutation(api.presence.leave, at("10:00", 30));
        await advance(t, 3);
        await t.mutation(api.presence.heartbeat, at("10:00", 30));
        return at("10:00", 30);
      },
    ],
    [
      "a third party leaves the hold, the owner heartbeats again",
      async (t) => {
        await t.mutation(api.presence.heartbeat, at("10:00", 15));
        await t.mutation(api.presence.leave, at("10:00", 15));
        await t.mutation(api.presence.heartbeat, at("10:00", 15));
        return at("10:00", 15);
      },
    ],
  ])("UI sequence: %s", async (_name, replay) => {
    const { t } = setup();
    const last = await replay(t);
    await keepAlive(t, [last], 20);

    const s = await snapshot(t);
    expect(invariantViolations(s)).toEqual([]);
    expect(s.markers).toHaveLength(last.slots.length);
    expect(pendingCleanups(s)).toHaveLength(last.slots.length);
  });

  test.each([0x5eed1234, 0x0badcafe, 0x13572468])(
    "seeded random heartbeats, leaves and waits (seed %i): the invariant holds after every step",
    async (seed) => {
      const { t } = setup();
      let state = seed;
      const random = () => {
        // mulberry32
        state = (state + 0x6d2b79f5) | 0;
        let x = Math.imul(state ^ (state >>> 15), 1 | state);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
      const holds = [hold("a"), hold("b"), hold("a", OTHER_ROOM)];
      const keyFor = (h: Hold): Key => ({ resourceId: h.resourceId, slot: h.slots[0], user: h.user });

      // CONTROL counters: the walk must hit the F15 trigger and let holds expire.
      let rejoinsBeforeLeftJobDue = 0;
      let expiries = 0;
      const leftJobDue = new Map<string, number>();
      const violations: string[] = [];

      for (let step = 0; step < 300; step++) {
        const roll = random();
        const h = holds[Math.floor(random() * holds.length)];
        const id = keyOf(keyFor(h));
        const before = await snapshot(t);
        if (roll < 0.45) {
          const due = leftJobDue.get(id);
          if (due !== undefined && Date.now() < due) rejoinsBeforeLeftJobDue++;
          leftJobDue.delete(id);
          await t.mutation(api.presence.heartbeat, h);
        } else if (roll < 0.7) {
          const marker = before.markers.find((row) => keyOf(row) === id);
          const job = marker && before.jobs.find((row) => row._id === marker.markAsGone);
          if (job) leftJobDue.set(id, job.scheduledTime);
          await t.mutation(api.presence.leave, h);
        } else {
          await advance(t, 1 + Math.floor(random() * 7));
        }
        const after = await snapshot(t);
        if (roll >= 0.7) expiries += before.markers.length - after.markers.length;
        violations.push(...invariantViolations(after).map((v) => `step ${step}: ${v}`));
      }

      expect(violations).toEqual([]);
      expect(rejoinsBeforeLeftJobDue).toBeGreaterThanOrEqual(10);
      expect(expiries).toBeGreaterThanOrEqual(5);
    }
  );

  test("leave cancels only its own key's job; other users and resources keep theirs", async () => {
    const { t } = setup();
    const ada = hold("ada");
    const bob = hold("bob");
    const adaElsewhere = hold("ada", OTHER_ROOM);
    for (const h of [ada, bob, adaElsewhere]) await t.mutation(api.presence.heartbeat, h);
    const before = await snapshot(t);
    const namedFor = (s: Snapshot, h: Hold) =>
      s.markers.find((row) => row.user === h.user && row.resourceId === h.resourceId)!.markAsGone;

    await t.mutation(api.presence.leave, ada);
    const afterLeave = await snapshot(t);
    expect(afterLeave.jobs.find((job) => job._id === namedFor(before, ada))?.state.kind).toBe(
      "canceled"
    );
    for (const other of [bob, adaElsewhere]) {
      expect(namedFor(afterLeave, other)).toBe(namedFor(before, other));
      expect(afterLeave.jobs.find((job) => job._id === namedFor(before, other))?.state.kind).toBe(
        "pending"
      );
    }

    await t.mutation(api.presence.heartbeat, ada);
    await keepAlive(t, [ada, bob, adaElsewhere], 20);
    const s = await snapshot(t);
    expect(invariantViolations(s)).toEqual([]);
    expect(s.markers).toHaveLength(3);
    expect(pendingCleanups(s)).toHaveLength(3);
  });

  test("an abandoned hold is released 10–20 s after its last heartbeat and schedules nothing afterwards", async () => {
    const { t } = setup();
    const ada = hold("ada");
    await t.mutation(api.presence.heartbeat, ada);
    const lastHeartbeat = 13; // out of phase with the chain (fires at 10, 20, 30 …)
    let releasedAt = -1;
    await advance(t, 60, async (second) => {
      if (second <= lastHeartbeat && second % 3 === 1) await t.mutation(api.presence.heartbeat, ada);
      if (releasedAt < 0 && (await snapshot(t)).presence.length === 0) releasedAt = second;
    });

    const delay = releasedAt - lastHeartbeat;
    expect(delay).toBeGreaterThan(TIMEOUT_MS / 1000);
    expect(delay).toBeLessThanOrEqual((2 * TIMEOUT_MS) / 1000);
    const s = await snapshot(t);
    expect(s.markers).toEqual([]);
    expect(pendingCleanups(s)).toEqual([]);

    // Nothing is scheduled once the hold is gone.
    await advance(t, 60);
    expect((await snapshot(t)).jobs).toHaveLength(s.jobs.length);
  });

  test("jobs queued by 0.4.2 (surplus chains) never grow and all end once heartbeats stop", async () => {
    const { t } = setup();
    const key: Key = { resourceId: ROOM, slot: SLOT, user: "ada" };
    const ada = hold("ada");
    // The 0.4.2 state after five leave/rejoin cycles: six queued jobs with the
    // unchanged cleanup args, the marker naming the last one.
    await t.run(async (ctx) => {
      await ctx.db.insert("presence", { ...key, updated: Date.now() });
      let last: Id<"_scheduled_functions"> | undefined;
      for (let i = 0; i < 6; i++) {
        last = await ctx.scheduler.runAfter(TIMEOUT_MS, internal.presence.cleanup, key);
      }
      await ctx.db.insert("presence_heartbeats", { ...key, markAsGone: last! });
    });

    let most = 0;
    const count = async () => {
      most = Math.max(most, pendingCleanups(await snapshot(t)).length);
    };
    await advance(t, 30, async (second) => {
      if (second % 5 === 0) await t.mutation(api.presence.heartbeat, ada);
      if (second === 17) {
        await t.mutation(api.presence.leave, ada);
        await t.mutation(api.presence.heartbeat, ada);
      }
      await count();
    });
    // CONTROL: the surplus chains stayed alive while the session did.
    expect(pendingCleanups(await snapshot(t))).toHaveLength(6);
    expect(most).toBe(6);

    await advance(t, 25, count);
    const s = await snapshot(t);
    expect(most).toBe(6);
    expect(pendingCleanups(s)).toEqual([]);
    expect(s.presence).toEqual([]);
    expect(s.markers).toEqual([]);
  });
});

// ============================================
// N21: a marker whose job ended is repaired
// ============================================

describe("presence chains: markers whose cleanup job ended (N21)", () => {
  test.each<EndState>(["canceled", "failed", "success"])(
    "a heartbeat gives a marker whose job is %s exactly one new job; the hold then expires",
    async (end) => {
      const { t } = setup();
      const ada = hold("ada");
      const key: Key = { resourceId: ROOM, slot: SLOT, user: "ada" };
      await t.mutation(api.presence.heartbeat, ada);
      const ended = await orphanMarker(t, key, end);
      // CONTROL: an orphan — the marker names the ended job, nothing is pending.
      let s = await snapshot(t);
      expect(s.markers[0].markAsGone).toBe(ended);
      expect(pendingCleanups(s)).toEqual([]);

      await t.mutation(api.presence.heartbeat, ada);
      s = await snapshot(t);
      expect(invariantViolations(s)).toEqual([]);
      expect(pendingCleanups(s)).toHaveLength(1);
      expect(s.markers[0].markAsGone).not.toBe(ended);

      // Further heartbeats leave the pending job alone.
      await t.mutation(api.presence.heartbeat, ada);
      await keepAlive(t, [ada], 20);
      s = await snapshot(t);
      expect(invariantViolations(s)).toEqual([]);
      expect(pendingCleanups(s)).toHaveLength(1);

      await advance(t, 25); // tab closed, no leave
      s = await snapshot(t);
      expect(s.presence).toEqual([]);
      expect(s.markers).toEqual([]);
      expect(pendingCleanups(s)).toEqual([]);
    }
  );

  test.each<EndState>(["canceled", "failed", "success"])(
    "leave does not throw for a marker whose job is %s and removes the hold",
    async (end) => {
      const { t } = setup();
      const ada = hold("ada");
      await t.mutation(api.presence.heartbeat, ada);
      const ended = await orphanMarker(t, { resourceId: ROOM, slot: SLOT, user: "ada" }, end);

      await t.mutation(api.presence.leave, ada);
      const s = await snapshot(t);
      expect(s.presence).toEqual([]);
      expect(s.markers).toEqual([]);
      expect(s.jobs.find((job) => job._id === ended)?.state.kind).toBe(end);
    }
  );
});

// ============================================
// sweepOrphanedHolds (one-time repair)
// ============================================

type Fixture = "healthy" | "healthyStale" | "freshOrphan" | "staleOrphan" | "markerOnly";

/**
 * One hold on `slots` for `user`: healthy (pending job), healthy with a stale
 * row (its pending job will clean it), or orphaned (job cancelled) with a
 * fresh row, a stale row or no presence row at all.
 */
async function seedHold(t: T, kind: Fixture, user: string = kind, slots = [SLOT]) {
  await t.mutation(api.presence.heartbeat, hold(user, ROOM, slots));
  if (kind === "freshOrphan" || kind === "staleOrphan" || kind === "markerOnly") {
    for (const slot of slots) await orphanMarker(t, { resourceId: ROOM, slot, user }, "canceled");
  }
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("presence").collect()) {
      if (row.user !== user) continue;
      if (kind === "healthyStale" || kind === "staleOrphan") {
        await ctx.db.patch(row._id, { updated: Date.now() - 2 * TIMEOUT_MS });
      }
      if (kind === "markerOnly") await ctx.db.delete(row._id);
    }
  });
}

function sweep(t: T, args: { cursor?: string | null; limit: number; dryRun: boolean }) {
  return t.mutation(api.presence.sweepOrphanedHolds, args);
}

/** Sweeps page by page from the start; returns every page. */
async function sweepAll(t: T, limit: number, dryRun: boolean) {
  const pages = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await sweep(t, { cursor, limit, dryRun });
    pages.push(page);
    cursor = page.continueCursor;
    if (page.isDone) return pages;
    if (pages.length > 100) throw new Error("sweep did not finish");
  }
}

const sum = (pages: { scanned: number }[]) => pages.reduce((n, page) => n + page.scanned, 0);

describe("sweepOrphanedHolds", () => {
  const ALL: Fixture[] = ["healthy", "healthyStale", "freshOrphan", "staleOrphan", "markerOnly"];

  test("deletes stale orphans, reschedules fresh ones and leaves healthy markers alone", async () => {
    const { t } = setup();
    for (const kind of ALL) await seedHold(t, kind);
    const before = await snapshot(t);
    // CONTROL: the three orphans break the invariant before the sweep.
    expect(invariantViolations(before)).toHaveLength(3);

    const result = await sweep(t, { limit: 10, dryRun: false });
    expect(result).toMatchObject({ scanned: 5, deleted: 2, rescheduled: 1, isDone: true });

    const s = await snapshot(t);
    expect(invariantViolations(s)).toEqual([]);
    const remaining = ["freshOrphan", "healthy", "healthyStale"];
    expect(s.markers.map((row) => row.user).sort()).toEqual(remaining);
    expect(s.presence.map((row) => row.user).sort()).toEqual(remaining);
    for (const user of ["healthy", "healthyStale"]) {
      expect(s.markers.find((row) => row.user === user)).toEqual(
        before.markers.find((row) => row.user === user)
      );
      expect(s.presence.find((row) => row.user === user)).toEqual(
        before.presence.find((row) => row.user === user)
      );
    }

    // The repaired hold lives on while heartbeated and expires after.
    await keepAlive(t, [hold("freshOrphan")], 20);
    expect(invariantViolations(await snapshot(t))).toEqual([]);
    await advance(t, 25);
    expect((await snapshot(t)).presence).toEqual([]);
  });

  test("dryRun counts the same work and writes nothing; a second run changes nothing", async () => {
    const { t } = setup();
    for (const kind of ALL) await seedHold(t, kind);
    const before = await snapshot(t);

    const dry = await sweep(t, { limit: 10, dryRun: true });
    expect(dry).toMatchObject({ scanned: 5, deleted: 2, rescheduled: 1, isDone: true });
    expect(await snapshot(t)).toEqual(before);

    const real = await sweep(t, { limit: 10, dryRun: false });
    expect(real).toEqual(dry);
    const afterFirst = await snapshot(t);
    expect(afterFirst).not.toEqual(before);

    expect(await sweep(t, { limit: 10, dryRun: false })).toMatchObject({
      scanned: 3,
      deleted: 0,
      rescheduled: 0,
      isDone: true,
    });
    expect(await snapshot(t)).toEqual(afterFirst);
  });

  test("touches only presence tables", async () => {
    const { t } = setup();
    const seed = await seedResourceWithSchedule(t);
    await book(t, seed, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));
    for (const kind of ALL) await seedHold(t, kind);
    const otherTables = () =>
      t.run(async (ctx) => {
        const rows: Record<string, unknown[]> = {};
        for (const table of Object.keys(schema.tables) as (keyof typeof schema.tables)[]) {
          if (table === "presence" || table === "presence_heartbeats") continue;
          rows[table] = await ctx.db.query(table).collect();
        }
        return rows;
      });
    const before = await otherTables();
    // CONTROL: the fixture really has booking data.
    expect(before.bookings).toHaveLength(1);
    expect(before.daily_availability).toHaveLength(1);

    expect(await sweep(t, { limit: 10, dryRun: false })).toMatchObject({ deleted: 2, rescheduled: 1 });
    expect(await otherTables()).toEqual(before);
  });

  test.each([
    [7, 3, [3, 3, 1]],
    [6, 3, [3, 3, 0]],
    [2, 5, [2]],
  ])("%i orphans with limit %i: pages of %j, each marker visited once", async (count, limit, sizes) => {
    const { t } = setup();
    for (let i = 0; i < count; i++) await seedHold(t, "staleOrphan", `user-${i}`);
    const isDone = sizes.map((_, i) => i === sizes.length - 1);

    const dry = await sweepAll(t, limit, true);
    expect(dry.map((page) => page.scanned)).toEqual(sizes);
    expect(dry.map((page) => page.isDone)).toEqual(isDone);

    // Each page deletes its rows, including the one the next cursor names.
    const real = await sweepAll(t, limit, false);
    expect(real.map((page) => page.scanned)).toEqual(sizes);
    expect(real.map((page) => page.deleted)).toEqual(sizes);
    expect((await snapshot(t)).markers).toEqual([]);

    // Restarting from the start or from any returned cursor is harmless.
    expect(await sweep(t, { limit, dryRun: false })).toMatchObject({ scanned: 0, isDone: true });
    for (const page of real) {
      expect(await sweep(t, { cursor: page.continueCursor, limit, dryRun: false })).toMatchObject({
        scanned: 0,
        isDone: true,
      });
    }
  });

  test("markers with equal creation times are neither skipped nor repeated at a page boundary", async () => {
    // Far enough in the future that convex-test's +0.001 ms creation-time bump
    // rounds away: rows inserted at one instant share a _creationTime, as
    // imported rows can in production.
    const TIED_NOW = Date.UTC(2600, 0, 1);
    const { t } = setup({ now: TIED_NOW });
    await seedHold(t, "staleOrphan", "tied", quanta(SLOT, 5 * 15));
    vi.setSystemTime(TIED_NOW + 1_000);
    await seedHold(t, "staleOrphan", "later", quanta(SLOT, 2 * 15));
    const markers = (await snapshot(t)).markers;
    // CONTROL: one tie group of five, then two later rows.
    const tied = markers.filter((row) => row.user === "tied");
    expect(tied).toHaveLength(5);
    expect(new Set(tied.map((row) => row._creationTime)).size).toBe(1);
    expect(markers.filter((row) => row._creationTime > tied[0]._creationTime)).toHaveLength(2);

    // Pages split the tie group twice and then span it and the later rows.
    const dry = await sweepAll(t, 2, true);
    expect(dry.map((page) => page.scanned)).toEqual([2, 2, 2, 1]);
    const real = await sweepAll(t, 2, false);
    expect(sum(real)).toBe(7);
    expect((await snapshot(t)).markers).toEqual([]);
  });

  test("rejects a limit outside 1–500 and a cursor it did not issue", async () => {
    const { t } = setup();
    for (let i = 0; i < 2; i++) await seedHold(t, "healthy", `user-${i}`);
    for (const limit of [0, -1, 2.5, 501, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(sweep(t, { limit, dryRun: true })).rejects.toThrow(
        "limit must be an integer from 1 to 500"
      );
    }
    const presenceId = (await snapshot(t)).presence[0]._id;
    for (const cursor of ["", "nope", "[1]", '["1","2"]', "[1,2]", JSON.stringify([1, presenceId])]) {
      await expect(sweep(t, { cursor, limit: 1, dryRun: true })).rejects.toThrow(
        "Invalid sweep cursor"
      );
    }
    // CONTROL: the bounds themselves and an issued cursor are accepted.
    expect(await sweep(t, { limit: 500, dryRun: true })).toMatchObject({ scanned: 2 });
    const first = await sweep(t, { limit: 1, dryRun: true });
    expect(await sweep(t, { cursor: first.continueCursor, limit: 1, dryRun: true })).toMatchObject({
      scanned: 1,
    });
  });

  test.each<[string, boolean | { functionsScheduled: number }, boolean]>([
    ["Convex's default limits", true, true],
    ["one scheduled function fewer", { functionsScheduled: 499 }, false],
  ])(
    "a full page of fresh orphans (the costliest repair) under %s",
    async (_name, transactionLimits, fits) => {
      setup(); // fake timers and the frozen clock
      const t: T = convexTest({ schema, modules, transactionLimits });
      const slots = quanta(SLOT, 500 * 15);
      for (const half of [slots.slice(0, 250), slots.slice(250)]) {
        await t.mutation(api.presence.heartbeat, hold("ada", ROOM, half));
      }
      await t.run(async (ctx) => {
        for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
          await ctx.scheduler.cancel(job._id);
        }
      });

      const run = sweep(t, { limit: 500, dryRun: false });
      if (fits) await expect(run).resolves.toMatchObject({ scanned: 500, rescheduled: 500 });
      else await expect(run).rejects.toThrow("Scheduled too many functions");
    }
  );
});
