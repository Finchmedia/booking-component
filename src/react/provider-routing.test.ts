// @vitest-environment happy-dom

import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexProvider, useMutation, type ConvexReactClient } from "convex/react";
import {
  anyApi,
  defineSchema,
  getFunctionName,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import {
  ADMIN_OPERATIONS,
  BookingProvider,
  PUBLIC_OPERATIONS,
  useBookingAPI,
  type AdminBookingAPI,
  type BookingAPI,
  type ListsAllOperations,
  type PublicBookingAPI,
} from "./context";

// F1: BookingProvider with the REAL generated api objects. Codegen always
// emits `export const api = anyApi`: module proxies that report no members
// and return a reference for any name.

afterEach(cleanup);

const api = anyApi as unknown as { public: PublicBookingAPI; admin: AdminBookingAPI };

function resolved(props: { publicApi: PublicBookingAPI; adminApi?: Partial<AdminBookingAPI> }) {
  const { result } = renderHook(() => useBookingAPI(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(BookingProvider, { ...props, children }),
  });
  return result.current;
}

const nameOf = (api: BookingAPI, key: keyof BookingAPI) => getFunctionName(api[key]!);

function stubClient() {
  const sent: string[] = [];
  const client = {
    mutation: vi.fn(async (reference: unknown) => {
      sent.push(getFunctionName(reference as never));
      return null;
    }),
  } as unknown as ConvexReactClient;
  return { client, sent };
}

describe("operation lists", () => {
  it("name every interface member (compile-time) and nothing twice", () => {
    const allPublic: ListsAllOperations<PublicBookingAPI, typeof PUBLIC_OPERATIONS> = true;
    const allAdmin: ListsAllOperations<AdminBookingAPI, typeof ADMIN_OPERATIONS> = true;
    // @ts-expect-error control: a list without the other admin operations is incomplete
    const incomplete: ListsAllOperations<AdminBookingAPI, readonly ["createResource"]> = true;
    // @ts-expect-error control: a name outside the interface is not an operation
    const misspelled: ListsAllOperations<AdminBookingAPI, readonly ["createResorce"]> = true;
    expect([allPublic, allAdmin, incomplete, misspelled]).toEqual([true, true, true, true]);

    expect(PUBLIC_OPERATIONS).toHaveLength(21);
    expect(ADMIN_OPERATIONS).toHaveLength(36);
    const all = [...PUBLIC_OPERATIONS, ...ADMIN_OPERATIONS];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("generated publicApi and adminApi", () => {
  it("resolves every admin operation to admin:<name> and every public one to public:<name>", () => {
    // The generated proxies report no members; routing must not depend on it
    expect("createResource" in api.admin).toBe(false);
    expect(Object.keys(api.admin)).toEqual([]);

    const merged = resolved({ publicApi: api.public, adminApi: api.admin });
    expect(ADMIN_OPERATIONS.map((key) => nameOf(merged, key))).toEqual(
      ADMIN_OPERATIONS.map((key) => `admin:${key}`)
    );
    expect(PUBLIC_OPERATIONS.map((key) => nameOf(merged, key))).toEqual(
      PUBLIC_OPERATIONS.map((key) => `public:${key}`)
    );
  });

  it("sends admin:createResource and public:createBooking through the Convex client", async () => {
    const { client, sent } = stubClient();
    function Buttons() {
      const bookingApi = useBookingAPI();
      const createResource = useMutation(bookingApi.createResource!);
      const createBooking = useMutation(bookingApi.createBooking);
      return createElement("div", null,
        createElement("button", { onClick: () => void createResource({ id: "room" }) }, "resource"),
        createElement("button", { onClick: () => void createBooking({}) }, "booking"));
    }
    render(createElement(ConvexProvider, { client },
      createElement(BookingProvider, {
        publicApi: api.public,
        adminApi: api.admin,
        children: createElement(Buttons),
      })));

    fireEvent.click(screen.getByText("resource"));
    fireEvent.click(screen.getByText("booking"));
    await waitFor(() => expect(sent).toEqual(["admin:createResource", "public:createBooking"]));
  });

  it("runs the admin function of an emulated host, and public names stay public", async () => {
    const host = convexTest(defineSchema({}), {
      "./host/_generated/api.js": async () => ({}),
      "./host/public.ts": async () => ({
        getEventType: queryGeneric({ args: {}, handler: async () => "public getEventType" }),
      }),
      "./host/admin.ts": async () => ({
        createResource: mutationGeneric({ args: { id: v.string() }, handler: async () => "admin createResource" }),
        // Same name as a public operation: must not be picked for public calls
        getEventType: queryGeneric({ args: {}, handler: async () => "admin getEventType" }),
      }),
    });
    const merged = resolved({ publicApi: api.public, adminApi: api.admin });

    await expect(host.mutation(merged.createResource!, { id: "room" })).resolves.toBe("admin createResource");
    await expect(host.query(merged.getEventType, {})).resolves.toBe("public getEventType");
  });

  it("routes admin operations to a generated adminApi next to a plain-object publicApi", () => {
    const plainPublic = {
      getEventType: makeFunctionReference<"query">("public:getEventType"),
    } as unknown as PublicBookingAPI;
    const merged = resolved({ publicApi: plainPublic, adminApi: api.admin });
    expect(nameOf(merged, "createResource")).toBe("admin:createResource");
    expect(nameOf(merged, "getEventType")).toBe("public:getEventType");
  });
});

describe("plain-object adminApi", () => {
  it("resolves its operations and falls back to publicApi for missing admin names (deprecated)", () => {
    const plainAdmin: Partial<AdminBookingAPI> = {
      createResource: makeFunctionReference<"mutation">("admin:createResource"),
      listBookings: makeFunctionReference<"query">("admin:listBookings"),
    };
    const merged = resolved({ publicApi: api.public, adminApi: plainAdmin });
    expect(nameOf(merged, "createResource")).toBe("admin:createResource");
    expect(nameOf(merged, "listBookings")).toBe("admin:listBookings");
    expect(nameOf(merged, "deleteResource")).toBe("public:deleteResource");
  });

  it("no longer overrides public operations, which belong to publicApi", () => {
    // Non-literal object, so the public name passes the Partial<AdminBookingAPI> type
    const adminLike = {
      createResource: makeFunctionReference<"mutation">("admin:createResource"),
      getEventType: makeFunctionReference<"query">("admin:getEventType"),
    };
    const merged = resolved({ publicApi: api.public, adminApi: adminLike });
    expect(nameOf(merged, "getEventType")).toBe("public:getEventType");
    // Control: the object's admin operation is used
    expect(nameOf(merged, "createResource")).toBe("admin:createResource");
  });

  it("passes names outside both interfaces through as before", () => {
    const customAdmin = {
      createResource: makeFunctionReference<"mutation">("admin:createResource"),
      exportBookings: makeFunctionReference<"query">("admin:exportBookings"),
    };
    const withPlain = resolved({ publicApi: api.public, adminApi: customAdmin }) as BookingAPI &
      Record<string, never>;
    expect(getFunctionName(withPlain.exportBookings)).toBe("admin:exportBookings");

    const withGenerated = resolved({ publicApi: api.public, adminApi: api.admin }) as BookingAPI &
      Record<string, never>;
    expect(getFunctionName(withGenerated.exportBookings)).toBe("public:exportBookings");
  });
});

describe("without adminApi", () => {
  it("resolves admin names from publicApi (deprecated) and returns publicApi itself", () => {
    const merged = resolved({ publicApi: api.public });
    expect(nameOf(merged, "createResource")).toBe("public:createResource");
    expect(nameOf(merged, "getEventType")).toBe("public:getEventType");

    const plainPublic = { getEventType: makeFunctionReference<"query">("public:getEventType") } as unknown as PublicBookingAPI;
    const plain = resolved({ publicApi: plainPublic });
    expect(plain).toBe(plainPublic);
    expect(plain.createResource).toBeUndefined();
  });
});

describe("documented examples", () => {
  it("the admin layout and button from the JSDoc send admin:createResource", async () => {
    const { client, sent } = stubClient();
    // As in the useBookingAPI JSDoc
    function CreateResourceButton() {
      const bookingApi = useBookingAPI();
      const createResource = useMutation(bookingApi.createResource!);
      return createElement("button", { onClick: () => createResource({ id: "room" }) }, "Add room");
    }
    // As in the BookingProvider JSDoc
    function AdminLayout({ children }: { children: ReactNode }) {
      return createElement(BookingProvider, { publicApi: api.public, adminApi: api.admin, children });
    }
    render(createElement(ConvexProvider, { client },
      createElement(AdminLayout, null, createElement(CreateResourceButton))));

    fireEvent.click(screen.getByText("Add room"));
    await waitFor(() => expect(sent).toEqual(["admin:createResource"]));
  });
});
