// Compile-time checks of the host contract (F4, N2). `npm run typecheck`
// compiles them (tsc covers src/**); under Vitest the assertions are no-ops.
// A `@ts-expect-error` line must be rejected; every group has an accepted
// control next to its rejections, so a check cannot pass vacuously.

import { createElement } from "react";
import { describe, expectTypeOf, test } from "vitest";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReference_future,
  FunctionReturnType,
  FunctionType,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Doc } from "../component/_generated/dataModel.js";
import type { BookingStatus } from "../shared/booking-status.js";
import type {
  BookingAPI,
  BookingView,
  EventTypeView,
  PublicBookingAPI,
  PublicBookingAPIWithAvailabilityContext,
  ResourceView,
} from "./contract.js";
import { BookingProvider, type BookingProviderProps } from "./context.js";
import type * as ReactEntry from "./index.js";
import type { Booking, EventType, Resource } from "./types.js";

type Slot<K extends keyof PublicBookingAPI> = PublicBookingAPI[K];
type Q<Args extends Record<string, unknown>, Result> = FunctionReference<"query", "public", Args, Result>;
type M<Args extends Record<string, unknown>, Result> = FunctionReference<"mutation", "public", Args, Result>;

/** A host function that passes the component's own function through. */
type Passthrough<R extends FunctionReference<FunctionType, "internal">> = FunctionReference<
  R["_type"],
  "public",
  FunctionArgs<R>,
  FunctionReturnType<R>
>;
type C = ComponentApi["public"];

// The component's documents, as a passthrough host returns them. The
// component's getEventType resolves to `null` for a missing id (0.5.0).
type ComponentEventTypeResult = FunctionReturnType<C["getEventType"]>;
type ComponentEventType = NonNullable<ComponentEventTypeResult>;
type ComponentBooking = FunctionReturnType<C["createBooking"]>;
type ComponentResource = NonNullable<FunctionReturnType<ComponentApi["resources"]["getResource"]>>;

type DaySlotBase = { resourceId: string; date: string; eventLength: number; slotInterval: number };
type MonthBase = { resourceId: string; dateFrom: string; dateTo: string; eventLength: number; slotInterval: number };
type CreateBase = {
  eventTypeId: string; resourceId: string; start: number; end: number; timezone: string;
  booker: { name: string; email: string; phone?: string; notes?: string };
  location: { type: string; value?: string };
};
type RescheduleBase = { uid: string; token: string; newStart: number; newEnd: number };
type HeartbeatBase = { resourceId: string; slots: string[]; user: string; eventTypeId?: string };
type LeaveBase = { resourceId: string; slots: string[]; user: string };

/** A host module with every required operation, typed the way the reference host is. */
type HostPublic = {
  getEventType: Q<{ eventTypeId: string }, ComponentEventType | null>;
  getResource: Q<{ id: string }, ComponentResource | null>;
  hasResourceEventTypeLink: Q<{ resourceId: string; eventTypeId: string }, boolean>;
  getMonthAvailability: Q<MonthBase, Record<string, boolean>>;
  getDaySlots: Q<DaySlotBase, Array<{ time: string }>>;
  getDatePresence: Q<{ resourceId: string; date: string }, Array<{ slot: string; updated: number; user: string }>>;
  getPresence: Q<{ resourceId: string; slot: string }, Array<{ user: string; slot: string }>>;
  createBooking: M<CreateBase, ComponentBooking>;
  rescheduleBookingByToken: M<RescheduleBase, ComponentBooking>;
  heartbeat: M<HeartbeatBase, null>;
  leave: M<LeaveBase, null>;
};

/** A host module whose functions pass the component's own functions through. */
type ComponentHost = {
  getEventType: Passthrough<C["getEventType"]>;
  getResource: Passthrough<ComponentApi["resources"]["getResource"]>;
  hasResourceEventTypeLink: Passthrough<ComponentApi["resource_event_types"]["hasResourceEventTypeLink"]>;
  getMonthAvailability: Passthrough<C["getMonthAvailability"]>;
  getDaySlots: Passthrough<C["getDaySlots"]>;
  getDatePresence: Passthrough<ComponentApi["presence"]["getDatePresence"]>;
  getPresence: Passthrough<ComponentApi["presence"]["list"]>;
  createBooking: Passthrough<C["createBooking"]>;
  rescheduleBookingByToken: Passthrough<C["rescheduleBookingByToken"]>;
  heartbeat: Passthrough<ComponentApi["presence"]["heartbeat"]>;
  leave: Passthrough<ComponentApi["presence"]["leave"]>;
  // Optional operations are accepted with any shape
  getBookingByToken: Passthrough<C["getBookingByToken"]>;
};

describe("rejected host references", () => {
  test("wrong arguments", () => {
    // CONTROL
    expectTypeOf<Q<{ eventTypeId: string }, EventTypeView>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error a different argument name
    expectTypeOf<Q<{ id: string }, EventTypeView>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error a narrower value type than the UI sends
    expectTypeOf<Q<Omit<DaySlotBase, "date"> & { date: "2027-01-01" }, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    // @ts-expect-error createBooking arguments of another function
    expectTypeOf<M<{ foo: number }, BookingView>>().toExtend<Slot<"createBooking">>();
  });

  test("required arguments the UI never sends", () => {
    // CONTROL: the same argument, optional
    expectTypeOf<Q<{ eventTypeId: string; organizationId?: string }, EventTypeView>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error organizationId is required but never sent
    expectTypeOf<Q<{ eventTypeId: string; organizationId: string }, EventTypeView>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error the availability context is optional: a host must not require it
    expectTypeOf<Q<DaySlotBase & { rescheduleContext: { uid: string; token: string } }, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
  });

  test("keys the UI sends that the host's validator lacks", () => {
    // CONTROL: slotInterval declared optional, as the component declares it
    expectTypeOf<Q<Omit<DaySlotBase, "slotInterval"> & { slotInterval?: number }, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    // @ts-expect-error without slotInterval the validator rejects every call
    expectTypeOf<Q<Omit<DaySlotBase, "slotInterval">, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    // @ts-expect-error heartbeat must declare eventTypeId, which useSlotHold sends
    expectTypeOf<M<Omit<HeartbeatBase, "eventTypeId">, null>>().toExtend<Slot<"heartbeat">>();
    // @ts-expect-error a getEventType without arguments rejects eventTypeId
    expectTypeOf<Q<Record<string, never>, EventTypeView>>().toExtend<Slot<"getEventType">>();
  });

  test("wrong function kind", () => {
    // CONTROL
    expectTypeOf<M<CreateBase, BookingView>>().toExtend<Slot<"createBooking">>();
    // @ts-expect-error a mutation in a query slot
    expectTypeOf<M<{ eventTypeId: string }, EventTypeView>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error an action in a mutation slot
    expectTypeOf<FunctionReference<"action", "public", CreateBase, BookingView>>().toExtend<Slot<"createBooking">>();
    // @ts-expect-error a query in a mutation slot
    expectTypeOf<Q<LeaveBase, null>>().toExtend<Slot<"leave">>();
  });

  test("internal visibility", () => {
    // CONTROL
    expectTypeOf<Q<{ id: string }, ResourceView | null>>().toExtend<Slot<"getResource">>();
    // @ts-expect-error an internal function cannot be called from the browser
    expectTypeOf<FunctionReference<"query", "internal", { id: string }, ResourceView | null>>().toExtend<Slot<"getResource">>();
    // @ts-expect-error the component's own reference is internal to the host
    expectTypeOf<C["getEventType"]>().toExtend<Slot<"getEventType">>();
  });

  test("incompatible results", () => {
    // CONTROL: the component's own documents; its getEventType result includes null
    expectTypeOf<Q<{ eventTypeId: string }, ComponentEventTypeResult>>().toExtend<Slot<"getEventType">>();
    expectTypeOf<Q<{ eventTypeId: string }, ComponentEventType>>().toExtend<Slot<"getEventType">>();
    expectTypeOf<M<CreateBase, ComponentBooking>>().toExtend<Slot<"createBooking">>();
    // @ts-expect-error no title or lengthInMinutes
    expectTypeOf<Q<{ eventTypeId: string }, { id: string; name: string }>>().toExtend<Slot<"getEventType">>();
    // @ts-expect-error slots without time
    expectTypeOf<Q<DaySlotBase, Array<{ start: number }>>>().toExtend<Slot<"getDaySlots">>();
    // @ts-expect-error a numeric status
    expectTypeOf<M<CreateBase, Omit<ComponentBooking, "status"> & { status: number }>>().toExtend<Slot<"createBooking">>();
    // CONTROL: a status narrower than BookingStatus
    expectTypeOf<M<CreateBase, Omit<ComponentBooking, "status"> & { status: "pending" | "confirmed" }>>().toExtend<Slot<"createBooking">>();
    // @ts-expect-error a status typed as string (a `v.string()` returns validator)
    expectTypeOf<M<CreateBase, Omit<ComponentBooking, "status"> & { status: string }>>().toExtend<Slot<"createBooking">>();
    // @ts-expect-error the never-stored "rescheduled"
    expectTypeOf<M<RescheduleBase, Omit<ComponentBooking, "status"> & { status: BookingStatus | "rescheduled" }>>().toExtend<Slot<"rescheduleBookingByToken">>();
    // @ts-expect-error a booking without uid
    expectTypeOf<M<RescheduleBase, Omit<ComponentBooking, "uid">>>().toExtend<Slot<"rescheduleBookingByToken">>();
    // @ts-expect-error a resource without isActive
    expectTypeOf<Q<{ id: string }, { id: string; active: boolean } | null>>().toExtend<Slot<"getResource">>();
    // @ts-expect-error a link check that is not a boolean
    expectTypeOf<Q<{ resourceId: string; eventTypeId: string }, string>>().toExtend<Slot<"hasResourceEventTypeLink">>();
    // @ts-expect-error presence without the holder
    expectTypeOf<Q<{ resourceId: string; date: string }, Array<{ slot: string }>>>().toExtend<Slot<"getDatePresence">>();
  });

  test("missing required operations", () => {
    // CONTROL: the 11 required operations are enough
    expectTypeOf<HostPublic>().toExtend<PublicBookingAPI>();
    // @ts-expect-error rescheduleBookingByToken is required
    expectTypeOf<Omit<HostPublic, "rescheduleBookingByToken">>().toExtend<PublicBookingAPI>();
    // @ts-expect-error getDatePresence is required
    expectTypeOf<Omit<HostPublic, "getDatePresence">>().toExtend<PublicBookingAPI>();
  });

  test("availability context arguments a host declares are checked", () => {
    type WithContext = DaySlotBase & { eventTypeId?: string; rescheduleContext?: { uid: string; token: string } };
    // CONTROL: declared with the contract's types, or not declared at all
    expectTypeOf<Q<WithContext, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    expectTypeOf<Q<DaySlotBase, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    expectTypeOf<Q<MonthBase & { eventTypeId?: string }, Record<string, boolean>>>().toExtend<Slot<"getMonthAvailability">>();
    // @ts-expect-error eventTypeId declared as a number
    expectTypeOf<Q<DaySlotBase & { eventTypeId?: number }, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
    // @ts-expect-error rescheduleContext declared as a string
    expectTypeOf<Q<MonthBase & { rescheduleContext?: string }, Record<string, boolean>>>().toExtend<Slot<"getMonthAvailability">>();
  });
});

describe("accepted host references", () => {
  test("extra optional arguments and broader argument types", () => {
    expectTypeOf<Q<DaySlotBase & { excludeBookingUid?: string; scheduleId?: string; resourceTimezone?: string }, { time: string }[]>>()
      .toExtend<Slot<"getDaySlots">>();
    expectTypeOf<Q<Omit<MonthBase, "eventLength"> & { eventLength: number | string }, Record<string, boolean>>>()
      .toExtend<Slot<"getMonthAvailability">>();
    expectTypeOf<M<CreateBase & { resendOptions?: { apiKey: string } }, BookingView>>().toExtend<Slot<"createBooking">>();
    // CONTROL: the same extra argument, required
    // @ts-expect-error scheduleId is never sent
    expectTypeOf<Q<DaySlotBase & { scheduleId: string }, { time: string }[]>>().toExtend<Slot<"getDaySlots">>();
  });

  test("functions that pass the component's own functions through", () => {
    expectTypeOf<ComponentHost>().toExtend<PublicBookingAPI>();
    // CONTROL: an internal getPresence in the same module is not
    // @ts-expect-error the component's reference itself is internal
    expectTypeOf<Omit<ComponentHost, "getPresence"> & { getPresence: ComponentApi["presence"]["list"] }>().toExtend<PublicBookingAPI>();
  });

  test("redacted results that keep the fields the components read", () => {
    type Redacted = Pick<ComponentBooking, "uid" | "status" | "start" | "end" | "timezone" | "bookerName" | "location">;
    expectTypeOf<M<CreateBase, Redacted>>().toExtend<Slot<"createBooking">>();
    expectTypeOf<Q<{ eventTypeId: string }, Pick<ComponentEventType, "id" | "title" | "lengthInMinutes"> | null>>()
      .toExtend<Slot<"getEventType">>();
    // CONTROL
    // @ts-expect-error the success step shows the start time
    expectTypeOf<M<CreateBase, Omit<Redacted, "start">>>().toExtend<Slot<"createBooking">>();
  });

  test("the provider props take the generated shapes", () => {
    expectTypeOf<{ publicApi: HostPublic; children: null }>().toExtend<BookingProviderProps>();
    expectTypeOf<{ publicApi: ComponentHost; children: null }>().toExtend<BookingProviderProps>();
    // CONTROL
    // @ts-expect-error publicApi is required
    expectTypeOf<{ children: null }>().toExtend<BookingProviderProps>();
  });
});

// F13: with BookingProvider's availabilityContext on, the components send
// eventTypeId and rescheduleContext to the availability queries.
type ContextSlot<K extends keyof PublicBookingAPIWithAvailabilityContext> = PublicBookingAPIWithAvailabilityContext[K];
type Context = { eventTypeId?: string; rescheduleContext?: { uid: string; token: string } };
/** The host module of the opt-in: both availability queries declare the context. */
type HostWithContext = Omit<HostPublic, "getDaySlots" | "getMonthAvailability"> & {
  getDaySlots: Q<DaySlotBase & Context, Array<{ time: string }>>;
  getMonthAvailability: Q<MonthBase & Context, Record<string, boolean>>;
};
type ProviderProps = Parameters<typeof BookingProvider>[0];

describe("availability context opt-in", () => {
  test("the opted-in contract requires both context arguments, optional", () => {
    // CONTROL
    expectTypeOf<Q<DaySlotBase & Context, { time: string }[]>>().toExtend<ContextSlot<"getDaySlots">>();
    expectTypeOf<Q<MonthBase & Context, Record<string, boolean>>>().toExtend<ContextSlot<"getMonthAvailability">>();
    expectTypeOf<HostWithContext>().toExtend<PublicBookingAPIWithAvailabilityContext>();
    // @ts-expect-error the 0.4.x arguments: the validator would reject eventTypeId
    expectTypeOf<Q<DaySlotBase, { time: string }[]>>().toExtend<ContextSlot<"getDaySlots">>();
    // @ts-expect-error without rescheduleContext every reschedule query fails
    expectTypeOf<Q<MonthBase & { eventTypeId?: string }, Record<string, boolean>>>().toExtend<ContextSlot<"getMonthAvailability">>();
    // @ts-expect-error eventTypeId must stay optional
    expectTypeOf<Q<DaySlotBase & Required<Pick<Context, "eventTypeId">> & Pick<Context, "rescheduleContext">, { time: string }[]>>().toExtend<ContextSlot<"getDaySlots">>();
    // @ts-expect-error rescheduleContext of another type
    expectTypeOf<Q<DaySlotBase & { eventTypeId?: string; rescheduleContext?: string }, { time: string }[]>>().toExtend<ContextSlot<"getDaySlots">>();
    // @ts-expect-error the component's own getDaySlots has no eventTypeId: wrap it
    expectTypeOf<Passthrough<C["getDaySlots"]>>().toExtend<ContextSlot<"getDaySlots">>();
    // @ts-expect-error the module of the 0.4.x contract
    expectTypeOf<HostPublic>().toExtend<PublicBookingAPIWithAvailabilityContext>();
  });

  test("BookingProvider takes the opt-in only with a declaring publicApi", () => {
    // CONTROL: opted in with the declaring host; off with either host
    expectTypeOf<{ publicApi: HostWithContext; availabilityContext: true; children: null }>().toExtend<ProviderProps>();
    expectTypeOf<{ publicApi: HostWithContext; availabilityContext: boolean; children: null }>().toExtend<ProviderProps>();
    expectTypeOf<{ publicApi: HostPublic; availabilityContext: false; children: null }>().toExtend<ProviderProps>();
    expectTypeOf<{ publicApi: HostWithContext; children: null }>().toExtend<ProviderProps>();
    // @ts-expect-error the opt-in with a host that does not declare the context
    expectTypeOf<{ publicApi: HostPublic; availabilityContext: true; children: null }>().toExtend<ProviderProps>();
    // @ts-expect-error a boolean flag can be true
    expectTypeOf<{ publicApi: HostPublic; availabilityContext: boolean; children: null }>().toExtend<ProviderProps>();
  });

  test("wrappers of the component's slot queries that add eventTypeId (docs/host-functions.md)", () => {
    /** The component's arguments (rescheduleContext included) plus eventTypeId; its result. */
    type Wrapper<R extends FunctionReference<"query", "internal">> =
      Q<FunctionArgs<R> & { eventTypeId?: string }, FunctionReturnType<R>>;
    type WrappingHost = Omit<ComponentHost, "getDaySlots" | "getMonthAvailability"> & {
      getDaySlots: Wrapper<C["getDaySlots"]>;
      getMonthAvailability: Wrapper<C["getMonthAvailability"]>;
    };
    // CONTROL
    expectTypeOf<Wrapper<C["getDaySlots"]>>().toExtend<ContextSlot<"getDaySlots">>();
    expectTypeOf<Wrapper<C["getMonthAvailability"]>>().toExtend<ContextSlot<"getMonthAvailability">>();
    expectTypeOf<{ publicApi: WrappingHost; availabilityContext: true; children: null }>().toExtend<ProviderProps>();
    expectTypeOf<{ publicApi: ComponentHost; children: null }>().toExtend<ProviderProps>();
    // @ts-expect-error the pure passthroughs lack eventTypeId
    expectTypeOf<{ publicApi: ComponentHost; availabilityContext: true; children: null }>().toExtend<ProviderProps>();
  });
});

/** Provider call sites as a host writes them. Never called. */
export function providerCallSites(host: HostPublic, contextHost: HostWithContext) {
  createElement(BookingProvider, { publicApi: contextHost, availabilityContext: true, children: null });
  createElement(BookingProvider, { publicApi: host, children: null });
  // @ts-expect-error getDaySlots and getMonthAvailability do not declare the context
  createElement(BookingProvider, { publicApi: host, availabilityContext: true, children: null });
}

describe("views and documents", () => {
  test("stored documents fit the exported types and the views", () => {
    expectTypeOf<Doc<"bookings">>().toExtend<Booking>();
    expectTypeOf<Doc<"bookings">>().toExtend<BookingView>();
    expectTypeOf<Booking>().toExtend<BookingView>();
    expectTypeOf<Doc<"event_types">>().toExtend<EventType>();
    expectTypeOf<EventType>().toExtend<EventTypeView>();
    expectTypeOf<Doc<"resources">>().toExtend<Resource>();
    expectTypeOf<Resource>().toExtend<ResourceView>();
    // One status type: the component's, in the documents, the views and the /react entry
    expectTypeOf<Booking["status"]>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<BookingView["status"]>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<ComponentBooking["status"]>().toEqualTypeOf<BookingStatus>();
    expectTypeOf<ReactEntry.BookingStatus>().toEqualTypeOf<BookingStatus>();
    // CONTROL
    // @ts-expect-error a view is not the whole document
    expectTypeOf<BookingView>().toExtend<Booking>();
  });
});

describe("the API the components use", () => {
  test("results are typed, never any", () => {
    type Result<K extends keyof BookingAPI> = FunctionReturnType<NonNullable<BookingAPI[K]>>;
    expectTypeOf<Result<"getEventType">>().toEqualTypeOf<EventTypeView | null>();
    expectTypeOf<Result<"getResource">>().toEqualTypeOf<ResourceView | null>();
    expectTypeOf<Result<"hasResourceEventTypeLink">>().toEqualTypeOf<boolean>();
    expectTypeOf<Result<"getMonthAvailability">>().toEqualTypeOf<Record<string, boolean>>();
    expectTypeOf<Result<"getDaySlots">>().toEqualTypeOf<Array<{ time: string }>>();
    expectTypeOf<Result<"getDatePresence">>().toEqualTypeOf<Array<{ slot: string; user: string }>>();
    expectTypeOf<Result<"getPresence">>().toEqualTypeOf<Array<{ user: string }>>();
    expectTypeOf<Result<"createBooking">>().toEqualTypeOf<BookingView>();
    expectTypeOf<Result<"rescheduleBookingByToken">>().toEqualTypeOf<BookingView>();
    expectTypeOf<Result<"heartbeat">>().toBeUnknown();
    expectTypeOf<Result<"leave">>().toBeUnknown();
    // CONTROL: the untyped optional and admin operations are any
    expectTypeOf<Result<"getBooking">>().toBeAny();
    expectTypeOf<Result<"createResource">>().toBeAny();
  });

  test("admin operations may be undefined; required public ones may not", () => {
    expectTypeOf<undefined>().toExtend<BookingAPI["createResource"]>();
    expectTypeOf<undefined>().toExtend<BookingAPI["getBooking"]>();
    // CONTROL
    // @ts-expect-error getEventType is always there
    expectTypeOf<undefined>().toExtend<BookingAPI["getEventType"]>();
  });

  test("the one cast at the provider seam is needed", () => {
    // convex-helpers' cached useQuery takes plain references, not the checked slots
    expectTypeOf<Slot<"getEventType">>().not.toExtend<FunctionReference<"query">>();
    // CONTROL: the plain references useBookingAPI() returns
    expectTypeOf<BookingAPI["getEventType"]>().toExtend<FunctionReference<"query">>();
  });
});

/** Call sites as the components write them. Never called. */
export function useContractCallSites(api: BookingAPI, checked: Slot<"getResource">) {
  const eventType = useQuery(api.getEventType, { eventTypeId: "e" });
  expectTypeOf(eventType).not.toBeAny();
  expectTypeOf(eventType).toEqualTypeOf<EventTypeView | null | undefined>();
  const slots = useQuery(api.getDaySlots, { resourceId: "r", date: "2027-01-01", eventLength: 60, slotInterval: 30 });
  expectTypeOf(slots).toEqualTypeOf<Array<{ time: string }> | undefined>();
  // The availability context is accepted where the host opts in
  useQuery(api.getDaySlots, {
    resourceId: "r", date: "2027-01-01", eventLength: 60, slotInterval: 30,
    eventTypeId: "e", rescheduleContext: { uid: "u", token: "t" },
  });
  // @ts-expect-error missing slotInterval
  useQuery(api.getDaySlots, { resourceId: "r", date: "2027-01-01", eventLength: 60 });
  // @ts-expect-error the old excludeBookingUid is not part of the contract
  useQuery(api.getMonthAvailability, { resourceId: "r", dateFrom: "a", dateTo: "b", eventLength: 60, slotInterval: 30, excludeBookingUid: "u" });

  const createBooking = useMutation(api.createBooking);
  expectTypeOf<Awaited<ReturnType<typeof createBooking>>>().not.toBeAny();
  expectTypeOf<Awaited<ReturnType<typeof createBooking>>>().toEqualTypeOf<BookingView>();
  // @ts-expect-error missing arguments
  void createBooking({});

  // convex/react's own useQuery takes the checked slot directly
  const resource = useConvexQuery(checked, { id: "r" });
  expectTypeOf(resource).toEqualTypeOf<ResourceView | null | undefined>();
  // @ts-expect-error convex-helpers' cached useQuery rejects it (hence the seam cast)
  useQuery(checked, { id: "r" });
}

// A FunctionReference_future typed exactly as the slot is its own control
expectTypeOf<FunctionReference_future<"query", "public", { id: string }, ResourceView | null>>().toExtend<Slot<"getResource">>();
