/**
 * Frozen v1 hook payloads (N7) — change only deliberately.
 *
 * A registered hook handle is scheduled with the payload AS ITS ARGUMENTS, so a
 * host handler with an args validator (normal Convex practice) rejects any
 * payload whose key set differs from the one it was written against — an added
 * key breaks it just like a removed one. Each emitter therefore keeps its own
 * v1 shape, and v1 is never normalized.
 *
 * Pinned here, per emitter and per stored booking shape: the triggerHooks
 * envelope keys and the payload shape (keys and value types, nested objects
 * included). Token-cancel and transition payloads spread the stored booking,
 * so their nested shape follows the stored optional fields. A change that adds
 * a stored optional field must show the result equals an existing pinned shape,
 * or change the pin deliberately together with a CHANGELOG note.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import {
  BOOKER,
  LOCATION,
  ORG,
  TUESDAY,
  book,
  seedFungibleResource,
  seedResource,
  setup,
  utc,
  type T,
} from "./setup.test.js";

// ============================================
// CAPTURE
// ============================================

type Shape = string | Shape[] | { [key: string]: Shape };
type Emitted = { eventType: string; envelope: string[]; payload: Shape };
type Job = { _id: string; name: string; args: unknown[] };

/** Keys and value types, recursively; the values themselves (ids, times) vary per run. */
function shapeOf(value: unknown): Shape {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shapeOf((value as Record<string, unknown>)[key])]),
    );
  }
  return value === null ? "null" : typeof value;
}

async function scheduledJobs(t: T): Promise<Job[]> {
  return (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())) as unknown as Job[];
}

/** Runs `call` and returns the triggerHooks jobs it scheduled, as shapes. */
async function emittedBy(t: T, call: () => Promise<unknown>): Promise<Emitted[]> {
  const before = new Set((await scheduledJobs(t)).map((job) => job._id));
  await call();
  return (await scheduledJobs(t))
    .filter((job) => !before.has(job._id) && job.name.includes("triggerHooks"))
    .map((job) => {
      const args = job.args[0] as { eventType: string; payload: unknown };
      return { eventType: args.eventType, envelope: Object.keys(args).sort(), payload: shapeOf(args.payload) };
    });
}

// ============================================
// FIXTURES
// ============================================

const at = (time: string) => utc(TUESDAY, time);
const HOUR = 3_600_000;

async function seedWorld(t: T) {
  const seed = await seedResource(t); // res-1 + et-1, organization org-1
  await seedFungibleResource(t, { eventTypeId: seed.eventTypeId }); // pool-1, capacity 3
  const approval = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-approval", requiresConfirmation: true });
  // No organization on the event type: bundles for it store none (F7 takes the event type's otherwise).
  await t.mutation(api.public.createEventType, {
    id: "et-no-org", slug: "et-no-org", title: "No organization", lengthInMinutes: 60, timezone: "UTC",
    lockTimeZoneToggle: false, locations: [], minNoticeMinutes: 0, maxFutureMinutes: 365 * 24 * 60,
  });

  const single = (time: string, location: { type: string; value?: string } = LOCATION) =>
    book(t, seed, at(time), at(time) + HOUR, { location });
  const bundle = (time: string, organizationId?: string, eventTypeId = seed.eventTypeId) =>
    t.mutation(api.multi_resource.createMultiResourceBooking, {
      eventTypeId,
      organizationId,
      resources: [{ resourceId: seed.resourceId }, { resourceId: "pool-1", quantity: 2 }],
      start: at(time),
      end: at(time) + HOUR,
      timezone: "UTC",
      booker: BOOKER,
      location: LOCATION,
    });
  const legacy = async (time: string) => {
    const bookingId = await t.mutation(api.public.createReservation, {
      resourceId: seed.resourceId, actorId: "ada@example.com", start: at(time), end: at(time) + HOUR,
    });
    return (await t.query(api.public.getBooking, { bookingId }))!;
  };
  const provisional = (time: string) =>
    t.mutation(api.public.createProvisionalBooking, {
      eventTypeId: seed.eventTypeId, resourceId: seed.resourceId, start: at(time), end: at(time) + HOUR,
      timezone: "UTC", booker: BOOKER, location: LOCATION,
    });
  const pending = (time: string) => book(t, approval, at(time), at(time) + HOUR);

  /** A bundle stored without organization by 0.4.2, repaired by the backfill. */
  const backfilled = async (time: string) => {
    const created = await bundle(time);
    await t.run((ctx) => ctx.db.patch(created._id, { organizationId: undefined }));
    await t.mutation(api.maintenance.backfillBookingOrganizations, { limit: 500, dryRun: false });
    return (await t.query(api.public.getBooking, { bookingId: created._id }))!;
  };

  /** One booking per stored shape, 09:00–17:00 on res-1 (bundles also hold pool-1). */
  const stored = async (): Promise<Record<StoredShape, Doc<"bookings">>> => {
    const moved = await single("14:00");
    return {
      "modern single booking": await single("09:00"),
      "bundle without organization": await bundle("10:00", undefined, "et-no-org"),
      "bundle with organization": await bundle("11:00", ORG),
      "legacy createReservation row": await legacy("12:00"),
      "location without value": await single("13:00", { type: "phone" }),
      "rescheduled booking": await t.mutation(api.public.rescheduleBooking, {
        bookingId: moved._id, newStart: at("15:00"), newEnd: at("16:00"),
      }),
      "bundle with derived organization": await bundle("16:00"),
      "bundle backfilled by backfillBookingOrganizations": await backfilled("14:00"),
    };
  };
  return { single, bundle, legacy, provisional, pending, stored };
}

type StoredShape =
  | "modern single booking"
  | "bundle without organization"
  | "bundle with organization"
  | "legacy createReservation row"
  | "location without value"
  | "rescheduled booking"
  | "bundle with derived organization"
  | "bundle backfilled by backfillBookingOrganizations";

/** Emits once per pinned stored shape and compares every capture with its pin. */
async function expectPerStoredShape(
  emit: (t: T, booking: Doc<"bookings">) => Promise<unknown>,
  pins: Partial<Record<StoredShape, Emitted[]>>,
) {
  const { t } = setup();
  const bookings = await (await seedWorld(t)).stored();
  const captured: Partial<Record<StoredShape, Emitted[]>> = {};
  for (const shape of Object.keys(pins) as StoredShape[]) {
    captured[shape] = await emittedBy(t, () => emit(t, bookings[shape]));
  }
  expect(captured).toStrictEqual(pins);
}

// ============================================
// PINNED V1 SHAPES
// ============================================

const S = "string";
const N = "number";
const B = "boolean";

const WITH_ORG = ["emailContext", "eventType", "organizationId", "payload"];
const WITHOUT_ORG = ["emailContext", "eventType", "payload"];

function omit<V extends Record<string, Shape>>(shape: V, ...keys: string[]): Record<string, Shape> {
  return Object.fromEntries(Object.entries(shape).filter(([key]) => !keys.includes(key)));
}

/** The stored booking as token-cancel and transition payloads spread it (`payload.booking`). */
const STORED_MODERN = {
  _creationTime: N, _id: S, actorId: S, bookerEmail: S, bookerName: S, createdAt: N, end: N,
  eventTitle: S, eventTypeId: S, location: { type: S, value: S }, managementToken: S,
  organizationId: S, resourceId: S, start: N, status: S, timezone: S, uid: S, updatedAt: N,
};
const STORED: Record<StoredShape, Record<string, Shape>> = {
  "modern single booking": STORED_MODERN,
  "bundle without organization": omit(STORED_MODERN, "organizationId"),
  "bundle with organization": STORED_MODERN,
  "legacy createReservation row": {
    ...omit(STORED_MODERN, "managementToken", "organizationId"), location: { type: S },
  },
  "location without value": { ...STORED_MODERN, location: { type: S } },
  "rescheduled booking": { ...STORED_MODERN, rescheduleUid: S },
  // Since 0.4.3 (F7) a bundle created without organizationId takes the event
  // type's, which is the existing "bundle with organization" shape.
  "bundle with derived organization": STORED_MODERN,
  "bundle backfilled by backfillBookingOrganizations": STORED_MODERN,
};
/** Envelope keys per stored shape: organizationId travels only when the booking has one. */
const ENVELOPE: Record<StoredShape, string[]> = {
  "modern single booking": WITH_ORG,
  "bundle without organization": WITHOUT_ORG,
  "bundle with organization": WITH_ORG,
  "legacy createReservation row": WITHOUT_ORG,
  "location without value": WITH_ORG,
  "rescheduled booking": WITH_ORG,
  "bundle with derived organization": WITH_ORG,
  "bundle backfilled by backfillBookingOrganizations": WITH_ORG,
};
const ALL_STORED = Object.keys(STORED) as StoredShape[];

/** One pinned emission per stored shape. */
function pinsFor(
  shapes: StoredShape[],
  eventType: string,
  payload: (shape: StoredShape) => Shape,
): Partial<Record<StoredShape, Emitted[]>> {
  return Object.fromEntries(
    shapes.map((shape) => [shape, [{ eventType, envelope: ENVELOPE[shape], payload: payload(shape) }]]),
  );
}

const CREATED_SINGLE = {
  bookerEmail: S, bookerName: S, bookingId: S, end: N, eventTitle: S, eventTypeId: S,
  managementToken: S, resourceId: S, start: N, status: S, timezone: S, uid: S,
};
/** `resources` mirrors the request items as passed (quantity only where given). */
const CREATED_BUNDLE = {
  ...CREATED_SINGLE, isMultiResource: B, resources: [{ resourceId: S }, { quantity: N, resourceId: S }],
};
const CREATED_LEGACY = { bookerEmail: S, bookingId: S, end: N, resourceId: S, start: N, status: S };

const CANCELLED_BY_ID = {
  bookerEmail: S, bookerName: S, bookingId: S, end: N, eventTitle: S, eventTypeId: S,
  previousStatus: S, resourceId: S, start: N, status: S, timezone: S,
};
const CANCELLED_BY_TOKEN = (shape: StoredShape) => ({
  bookerEmail: S, bookerName: S, booking: STORED[shape], bookingId: S, end: N, eventTitle: S,
  previousStatus: S, reason: S, start: N, timezone: S,
});
/** transitionBookingState: `reason` only when given, managementToken only when stored. */
const TRANSITION = (shape: StoredShape, withReason = false) => {
  const payload: Record<string, Shape> = {
    bookerEmail: S, bookerName: S, booking: STORED[shape], bookingId: S, end: N, eventTitle: S,
    managementToken: S, previousStatus: S, start: N, timezone: S, uid: S,
  };
  if (withReason) payload.reason = S;
  return shape === "legacy createReservation row" ? omit(payload, "managementToken") : payload;
};
/** `resources` is read from the booking items, or the primary with quantity 1. */
const RESCHEDULED = (shape: StoredShape) => {
  const isBundle = shape.startsWith("bundle");
  const payload = {
    bookerEmail: S, bookerName: S, eventTitle: S, isMultiResource: B, managementToken: S,
    newBookingId: S, newEnd: N, newStart: N, oldEnd: N, oldStart: N, originalBookingId: S,
    resources: isBundle
      ? [{ quantity: N, resourceId: S }, { quantity: N, resourceId: S }]
      : [{ quantity: N, resourceId: S }],
    timezone: S, uid: S,
  };
  return shape === "legacy createReservation row" ? omit(payload, "managementToken") : payload;
};

// ============================================
// TESTS
// ============================================

describe("booking.created", () => {
  test("one shape per emitter; organizationId travels in the envelope only", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    expect({
      createBooking: await emittedBy(t, () => world.single("09:00")),
      "createBooking (requires confirmation)": await emittedBy(t, () => world.pending("09:00")),
      "createMultiResourceBooking without organization": await emittedBy(t, () => world.bundle("10:00")),
      "createMultiResourceBooking for an event type without organization": await emittedBy(t, () =>
        world.bundle("14:00", undefined, "et-no-org")),
      "createMultiResourceBooking with organization": await emittedBy(t, () => world.bundle("11:00", ORG)),
      createReservation: await emittedBy(t, () => world.legacy("12:00")),
    }).toStrictEqual({
      createBooking: [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_SINGLE }],
      "createBooking (requires confirmation)": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_SINGLE }],
      // Since 0.4.3 (F7) the event type's organization is used, so the envelope carries it.
      "createMultiResourceBooking without organization": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_BUNDLE }],
      "createMultiResourceBooking for an event type without organization": [{ eventType: "booking.created", envelope: WITHOUT_ORG, payload: CREATED_BUNDLE }],
      "createMultiResourceBooking with organization": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_BUNDLE }],
      createReservation: [{ eventType: "booking.created", envelope: WITHOUT_ORG, payload: CREATED_LEGACY }],
    });
  });

  test("provisional creation and provisional expiry emit no hook", async () => {
    const { t } = setup();
    const world = await seedWorld(t);
    const held = await world.provisional("09:00");
    expect(held.status).toBe("provisional");
    expect(await emittedBy(t, () => world.provisional("10:00"))).toEqual([]);
    expect(await emittedBy(t, () => t.mutation(api.public.expireProvisionalBooking, { bookingId: held._id }))).toEqual([]);
    // CONTROL: the capture sees an ordinary booking's hook.
    expect(await emittedBy(t, () => world.single("11:00"))).toHaveLength(1);
  });
});

describe("booking.cancelled: four emitters, four shapes", () => {
  test("cancelReservation", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.public.cancelReservation, { reservationId: booking._id }),
      pinsFor(ALL_STORED, "booking.cancelled", () => CANCELLED_BY_ID),
    );
  });

  test("cancelBookingByToken (legacy rows carry no token)", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.public.cancelBookingByToken, { uid: booking.uid, token: booking.managementToken! }),
      pinsFor(ALL_STORED.filter((shape) => shape !== "legacy createReservation row"), "booking.cancelled", CANCELLED_BY_TOKEN),
    );
  });

  test("transitionBookingState to cancelled", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus: "cancelled" }),
      pinsFor(ALL_STORED, "booking.cancelled", (shape) => TRANSITION(shape)),
    );
  });

  test("cancelMultiResourceBooking", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id }),
      pinsFor(ALL_STORED, "booking.cancelled", () => ({ ...CANCELLED_BY_ID, isMultiResource: B })),
    );
  });

  test("cancelMultiResourceBooking adds reason and cancelledBy when given", async () => {
    await expectPerStoredShape(
      (t, booking) =>
        t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id, reason: "r", cancelledBy: "admin" }),
      pinsFor(["bundle with organization"], "booking.cancelled", () => ({
        ...CANCELLED_BY_ID, cancelledBy: S, isMultiResource: B, reason: S,
      })),
    );
  });
});

describe("booking.rescheduled", () => {
  const later = (booking: Doc<"bookings">) => ({ newStart: booking.start + 8 * HOUR, newEnd: booking.end + 8 * HOUR });

  test("rescheduleBooking", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.public.rescheduleBooking, { bookingId: booking._id, ...later(booking) }),
      pinsFor(ALL_STORED, "booking.rescheduled", RESCHEDULED),
    );
  });

  test("rescheduleBookingByToken (legacy rows carry no token)", async () => {
    await expectPerStoredShape(
      (t, booking) =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: booking.uid, token: booking.managementToken!, ...later(booking) }),
      pinsFor(ALL_STORED.filter((shape) => shape !== "legacy createReservation row"), "booking.rescheduled", RESCHEDULED),
    );
  });
});

test("transitionBookingState: declined, confirmed, pending and completed", async () => {
  const { t } = setup();
  const world = await seedWorld(t);
  const transition = (booking: Doc<"bookings">, toStatus: string, reason?: string) =>
    emittedBy(t, () => t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus, reason }));
  const [declinable, approvable] = [await world.pending("09:00"), await world.pending("10:00")];
  const [confirmable, requestable] = [await world.provisional("11:00"), await world.provisional("12:00")];
  const completable = await world.single("13:00");
  const modern = "modern single booking";

  expect({
    "pending -> declined (with reason)": await transition(declinable, "declined", "r"),
    "pending -> confirmed": await transition(approvable, "confirmed"),
    "provisional -> confirmed": await transition(confirmable, "confirmed"),
    "provisional -> pending": await transition(requestable, "pending"),
    "confirmed -> completed": await transition(completable, "completed"),
  }).toStrictEqual({
    "pending -> declined (with reason)": [{ eventType: "booking.declined", envelope: WITH_ORG, payload: TRANSITION(modern, true) }],
    "pending -> confirmed": [{ eventType: "booking.confirmed", envelope: WITH_ORG, payload: TRANSITION(modern) }],
    "provisional -> confirmed": [{ eventType: "booking.confirmed", envelope: WITH_ORG, payload: TRANSITION(modern) }],
    "provisional -> pending": [{ eventType: "booking.pending", envelope: WITH_ORG, payload: TRANSITION(modern) }],
    // No notification for completion, so no emailContext either.
    "confirmed -> completed": [{ eventType: "booking.completed", envelope: ["eventType", "organizationId", "payload"], payload: TRANSITION(modern) }],
  });
});
