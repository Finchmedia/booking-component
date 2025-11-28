const USER_ID_KEY = "convex-booking-session-id";
/**
 * Get or create a session ID for the current browser session.
 * Used to identify users for presence tracking.
 */
export function getSessionId() {
    if (typeof window === "undefined")
        return "server";
    let id = sessionStorage.getItem(USER_ID_KEY);
    if (!id) {
        // Generate a random ID: timestamp + random string
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem(USER_ID_KEY, id);
    }
    return id;
}
//# sourceMappingURL=session.js.map