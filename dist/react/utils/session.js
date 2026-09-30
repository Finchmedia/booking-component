const USER_ID_KEY = "convex-booking-session-id";
// Used when sessionStorage is blocked, disabled or full: stable for the page's lifetime
let memoryId;
/**
 * Get or create a session ID for the current browser session.
 * Used to identify users for presence tracking.
 *
 * Never throws. Without usable sessionStorage the ID is kept in memory, so it
 * is not stable across reloads.
 */
export function getSessionId() {
    if (typeof window === "undefined")
        return "server";
    try {
        let id = sessionStorage.getItem(USER_ID_KEY);
        if (!id) {
            // Generate a random ID: timestamp + random string
            id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            sessionStorage.setItem(USER_ID_KEY, id);
        }
        return id;
    }
    catch {
        // Presence is advisory: a per-page ID is enough to keep booking working
        memoryId ??=
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        return memoryId;
    }
}
//# sourceMappingURL=session.js.map