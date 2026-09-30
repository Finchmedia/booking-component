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
 *
 * docs/hook-payloads-v1.md is rendered from these pins and compared at the end;
 * after a deliberate change regenerate it with
 * `npx vitest run src/component/hook-payloads-v1.test.ts -u`.
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
  // Bundle items are linked to their event type (required since 0.5.0).
  await t.mutation(api.resource_event_types.setResourcesForEventType, {
    eventTypeId: "et-no-org", resourceIds: [seed.resourceId, "pool-1"],
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

// The envelope is the internal triggerHooks job, not what a hook receives. Since
// 0.5.0 every emitter adds `payloadV2` for payloadVersion 2 hooks
// (hook-payloads-v2.test.ts); the v1 payloads below are unchanged.
const WITH_ORG = ["emailContext", "eventType", "organizationId", "payload", "payloadV2"];
const WITHOUT_ORG = ["emailContext", "eventType", "payload", "payloadV2"];

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
const CREATED_BUNDLE: Record<string, Shape> = {
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

// Pinned emissions per call. A label starts with the emitting function's name,
// which is how docs/hook-payloads-v1.md groups them.

const CREATED_PINS: Record<string, Emitted[]> = {
  createBooking: [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_SINGLE }],
  "createBooking (requires confirmation)": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_SINGLE }],
  // Since 0.4.3 (F7) the event type's organization is used, so the envelope carries it.
  "createMultiResourceBooking without organization": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_BUNDLE }],
  "createMultiResourceBooking for an event type without organization": [{ eventType: "booking.created", envelope: WITHOUT_ORG, payload: CREATED_BUNDLE }],
  "createMultiResourceBooking with organization": [{ eventType: "booking.created", envelope: WITH_ORG, payload: CREATED_BUNDLE }],
  createReservation: [{ eventType: "booking.created", envelope: WITHOUT_ORG, payload: CREATED_LEGACY }],
};

const WITH_TOKEN = ALL_STORED.filter((shape) => shape !== "legacy createReservation row");
const CANCELLED_PINS = {
  cancelReservation: pinsFor(ALL_STORED, "booking.cancelled", () => CANCELLED_BY_ID),
  cancelBookingByToken: pinsFor(WITH_TOKEN, "booking.cancelled", CANCELLED_BY_TOKEN),
  "transitionBookingState to cancelled": pinsFor(ALL_STORED, "booking.cancelled", (shape) => TRANSITION(shape)),
  cancelMultiResourceBooking: pinsFor(ALL_STORED, "booking.cancelled", () => ({ ...CANCELLED_BY_ID, isMultiResource: B })),
  "cancelMultiResourceBooking with reason and cancelledBy": pinsFor(["bundle with organization"], "booking.cancelled", () => ({
    ...CANCELLED_BY_ID, cancelledBy: S, isMultiResource: B, reason: S,
  })),
};

const RESCHEDULED_PINS = {
  rescheduleBooking: pinsFor(ALL_STORED, "booking.rescheduled", RESCHEDULED),
  rescheduleBookingByToken: pinsFor(WITH_TOKEN, "booking.rescheduled", RESCHEDULED),
};

const MODERN = "modern single booking";
const TRANSITION_PINS: Record<string, Emitted[]> = {
  "transitionBookingState pending -> declined (with reason)": [{ eventType: "booking.declined", envelope: WITH_ORG, payload: TRANSITION(MODERN, true) }],
  "transitionBookingState pending -> confirmed": [{ eventType: "booking.confirmed", envelope: WITH_ORG, payload: TRANSITION(MODERN) }],
  "transitionBookingState provisional -> confirmed": [{ eventType: "booking.confirmed", envelope: WITH_ORG, payload: TRANSITION(MODERN) }],
  "transitionBookingState provisional -> pending": [{ eventType: "booking.pending", envelope: WITH_ORG, payload: TRANSITION(MODERN) }],
  // No notification for completion, so no emailContext either.
  "transitionBookingState confirmed -> completed": [{ eventType: "booking.completed", envelope: ["eventType", "organizationId", "payload", "payloadV2"], payload: TRANSITION(MODERN) }],
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
    }).toStrictEqual(CREATED_PINS);
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
      CANCELLED_PINS.cancelReservation,
    );
  });

  test("cancelBookingByToken (legacy rows carry no token)", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.public.cancelBookingByToken, { uid: booking.uid, token: booking.managementToken! }),
      CANCELLED_PINS.cancelBookingByToken,
    );
  });

  test("transitionBookingState to cancelled", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.hooks.transitionBookingState, { bookingId: booking._id, toStatus: "cancelled" }),
      CANCELLED_PINS["transitionBookingState to cancelled"],
    );
  });

  test("cancelMultiResourceBooking", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id }),
      CANCELLED_PINS.cancelMultiResourceBooking,
    );
  });

  test("cancelMultiResourceBooking adds reason and cancelledBy when given", async () => {
    await expectPerStoredShape(
      (t, booking) =>
        t.mutation(api.multi_resource.cancelMultiResourceBooking, { bookingId: booking._id, reason: "r", cancelledBy: "admin" }),
      CANCELLED_PINS["cancelMultiResourceBooking with reason and cancelledBy"],
    );
  });
});

describe("booking.rescheduled", () => {
  const later = (booking: Doc<"bookings">) => ({ newStart: booking.start + 8 * HOUR, newEnd: booking.end + 8 * HOUR });

  test("rescheduleBooking", async () => {
    await expectPerStoredShape(
      (t, booking) => t.mutation(api.public.rescheduleBooking, { bookingId: booking._id, ...later(booking) }),
      RESCHEDULED_PINS.rescheduleBooking,
    );
  });

  test("rescheduleBookingByToken (legacy rows carry no token)", async () => {
    await expectPerStoredShape(
      (t, booking) =>
        t.mutation(api.public.rescheduleBookingByToken, { uid: booking.uid, token: booking.managementToken!, ...later(booking) }),
      RESCHEDULED_PINS.rescheduleBookingByToken,
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

  expect({
    "transitionBookingState pending -> declined (with reason)": await transition(declinable, "declined", "r"),
    "transitionBookingState pending -> confirmed": await transition(approvable, "confirmed"),
    "transitionBookingState provisional -> confirmed": await transition(confirmable, "confirmed"),
    "transitionBookingState provisional -> pending": await transition(requestable, "pending"),
    "transitionBookingState confirmed -> completed": await transition(completable, "completed"),
  }).toStrictEqual(TRANSITION_PINS);
});

// ============================================
// docs/hook-payloads-v1.md
// ============================================

type Field = { type: DocType; optional: boolean };
type DocType = { leaf: string } | { array: DocType } | { object: Record<string, Field> };

/** One type for several captures; a key missing from some of them is optional. */
function merge(shapes: Shape[]): DocType {
  if (shapes.every((shape): shape is string => typeof shape === "string")) {
    return { leaf: [...new Set(shapes)].sort().join(" | ") };
  }
  if (shapes.every((shape): shape is Shape[] => Array.isArray(shape))) return { array: merge(shapes.flat()) };
  if (shapes.some((shape) => typeof shape === "string" || Array.isArray(shape))) {
    throw new Error(`Cannot merge ${JSON.stringify(shapes)}`);
  }
  const objects = shapes as Array<Record<string, Shape>>;
  const keys = [...new Set(objects.flatMap((object) => Object.keys(object)))].sort();
  return {
    object: Object.fromEntries(keys.map((key) => {
      const present = objects.filter((object) => key in object);
      return [key, { type: merge(present.map((object) => object[key])), optional: present.length < objects.length }];
    })),
  };
}

/** TypeScript-like text; `named` keys print a type name instead of their shape. */
function render(type: DocType, indent = "", named: Record<string, string> = {}): string {
  if ("leaf" in type) return type.leaf;
  if ("array" in type) return `Array<${render(type.array, indent)}>`;
  const inner = `${indent}  `;
  const lines = Object.entries(type.object).map(([key, field]) =>
    `${inner}${key}${field.optional ? "?" : ""}: ${named[key] ?? render(field.type, inner)};`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

const EVENT_ORDER = [
  "booking.created", "booking.pending", "booking.confirmed", "booking.declined",
  "booking.cancelled", "booking.rescheduled", "booking.completed",
];

function hookPayloadsDoc(): string {
  const byCall: Record<string, Emitted[]> = {
    ...CREATED_PINS,
    ...TRANSITION_PINS,
    ...Object.fromEntries(Object.entries({ ...CANCELLED_PINS, ...RESCHEDULED_PINS })
      .map(([call, pins]) => [call, Object.values(pins).flat()])),
  };
  // event type -> emitting function -> every pinned emission
  const grouped = new Map<string, Map<string, Emitted[]>>(EVENT_ORDER.map((event) => [event, new Map()]));
  for (const [call, emissions] of Object.entries(byCall)) {
    for (const emitted of emissions) {
      const emitters = grouped.get(emitted.eventType);
      if (!emitters) throw new Error(`${emitted.eventType} is missing from EVENT_ORDER`);
      const emitter = call.split(" ")[0];
      emitters.set(emitter, [...(emitters.get(emitter) ?? []), emitted]);
    }
  }

  const out = [
    "# Hook payloads, version 1",
    "",
    "<!-- Generated from the pins in src/component/hook-payloads-v1.test.ts. Do not edit by hand; after a deliberate change run `npx vitest run src/component/hook-payloads-v1.test.ts -u`. -->",
    "",
    "A hook registered with `registerHook` without `payloadVersion` runs its function handle with the",
    "event's payload as the function's arguments. The payload depends on the function that emitted the",
    "event, not only on the event type: `booking.cancelled` has four shapes. A handler with an argument",
    "validator must accept every shape of its event, and an added key fails such a validator just like",
    "a missing one, so each emitter keeps the shape below within version 1. Register with",
    "`payloadVersion: 2` for one shape per event ([version 2](hook-payloads-v2.md)).",
    "",
    "Payloads contain booker contact details and, where shown, the booking's management token.",
    "Register hooks only from trusted server code.",
    "",
    "- Values a booking or call does not have are left out, never sent as `null`. Legacy",
    "  `createReservation` rows have no `managementToken` and no `organizationId`, bookings without an",
    "  organization have no `organizationId`, and `transitionBookingState` sends `reason` only when the",
    "  call passes one. `?` marks the keys the pinned calls show both ways; treat `managementToken` and",
    "  `organizationId` as optional for every emitter, and `reason` for `transitionBookingState`.",
    "- Hooks registered without `organizationId` receive every event of their type. Hooks registered",
    "  for an organization receive the events of that organization's bookings only.",
    "- `createBooking` for an event type that requires confirmation emits `booking.created` with",
    "  `status: \"pending\"`. `booking.pending` comes only from `transitionBookingState`.",
    "- `createProvisionalBooking` and `expireProvisionalBooking` emit no event. `presence.timeout` is",
    "  accepted by `registerHook` but never emitted.",
    "- A move emits `booking.rescheduled` only, not `booking.cancelled` for the original.",
  ];
  for (const [event, emitters] of grouped) {
    out.push("", `## ${event}`);
    for (const [emitter, emissions] of emitters) {
      out.push("", `### ${emitter}`, "");
      if (!emissions.some((emitted) => emitted.envelope.includes("organizationId"))) {
        out.push("Reaches global hooks only: these bookings have no organization.", "");
      }
      out.push("```ts", render(merge(emissions.map((emitted) => emitted.payload)), "", { booking: "StoredBooking" }), "```");
    }
  }
  out.push(
    "",
    "## StoredBooking",
    "",
    "`booking` is the stored booking document as it was before the change, with `status` set to the",
    "new status. Besides the keys below it carries `bookerPhone`, `bookerNotes` and `eventDescription`",
    "when the booking has them.",
    "",
    "```ts",
    render(merge(Object.values(STORED))),
    "```",
    "",
  );
  return out.join("\n");
}

test("docs/hook-payloads-v1.md is generated from these pins", async () => {
  const doc = hookPayloadsDoc();
  // CONTROL: every pinned event type and emitter is in the rendered text.
  for (const heading of ["## booking.cancelled", "### cancelBookingByToken", "### createReservation", "## StoredBooking"]) {
    expect(doc).toContain(heading);
  }
  await expect(doc).toMatchFileSnapshot("../../docs/hook-payloads-v1.md");
});
