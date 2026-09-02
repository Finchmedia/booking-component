/// <reference types="vite/client" />
/**
 * Component-level test harness.
 *
 * The booking component is tested AS IF it were the app: `convexTest(schema,
 * modules)` runs the component's own functions directly, addressed through
 * `api` from ./_generated/api.js — e.g. `t.query(api.public.getDaySlots, …)`
 * or `t.mutation(api.schedules.createSchedule, …)`.
 *
 * Minimal test (see pilot.test.ts for the full tour):
 *
 *   import { describe, expect, test } from "vitest";
 *   import { api } from "./_generated/api.js";
 *   import { setup, seedResourceWithSchedule, berlin, book, getBusySlots, TUESDAY } from "./setup.test.js";
 *
 *   test("booking marks the slot busy", async () => {
 *     const { t } = setup();                            // fresh backend, clock frozen at FIXED_NOW
 *     const seed = await seedResourceWithSchedule(t);   // Mon–Fri 09:00–17:00 Europe/Berlin, 60-min event
 *     await book(t, seed, berlin(TUESDAY, "10:00"), berlin(TUESDAY, "11:00"));
 *     expect(await getBusySlots(t, seed.resourceId, TUESDAY)).toEqual([36, 37, 38, 39]);
 *   });
 *
 * `setup()` must be called inside a test body (or a `beforeEach`): it freezes
 * the clock with fake timers and registers an `onTestFinished` cleanup that
 * drains the scheduler (booking hooks → e-mail mutations) and restores real
 * timers. Nothing else is required from the test author.
 */
import { onTestFinished, test, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { fromZonedTime } from "date-fns-tz";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";

export const modules = import.meta.glob("./**/*.*s");

/** The component under test, typed against its own schema. */
export type T = TestConvex<typeof schema>;

export function initConvexTest(): T {
  return convexTest(schema, modules);
}

// ============================================
// FIXTURE CONSTANTS
// ============================================

export const ORG = "org-1";
export const TZ = "Europe/Berlin";
/** Frozen "now" for every test: Monday 2027-03-01 08:00 UTC. */
export const FIXED_NOW = Date.UTC(2027, 2, 1, 8, 0);
/** Tuesday 2027-03-09 — a plain weekday; Europe/Berlin is UTC+1 (DST starts 2027-03-28). */
export const TUESDAY = "2027-03-09";
export const BOOKER = { name: "Ada", email: "ada@example.com" };
export const LOCATION = { type: "address", value: "Room 1" };

export type WeeklyHours = Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
/** Mon–Fri 09:00–17:00 (dayOfWeek: 0 = Sunday … 6 = Saturday). */
export const WEEKDAYS_9_TO_17: WeeklyHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
}));

// ============================================
// LIFECYCLE
// ============================================

/**
 * Creates a fresh in-memory backend for the current test and returns `{ t, api }`.
 * Freezes the clock at `now` (default FIXED_NOW) so `Date.now()` is
 * deterministic; scheduled functions only run when drained (`drain(t)`, or
 * automatically when the test finishes).
 */
export function setup(opts: { now?: number } = {}): { t: T; api: typeof api } {
  vi.useFakeTimers();
  vi.clearAllTimers(); // stale timers from an earlier setup() in the same file
  vi.setSystemTime(opts.now ?? FIXED_NOW);
  const t = initConvexTest();
  onTestFinished(async () => {
    await drain(t);
    vi.useRealTimers();
  });
  return { t, api };
}

/** Runs every scheduled function (booking hooks → e-mail mutations) to completion. */
export async function drain(t: T): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

// ============================================
// TIME HELPERS
// ============================================

/** `utc("2027-03-09", "09:30")` → ms since epoch, the wall-clock read as UTC. */
export function utc(date: string, time: string): number {
  const ms = Date.parse(`${date}T${time}:00.000Z`);
  if (Number.isNaN(ms)) throw new Error(`utc(): invalid date/time "${date}" "${time}"`);
  return ms;
}

/** `zoned("2027-03-09", "09:30", "Europe/Berlin")` → ms since epoch (DST-aware). */
export function zoned(date: string, time: string, timezone: string): number {
  const ms = fromZonedTime(`${date}T${time}:00`, timezone).getTime();
  if (Number.isNaN(ms)) throw new Error(`zoned(): invalid date/time "${date}" "${time}"`);
  return ms;
}

/** `berlin("2027-03-09", "09:30")` → ms since epoch of that Europe/Berlin wall-clock time. */
export function berlin(date: string, time: string): number {
  return zoned(date, time, TZ);
}

/** `range(36, 40)` → `[36, 37, 38, 39]` — handy for slot-index expectations. */
export function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
}

/** UTC slot index (0–95, 15-minute chunks since UTC midnight) of a timestamp. */
export function utcSlot(ms: number): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((((ms % dayMs) + dayMs) % dayMs) / (15 * 60 * 1000));
}

// ============================================
// SEED HELPERS
// ============================================

type ResourceArgs = (typeof api.resources.createResource)["_args"];
type EventTypeArgs = (typeof api.public.createEventType)["_args"];
type BookingArgs = (typeof api.public.createBooking)["_args"];
export type DaySlotsArgs = (typeof api.public.getDaySlots)["_args"];

export interface SeedResourceOpts {
  /** External ids. Defaults: "res-1", "et-1". */
  resourceId?: string;
  eventTypeId?: string;
  organizationId?: string; // default ORG
  timezone?: string; // default TZ (resource + event type)
  lengthInMinutes?: number; // default 60
  slotInterval?: number; // default = lengthInMinutes
  requiresConfirmation?: boolean;
  /** Stored on the event type; no schedule is created by seedResource itself. */
  scheduleId?: string;
  /** Extra createResource fields (quantity, isFungible, metadata, …). */
  resource?: Partial<ResourceArgs>;
  /** Extra createEventType fields (bufferBefore, minNoticeMinutes, …). */
  eventType?: Partial<EventTypeArgs>;
}

export interface SeededResource {
  resourceId: string;
  eventTypeId: string;
  organizationId: string;
  timezone: string;
  lengthInMinutes: number;
  slotInterval: number;
}

/**
 * Non-fungible resource + event type (60 min, minNoticeMinutes 0, one year
 * maxFutureMinutes) + link. No schedule: availability queries without
 * `availableSlots` fall back to the legacy 09:00–17:00 UTC window.
 */
export async function seedResource(t: T, opts: SeedResourceOpts = {}): Promise<SeededResource> {
  const resourceId = opts.resourceId ?? "res-1";
  const eventTypeId = opts.eventTypeId ?? "et-1";
  const organizationId = opts.organizationId ?? ORG;
  const timezone = opts.timezone ?? TZ;
  const lengthInMinutes = opts.lengthInMinutes ?? 60;
  const slotInterval = opts.slotInterval ?? lengthInMinutes;

  await t.mutation(api.resources.createResource, {
    id: resourceId,
    organizationId,
    name: `Resource ${resourceId}`,
    type: "room",
    timezone,
    ...opts.resource,
  });
  await t.mutation(api.public.createEventType, {
    id: eventTypeId,
    slug: eventTypeId,
    title: "Consultation",
    lengthInMinutes,
    slotInterval,
    timezone,
    lockTimeZoneToggle: false,
    locations: [],
    organizationId,
    scheduleId: opts.scheduleId,
    minNoticeMinutes: 0,
    maxFutureMinutes: 365 * 24 * 60,
    requiresConfirmation: opts.requiresConfirmation,
    ...opts.eventType,
  });
  await t.mutation(api.resource_event_types.linkResourceToEventType, { resourceId, eventTypeId });

  return { resourceId, eventTypeId, organizationId, timezone, lengthInMinutes, slotInterval };
}

export interface SeedScheduleOpts extends SeedResourceOpts {
  /** External schedule id. Default "sch-1". */
  scheduleId?: string;
  weeklyHours?: WeeklyHours; // default WEEKDAYS_9_TO_17
  isDefault?: boolean;
  /** Day the returned `availableSlots` / `daySlotsArgs` are for. Default TUESDAY. */
  date?: string;
}

export interface SeededSchedule extends SeededResource {
  scheduleId: string;
  /** Document id — needed by createDateOverride / listDateOverrides (`v.id("schedules")`). */
  scheduleDocId: Id<"schedules">;
  weeklyHours: WeeklyHours;
  date: string;
  /** Effective LOCAL slot indices (0–95, resource timezone) of the schedule on `date`. */
  availableSlots: number[];
  /** Ready-made, schedule-aware args for `api.public.getDaySlots` on `date`. */
  daySlotsArgs: DaySlotsArgs;
}

/**
 * Schedule (Mon–Fri 09:00–17:00, Europe/Berlin) + non-fungible resource in
 * that timezone + event type (60 min on a 60-min grid) + link, and the
 * schedule's effective slots for `date` (via api.schedules.getEffectiveAvailability).
 */
export async function seedResourceWithSchedule(
  t: T,
  opts: SeedScheduleOpts = {}
): Promise<SeededSchedule> {
  const scheduleId = opts.scheduleId ?? "sch-1";
  const organizationId = opts.organizationId ?? ORG;
  const timezone = opts.timezone ?? TZ;
  const weeklyHours = opts.weeklyHours ?? WEEKDAYS_9_TO_17;
  const date = opts.date ?? TUESDAY;

  const scheduleDocId = await t.mutation(api.schedules.createSchedule, {
    id: scheduleId,
    organizationId,
    name: `Schedule ${scheduleId}`,
    timezone,
    isDefault: opts.isDefault,
    weeklyHours,
  });
  const base = await seedResource(t, { ...opts, organizationId, timezone, scheduleId });
  const availableSlots = await getEffectiveSlots(t, scheduleId, date);

  return {
    ...base,
    scheduleId,
    scheduleDocId,
    weeklyHours,
    date,
    availableSlots,
    daySlotsArgs: daySlotsArgs(base, date, availableSlots),
  };
}

export interface SeedFungibleOpts {
  resourceId?: string; // default "pool-1"
  quantity?: number; // default 3
  organizationId?: string; // default ORG
  timezone?: string; // default TZ
  /** Link the pool to an existing event type (e.g. `seed.eventTypeId`). */
  eventTypeId?: string;
  /** Extra createResource fields (metadata, isStandalone, …). */
  resource?: Partial<ResourceArgs>;
}

/** Fungible quantity pool (isFungible: true, quantity N) — tracked in quantity_availability. */
export async function seedFungibleResource(
  t: T,
  opts: SeedFungibleOpts = {}
): Promise<{ resourceId: string; quantity: number; timezone: string }> {
  const resourceId = opts.resourceId ?? "pool-1";
  const quantity = opts.quantity ?? 3;
  const timezone = opts.timezone ?? TZ;

  await t.mutation(api.resources.createResource, {
    id: resourceId,
    organizationId: opts.organizationId ?? ORG,
    name: `Pool ${resourceId}`,
    type: "equipment",
    timezone,
    quantity,
    isFungible: true,
    ...opts.resource,
  });
  if (opts.eventTypeId) {
    await t.mutation(api.resource_event_types.linkResourceToEventType, {
      resourceId,
      eventTypeId: opts.eventTypeId,
    });
  }
  return { resourceId, quantity, timezone };
}

// ============================================
// QUERY / MUTATION SHORTCUTS
// ============================================

/** Effective LOCAL slot indices of a schedule on `date` (weekly hours + overrides). */
export async function getEffectiveSlots(t: T, scheduleId: string, date: string): Promise<number[]> {
  const { availableSlots } = await t.query(api.schedules.getEffectiveAvailability, {
    scheduleId,
    date,
  });
  return availableSlots;
}

/** Schedule-aware `api.public.getDaySlots` args for a seeded resource on `date`. */
export function daySlotsArgs(
  seed: SeededResource,
  date: string,
  availableSlots: number[]
): DaySlotsArgs {
  return {
    resourceId: seed.resourceId,
    date,
    eventLength: seed.lengthInMinutes,
    slotInterval: seed.slotInterval,
    resourceTimezone: seed.timezone,
    availableSlots,
  };
}

/** Schedule-aware day view for `date` (default: the seed date) as ISO start times. */
export async function listDaySlots(
  t: T,
  seed: SeededSchedule,
  date: string = seed.date
): Promise<string[]> {
  const availableSlots =
    date === seed.date ? seed.availableSlots : await getEffectiveSlots(t, seed.scheduleId, date);
  const slots = await t.query(api.public.getDaySlots, daySlotsArgs(seed, date, availableSlots));
  return slots.map((slot) => slot.time);
}

export type BookingTarget = Pick<SeededResource, "resourceId" | "eventTypeId" | "timezone">;

/** `api.public.createBooking` with BOOKER/LOCATION defaults; `extra` overrides any arg. */
export function book(
  t: T,
  target: BookingTarget,
  start: number,
  end: number,
  extra: Partial<BookingArgs> = {}
) {
  return t.mutation(api.public.createBooking, {
    eventTypeId: target.eventTypeId,
    resourceId: target.resourceId,
    start,
    end,
    timezone: target.timezone,
    booker: BOOKER,
    location: LOCATION,
    ...extra,
  });
}

/** Raw UTC busy-slot indices of a resource on `date` (`null` = no row yet). */
export function getBusySlots(t: T, resourceId: string, date: string): Promise<number[] | null> {
  return t.query(api.maintenance.getDailyAvailability, { resourceId, date });
}

test("setup", () => {});
