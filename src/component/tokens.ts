/**
 * Creates a booking's management token: 64 lowercase hex characters from 32
 * bytes of `crypto.getRandomValues`.
 *
 * Convex seeds randomness per query/mutation run, and this helper claims no
 * more entropy than that source provides; it gives every creation path one
 * fixed, documented format. Tokens are compared exactly and never parsed, so
 * tokens in the earlier base-36 format keep working.
 */
export function generateManagementToken(): string {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // Earlier construction, only for a runtime without Web Crypto.
  const segments: string[] = [];
  for (let i = 0; i < 8; i++) {
    segments.push(Math.random().toString(36).substring(2));
  }
  return segments.join("") + Date.now().toString(36);
}
