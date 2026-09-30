import type { FunctionReference, FunctionReference_future } from "convex/server";
import type {
  Booking,
  BookingFormData,
  EventType,
  MonthSlots,
  PresenceRecord,
  Resource,
  TimeSlot,
} from "./types.js";

// ============================================
// VIEWS
// The fields the shipped components read from each result. A host function
// may return more (the component's own documents pass) or a redacted DTO, as
// long as it returns these.
// ============================================

/**
 * The event type fields the Booker and Calendar read. Return `null` for a
 * missing event type: the components show it as deleted.
 */
export type EventTypeView = Pick<
  EventType,
  | "id"
  | "title"
  | "description"
  | "lengthInMinutes"
  | "lengthInMinutesOptions"
  | "slotInterval"
  | "locations"
  | "isActive"
  | "lockTimeZoneToggle"
>;

/** The resource field the Booker reads. Return `null` for a missing resource. */
export type ResourceView = Pick<Resource, "isActive">;

type BookingViewKeys = "uid" | "status" | "start" | "end" | "timezone" | "bookerName";

/**
 * A created or moved booking: the fields the success step shows and `uid`,
 * which `onBookingComplete` hands on. Every other `Booking` field is optional,
 * so a host may leave out what it does not want to return. `status` is the
 * component's `BookingStatus`: a host returns validator declares it with
 * `bookingStatusValidator` from `@mrfinch/booking`, not `v.string()`.
 */
export type BookingView = Pick<Booking, BookingViewKeys> &
  Partial<Omit<Booking, BookingViewKeys>>;

/** A start time offered by getDaySlots (ISO 8601). */
export type DaySlotView = Pick<TimeSlot, "time">;

/** A presence hold returned by getDatePresence. */
export type PresenceView = Pick<PresenceRecord, "slot" | "user">;

/** A session holding a slot, returned by getPresence. */
export type SlotHolderView = Pick<PresenceRecord, "user">;

// ============================================
// ARGUMENTS
// Exactly what the shipped components send.
// ============================================

/**
 * Optional availability context for getDaySlots and getMonthAvailability.
 * The shipped components send it only with BookingProvider's
 * `availabilityContext` on, and then the host functions must declare both
 * keys (see {@link PublicBookingAPIWithAvailabilityContext}). Without the
 * opt-in a host function that declares these arguments must accept these
 * types; one that does not declare them still satisfies the contract.
 */
export type AvailabilityContextArgs = {
  /** The event type the visitor is booking. Sent whenever it is known. */
  eventTypeId?: string;
  /**
   * The booking being rescheduled and its management token, sent only in
   * reschedule mode. Pass it on to the component's query as
   * `rescheduleContext`, which excludes the booking's own occupancy only when
   * the token matches. Never turn it into `excludeBookingUid`, and never echo
   * or log either value.
   */
  rescheduleContext?: { uid: string; token: string };
};

/** Arguments of getMonthAvailability. Dates are "YYYY-MM-DD". */
export type MonthAvailabilityArgs = {
  resourceId: string;
  dateFrom: string;
  dateTo: string;
  eventLength: number;
  slotInterval: number;
};

/** Arguments of getDaySlots. `date` is "YYYY-MM-DD". */
export type DaySlotsArgs = {
  resourceId: string;
  date: string;
  eventLength: number;
  slotInterval: number;
};

/** Arguments of createBooking. */
export type CreateBookingArgs = {
  eventTypeId: string;
  resourceId: string;
  start: number;
  end: number;
  timezone: string;
  booker: BookingFormData;
  location: { type: string; value?: string };
};

/** Arguments of rescheduleBookingByToken. */
export type RescheduleBookingByTokenArgs = {
  uid: string;
  token: string;
  newStart: number;
  newEnd: number;
};

// ============================================
// OPERATIONS
// ============================================

type Operation<
  Kind extends "query" | "mutation",
  Args extends Record<string, unknown>,
  Result,
> = { kind: Kind; args: Args; result: Result };

/**
 * The operations the shipped components call: the arguments they send and
 * the result they read. `unknown` results are not read.
 *
 * The availability queries take the base arguments, or the base arguments
 * plus {@link AvailabilityContextArgs}. Only the base keys must be declared,
 * unless BookingProvider's `availabilityContext` is on
 * ({@link AvailabilityContextOperations}).
 */
export interface BookingUIOperations {
  /** Booker, Calendar. Resolve to `null` for a missing event type. */
  getEventType: Operation<"query", { eventTypeId: string }, EventTypeView | null>;
  /** Booker. Resolve to `null` for a missing resource. */
  getResource: Operation<"query", { id: string }, ResourceView | null>;
  /** Booker. */
  hasResourceEventTypeLink: Operation<
    "query",
    { resourceId: string; eventTypeId: string },
    boolean
  >;
  /** Calendar, useConvexSlots: which days have a free slot. */
  getMonthAvailability: Operation<
    "query",
    MonthAvailabilityArgs | (MonthAvailabilityArgs & AvailabilityContextArgs),
    MonthSlots
  >;
  /** Calendar, useConvexSlots: the free starts of one day. */
  getDaySlots: Operation<
    "query",
    DaySlotsArgs | (DaySlotsArgs & AvailabilityContextArgs),
    DaySlotView[]
  >;
  /** useConvexSlots: presence holds on a UTC date. */
  getDatePresence: Operation<"query", { resourceId: string; date: string }, PresenceView[]>;
  /** useSlotPresence: the sessions holding one slot. */
  getPresence: Operation<"query", { resourceId: string; slot: string }, SlotHolderView[]>;
  /** Booker. The booker receives the result, including its management token. */
  createBooking: Operation<"mutation", CreateBookingArgs, BookingView>;
  /** Booker in reschedule mode. Check the token before moving the booking. */
  rescheduleBookingByToken: Operation<"mutation", RescheduleBookingByTokenArgs, BookingView>;
  /** useSlotHold. */
  heartbeat: Operation<
    "mutation",
    { resourceId: string; slots: string[]; user: string; eventTypeId?: string },
    unknown
  >;
  /** useSlotHold. */
  leave: Operation<"mutation", { resourceId: string; slots: string[]; user: string }, unknown>;
}

type AnyOperation = Operation<"query" | "mutation", Record<string, unknown>, unknown>;

/**
 * What BookingProvider accepts for each operation. Arguments are compared the
 * way a Convex validator checks them: the function must accept every key the
 * components send and must not require one they never send. Results are
 * compared covariantly, so a superset passes.
 */
export type HostReferences = {
  [K in keyof BookingUIOperations]: BookingUIOperations[K] extends AnyOperation
    ? FunctionReference_future<
        BookingUIOperations[K]["kind"],
        "public",
        BookingUIOperations[K]["args"],
        BookingUIOperations[K]["result"]
      >
    : never;
};

/**
 * The availability queries as the components call them with BookingProvider's
 * `availabilityContext` on: the base arguments plus both context keys.
 */
export interface AvailabilityContextOperations {
  /** Calendar, useConvexSlots: which days have a free slot. */
  getMonthAvailability: Operation<"query", MonthAvailabilityArgs & AvailabilityContextArgs, MonthSlots>;
  /** Calendar, useConvexSlots: the free starts of one day. */
  getDaySlots: Operation<"query", DaySlotsArgs & AvailabilityContextArgs, DaySlotView[]>;
}

/**
 * What useBookingAPI() returns for each operation: a plain reference with the
 * contract's arguments and result, usable with every Convex React hook.
 */
export type UIReferences = {
  [K in keyof BookingUIOperations]: BookingUIOperations[K] extends AnyOperation
    ? FunctionReference<
        BookingUIOperations[K]["kind"],
        "public",
        BookingUIOperations[K]["args"],
        BookingUIOperations[K]["result"]
      >
    : never;
};

type QueryReference = FunctionReference<"query", "public">;
type MutationReference = FunctionReference<"mutation", "public">;

/**
 * Public operations the shipped components never call. They are optional and
 * untyped. The booking reads return contact details and the management token:
 * check the token or the caller's ownership in your host function, and never
 * return `managementToken` to anonymous callers.
 */
export interface OptionalPublicOperations {
  getEventTypeBySlug?: QueryReference;
  listEventTypes?: QueryReference;
  getAvailability?: QueryReference;
  /** Not called by the components. Authorized host code only: check ownership. */
  getBooking?: QueryReference;
  /** Not called by the components. Authorized host code only: a uid is not a credential. */
  getBookingByUid?: QueryReference;
  /** Not called by the components. Check the management token. */
  getBookingByToken?: QueryReference;
  /** Not called by the components. Check the management token. */
  cancelBookingByToken?: MutationReference;
  listResources?: QueryReference;
  getEventTypesForResource?: QueryReference;
  getEffectiveAvailability?: QueryReference;
}

// ============================================
// GATEWAYS
// ============================================

/**
 * References to your host's public booking functions, usually the generated
 * `api.public`. Used by: Booker, Calendar, public booking pages.
 *
 * The 11 operations the components call are required and checked against
 * {@link BookingUIOperations}; the others are optional.
 *
 * Passing a reference does not grant or restrict access: any client can call
 * any exported Convex function. Your host functions enforce authorization.
 */
export interface PublicBookingAPI extends HostReferences, OptionalPublicOperations {}

/**
 * publicApi with BookingProvider's `availabilityContext` on. As
 * {@link PublicBookingAPI}, except that getDaySlots and getMonthAvailability
 * must also declare the optional `eventTypeId` and `rescheduleContext` of
 * {@link AvailabilityContextArgs}, because the components send them. A host
 * function that lacks them, or requires them, is a type error.
 */
export interface PublicBookingAPIWithAvailabilityContext
  extends Omit<PublicBookingAPI, keyof AvailabilityContextOperations> {
  getMonthAvailability: FunctionReference_future<
    "query",
    "public",
    AvailabilityContextOperations["getMonthAvailability"]["args"],
    AvailabilityContextOperations["getMonthAvailability"]["result"]
  >;
  getDaySlots: FunctionReference_future<
    "query",
    "public",
    AvailabilityContextOperations["getDaySlots"]["args"],
    AvailabilityContextOperations["getDaySlots"]["result"]
  >;
}

/**
 * References to your host's administration functions, usually the generated
 * `api.admin`. Used by: admin dashboards and management pages. No shipped
 * component calls them, so they are untyped.
 *
 * Your host functions must check authentication and permissions: omitting
 * these references from a page does not stop a client from calling them.
 */
export interface AdminBookingAPI {
  // Event Types (CRUD)
  createEventType: MutationReference;
  updateEventType: MutationReference;
  deleteEventType: MutationReference;
  toggleEventTypeActive: MutationReference;

  // Bookings (Admin operations)
  createReservation: MutationReference;
  listBookings: QueryReference;
  cancelReservation: MutationReference;

  // Resources (CRUD)
  createResource: MutationReference;
  updateResource: MutationReference;
  deleteResource: MutationReference;
  toggleResourceActive: MutationReference;

  // Resource ↔ Event Type Mapping (Read + Write)
  getResourcesForEventType: QueryReference;
  getResourceIdsForEventType: QueryReference;
  getEventTypeIdsForResource: QueryReference;
  linkResourceToEventType: MutationReference;
  unlinkResourceFromEventType: MutationReference;
  setResourcesForEventType: MutationReference;
  setEventTypesForResource: MutationReference;

  // Schedules (CRUD)
  getSchedule: QueryReference;
  listSchedules: QueryReference;
  getDefaultSchedule: QueryReference;
  createSchedule: MutationReference;
  updateSchedule: MutationReference;
  deleteSchedule: MutationReference;
  listDateOverrides: QueryReference;
  createDateOverride: MutationReference;
  deleteDateOverride: MutationReference;

  // Multi-Resource Booking
  checkMultiResourceAvailability: QueryReference;
  createMultiResourceBooking: MutationReference;
  getBookingWithItems: QueryReference;
  cancelMultiResourceBooking: MutationReference;

  // Hooks (State machine)
  registerHook: MutationReference;
  unregisterHook: MutationReference;
  transitionBookingState: MutationReference;
  getBookingHistory: QueryReference;

  // Presence (Admin view)
  getActivePresenceCount: QueryReference;
}

/**
 * The API useBookingAPI() returns. Public operations come from publicApi;
 * admin operations come from adminApi and are `undefined` without it.
 */
export type BookingAPI = UIReferences & OptionalPublicOperations & Partial<AdminBookingAPI>;
