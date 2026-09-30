/// <reference types="vite/client" />
/**
 * O8: one management-token generator with one format.
 *
 * createBooking, createProvisionalBooking and createMultiResourceBooking each
 * built the token from eight Math.random() base-36 segments plus a base-36
 * timestamp (91–97 characters of [0-9a-z]) under a comment promising
 * "64 hex chars". New tokens are exactly 64 lowercase hex characters. Tokens
 * are only ever compared exactly, so rows holding the earlier format keep
 * working, and a move keeps the token.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { generateManagementToken } from "./tokens.js";
import {
  BOOKER, LOCATION, TUESDAY, book, seedFungibleResource, seedResource, setup, utc, type T,
} from "./setup.test.js";

const HEX64 = /^[0-9a-f]{64}$/;
/** A token in the pre-0.4.3 format (base-36 with a timestamp suffix, 95 characters). */
const LEGACY_TOKEN = "k2j9x7q1zpw8m3v5t6y0r4s2u1o9i8e7w6q5a4s3d2f1g0h9j8k7l6z5x4c3v2b1n0m9q8w7e6r5t4y3u2i1on0p0c8w0";
const hour = (h: number) => utc(TUESDAY, `${String(h).padStart(2, "0")}:00`);

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedWithLegacyToken(t: T) {
  const seed = await seedResource(t);
  const created = await book(t, seed, hour(9), hour(10));
  await t.run((ctx) => ctx.db.patch(created._id, { managementToken: LEGACY_TOKEN }));
  return { seed, uid: created.uid };
}

describe("management token format", () => {
  test("every creation path stores 64 lowercase hex characters, all distinct", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const other = await seedResource(t, { resourceId: "res-2", eventTypeId: "et-2" });
    await seedFungibleResource(t, { eventTypeId: seed.eventTypeId });

    const tokens: string[] = [];
    for (let h = 8; h < 12; h++) {
      tokens.push((await book(t, seed, hour(h), hour(h + 1))).managementToken!);
      const provisional = await t.mutation(api.public.createProvisionalBooking, {
        resourceId: other.resourceId, eventTypeId: other.eventTypeId, start: hour(h), end: hour(h + 1),
        timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
      tokens.push(provisional.managementToken!);
      const bundle = await t.mutation(api.multi_resource.createMultiResourceBooking, {
        eventTypeId: seed.eventTypeId, resources: [{ resourceId: "pool-1" }],
        start: hour(h), end: hour(h + 1), timezone: "UTC", booker: BOOKER, location: LOCATION,
      });
      tokens.push(bundle.managementToken!);
    }

    expect(tokens).toHaveLength(12);
    for (const token of tokens) expect(token).toMatch(HEX64);
    expect(new Set(tokens).size).toBe(tokens.length);
    // CONTROL: the pattern rejects the earlier format.
    expect(LEGACY_TOKEN).not.toMatch(HEX64);
  });

  test("a move keeps the token, by id and by token", async () => {
    const { t } = setup();
    const seed = await seedResource(t);
    const created = await book(t, seed, hour(9), hour(10));
    const moved = await t.mutation(api.public.rescheduleBooking, {
      bookingId: created._id, newStart: hour(11), newEnd: hour(12),
    });
    const movedAgain = await t.mutation(api.public.rescheduleBookingByToken, {
      uid: moved.uid, token: created.managementToken!, newStart: hour(13), newEnd: hour(14),
    });
    expect([moved.managementToken, movedAgain.managementToken]).toEqual([
      created.managementToken, created.managementToken,
    ]);
  });
});

describe("tokens in the earlier format keep working", () => {
  test("getBookingByToken and rescheduleBookingByToken accept a legacy token", async () => {
    const { t } = setup();
    const { uid } = await seedWithLegacyToken(t);

    expect((await t.query(api.public.getBookingByToken, { uid, token: LEGACY_TOKEN })).uid).toBe(uid);
    const moved = await t.mutation(api.public.rescheduleBookingByToken, {
      uid, token: LEGACY_TOKEN, newStart: hour(11), newEnd: hour(12),
    });
    expect(moved.managementToken).toBe(LEGACY_TOKEN);
  });

  test("cancelBookingByToken accepts a legacy token; a different token is refused", async () => {
    const { t } = setup();
    const { uid } = await seedWithLegacyToken(t);

    // CONTROL: the comparison is still exact.
    await expect(
      t.mutation(api.public.cancelBookingByToken, { uid, token: LEGACY_TOKEN.slice(0, -1) })
    ).rejects.toThrow("Invalid token");
    await expect(
      t.query(api.public.getBookingByToken, { uid, token: "0".repeat(64) })
    ).rejects.toThrow("Invalid token");

    expect(await t.mutation(api.public.cancelBookingByToken, { uid, token: LEGACY_TOKEN })).toEqual({ success: true });
    expect((await t.query(api.public.getBookingByToken, { uid, token: LEGACY_TOKEN })).status).toBe("cancelled");
  });
});

describe("generateManagementToken", () => {
  test("falls back to the earlier construction only without Web Crypto", () => {
    expect(generateManagementToken()).toMatch(HEX64);

    vi.stubGlobal("crypto", undefined);
    const fallback = generateManagementToken();
    expect(fallback).toMatch(/^[0-9a-z]{40,}$/);
    expect(fallback).not.toMatch(HEX64);
  });
});
