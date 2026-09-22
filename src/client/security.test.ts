import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  anyApi,
  defineSchema,
  defineTable,
  mutationGeneric,
  queryGeneric,
  type ApiFromModules,
  type DataModelFromSchemaDefinition,
  type FilterApi,
  type FunctionReference,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { convexTest } from "convex-test";
import * as clientExports from "./index.js";
import { makeInternalBookingAPI } from "./index.js";
import { components, modules } from "./setup.test.js";
import { register } from "../test.js";

// A host authorization fixture. These are actual registered host exports:
// convex-test calls them across the host/component boundary with real identities.
// Production hosts connect their auth provider and maintain memberships themselves.
const hostSchema = defineSchema({
  memberships: defineTable({
    tokenIdentifier: v.string(),
    organizationId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  }).index("by_identity_org", ["tokenIdentifier", "organizationId"]),
});
type HostModel = DataModelFromSchemaDefinition<typeof hostSchema>;
const hostQuery: QueryBuilder<HostModel, "public"> = queryGeneric;
const hostMutation: MutationBuilder<HostModel, "public"> = mutationGeneric;

async function requireOrganizationAdmin(
  ctx: GenericQueryCtx<HostModel>,
  organizationId: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Authentication required");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_identity_org", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier).eq("organizationId", organizationId),
    )
    .unique();
  if (membership?.role !== "admin") throw new ConvexError("Forbidden");
}

export const createResource = hostMutation({
  args: { id: v.string(), organizationId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireOrganizationAdmin(ctx, args.organizationId);
    return ctx.runMutation(components.booking.resources.createResource, {
      ...args,
      type: "room",
      timezone: "UTC",
    });
  },
});

export const renameResource = hostMutation({
  args: { id: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const resource = await ctx.runQuery(components.booking.resources.getResource, { id: args.id });
    if (!resource) throw new ConvexError("Resource not found");
    // Read ownership from the target, never from a client-supplied organization.
    await requireOrganizationAdmin(ctx, resource.organizationId);
    return ctx.runMutation(components.booking.resources.updateResource, args);
  },
});

export const getBooking = hostQuery({
  args: { bookingId: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.runQuery(components.booking.public.getBooking, args);
    if (!booking) throw new ConvexError("Booking not found");
    const resource = await ctx.runQuery(components.booking.resources.getResource, {
      id: booking.resourceId,
    });
    if (!resource) throw new ConvexError("Resource not found");
    await requireOrganizationAdmin(ctx, resource.organizationId);
    return booking;
  },
});

const internalHelpers = makeInternalBookingAPI(components.booking);
export const { wipeAllData, wipeAllBookingData } = internalHelpers;
type HostExports = {
  createResource: typeof createResource;
  renameResource: typeof renameResource;
  getBooking: typeof getBooking;
  wipeAllData: typeof wipeAllData;
  wipeAllBookingData: typeof wipeAllBookingData;
};
type HostApi = ApiFromModules<{ "security.test": HostExports }>;
type BrowserApi = FilterApi<HostApi, FunctionReference<"query" | "mutation", "public">>;
const hostApi = (anyApi as unknown as HostApi)["security.test"];

function initHost() {
  const t = convexTest(hostSchema, modules);
  register(t);
  return t;
}
type Host = ReturnType<typeof initHost>;

async function seedOrganization(t: Host, organizationId: string) {
  return t.run(async (ctx) => {
    const resourceId = `room-${organizationId}`;
    const eventTypeId = `event-${organizationId}`;
    await ctx.runMutation(components.booking.resources.createResource, {
      id: resourceId,
      organizationId,
      name: resourceId,
      type: "room",
      timezone: "UTC",
    });
    await ctx.runMutation(components.booking.public.createEventType, {
      id: eventTypeId,
      slug: eventTypeId,
      organizationId,
      title: "Consultation",
      lengthInMinutes: 60,
      timezone: "UTC",
      lockTimeZoneToggle: false,
      locations: [],
    });
    await ctx.runMutation(components.booking.resource_event_types.linkResourceToEventType, {
      resourceId,
      eventTypeId,
    });
    const booking = await ctx.runMutation(components.booking.public.createBooking, {
      resourceId,
      eventTypeId,
      start: Date.UTC(2027, 2, 9, 9),
      end: Date.UTC(2027, 2, 9, 10),
      timezone: "UTC",
      booker: { name: "Private booker", email: `${organizationId}@example.com` },
      location: { type: "address" },
    });
    if (!booking) throw new Error("Expected seeded booking");
    return { resourceId, bookingId: booking._id };
  });
}

describe("internal factory and authorized host exports", () => {
  let t: Host;
  let organizationA: Awaited<ReturnType<typeof seedOrganization>>;
  let organizationB: Awaited<ReturnType<typeof seedOrganization>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = initHost();
    organizationA = await seedOrganization(t, "org-a");
    organizationB = await seedOrganization(t, "org-b");
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        tokenIdentifier: "https://auth.example|admin-a",
        organizationId: "org-a",
        role: "admin",
      });
      await ctx.db.insert("memberships", {
        tokenIdentifier: "https://auth.example|member-a",
        organizationId: "org-a",
        role: "member",
      });
    });
  });

  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("all generated operations are internal, including maintenance and PII reads", () => {
    // convex-test intentionally permits direct internal calls; inspect the actual
    // Convex registration flag and codegen API types to prove browser exclusion.
    for (const [name, operation] of Object.entries(internalHelpers)) {
      expect(operation, name).toHaveProperty("isInternal", true);
      expect(operation, name).not.toHaveProperty("isPublic");
    }
    expect(clientExports).not.toHaveProperty("makeBookingAPI");
    expectTypeOf<keyof BrowserApi["security.test"]>().toEqualTypeOf<
      "createResource" | "renameResource" | "getBooking"
    >();
  });

  test("anonymous callers cannot create resources, change setup or read booking PII", async () => {
    await expect(t.mutation(hostApi.createResource, {
      id: "anonymous-room", organizationId: "org-a", name: "Unauthorized",
    })).rejects.toThrow("Authentication required");
    await expect(t.mutation(hostApi.renameResource, {
      id: organizationA.resourceId, name: "Unauthorized",
    })).rejects.toThrow("Authentication required");
    await expect(t.query(hostApi.getBooking, {
      bookingId: organizationA.bookingId,
    })).rejects.toThrow("Authentication required");
  });

  test("signed-in non-admins cannot administer resources or read booking PII", async () => {
    const member = t.withIdentity({ tokenIdentifier: "https://auth.example|member-a" });
    await expect(member.mutation(hostApi.createResource, {
      id: "member-room", organizationId: "org-a", name: "Unauthorized",
    })).rejects.toThrow("Forbidden");
    await expect(member.mutation(hostApi.renameResource, {
      id: organizationA.resourceId, name: "Unauthorized",
    })).rejects.toThrow("Forbidden");
    await expect(member.query(hostApi.getBooking, {
      bookingId: organizationA.bookingId,
    })).rejects.toThrow("Forbidden");
  });

  test("an organization A admin cannot read or mutate organization B", async () => {
    const admin = t.withIdentity({ tokenIdentifier: "https://auth.example|admin-a" });
    await expect(admin.mutation(hostApi.createResource, {
      id: "injected-room", organizationId: "org-b", name: "Unauthorized",
    })).rejects.toThrow("Forbidden");
    await expect(admin.mutation(hostApi.renameResource, {
      id: organizationB.resourceId, name: "Unauthorized",
    })).rejects.toThrow("Forbidden");
    await expect(admin.query(hostApi.getBooking, {
      bookingId: organizationB.bookingId,
    })).rejects.toThrow("Forbidden");
    const untouched = await t.run((ctx) => ctx.runQuery(
      components.booking.resources.getResource, { id: organizationB.resourceId },
    ));
    expect(untouched?.name).toBe(organizationB.resourceId);
  });

  test("the same auth subject from a different issuer has no membership", async () => {
    const impersonator = t.withIdentity({
      subject: "admin-a",
      tokenIdentifier: "https://untrusted.example|admin-a",
    });
    await expect(impersonator.query(hostApi.getBooking, {
      bookingId: organizationA.bookingId,
    })).rejects.toThrow("Forbidden");
  });

  test("an authorized admin can manage and read only their own organization", async () => {
    const admin = t.withIdentity({ tokenIdentifier: "https://auth.example|admin-a" });
    await admin.mutation(hostApi.createResource, {
      id: "new-room", organizationId: "org-a", name: "New room",
    });
    await admin.mutation(hostApi.renameResource, {
      id: organizationA.resourceId, name: "Renamed room",
    });
    const booking = await admin.query(hostApi.getBooking, { bookingId: organizationA.bookingId });
    expect(booking.bookerEmail).toBe("org-a@example.com");
    const renamed = await t.run((ctx) => ctx.runQuery(
      components.booking.resources.getResource, { id: organizationA.resourceId },
    ));
    expect(renamed?.name).toBe("Renamed room");
  });
});
