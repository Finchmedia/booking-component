/**
 * Creates a booking's management token: 64 lowercase hex characters from 32
 * bytes of `crypto.getRandomValues`.
 *
 * Convex seeds randomness per query/mutation run, and this helper claims no
 * more entropy than that source provides; it gives every creation path one
 * fixed, documented format. Tokens are compared exactly and never parsed, so
 * tokens in the earlier base-36 format keep working.
 */
export declare function generateManagementToken(): string;
//# sourceMappingURL=tokens.d.ts.map