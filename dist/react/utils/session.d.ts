/**
 * Get or create a session ID for the current browser session.
 * Used to identify users for presence tracking.
 *
 * Never throws. Without usable sessionStorage the ID is kept in memory, so it
 * is not stable across reloads.
 */
export declare function getSessionId(): string;
//# sourceMappingURL=session.d.ts.map