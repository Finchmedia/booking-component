// ============================================
// SHARED EMAIL STYLES
// ============================================

// Base styles used across all email templates
// Supports both dark mode (default) and light mode (via media query)

export const EMAIL_BASE_STYLES = `
    :root {
        color-scheme: dark light;
    }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        background-color: #1a1a1a;
        color: #fafafa;
    }
    .card {
        background-color: #262626;
        border-radius: 8px;
        border: 1px solid #404040;
        overflow: hidden;
    }
    .header {
        padding: 24px;
        text-align: center;
        border-bottom: 1px solid #404040;
    }
    .icon-circle {
        display: inline-block;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        line-height: 48px;
        margin-bottom: 16px;
    }
    .icon {
        font-size: 24px;
    }
    .title {
        color: #fafafa;
        margin: 0;
        font-size: 24px;
        font-weight: 600;
    }
    .content {
        padding: 24px;
    }
    .greeting {
        font-size: 16px;
        color: #fafafa;
        margin: 0 0 16px 0;
    }
    .subtitle {
        font-size: 14px;
        color: #a1a1aa;
        margin: 0 0 20px 0;
    }
    .details-card {
        background-color: #3a3a3a;
        padding: 16px;
        border-radius: 8px;
        border: 1px solid #404040;
        margin-bottom: 20px;
    }
    .event-title {
        margin: 0 0 12px 0;
        color: #fafafa;
        font-size: 16px;
        font-weight: 600;
    }
    .event-time {
        margin: 0;
        color: #a1a1aa;
        font-size: 14px;
    }
    .help-text {
        font-size: 13px;
        color: #a1a1aa;
        margin: 0;
    }
    .footer {
        padding: 16px 24px;
        border-top: 1px solid #404040;
        text-align: center;
    }
    .footer-text {
        font-size: 12px;
        color: #737373;
        margin: 0;
    }
    .reason {
        margin: 8px 0 0 0;
        color: #a1a1aa;
        font-size: 14px;
    }
    .status-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        margin-top: 12px;
    }
    .time-section {
        margin-bottom: 12px;
    }
    .time-label {
        font-size: 12px;
        color: #737373;
        font-weight: 500;
        text-transform: uppercase;
        margin: 0 0 4px 0;
    }
    .time-value {
        margin: 0;
        color: #fafafa;
        font-size: 14px;
    }
    .time-value.old {
        text-decoration: line-through;
        color: #a1a1aa;
    }
`;

export const EMAIL_LIGHT_MODE_STYLES = `
    @media (prefers-color-scheme: light) {
        body {
            background-color: #ffffff;
            color: #1a1a1a;
        }
        .card {
            background-color: #f5f5f5;
            border-color: #e5e5e5;
        }
        .header {
            border-bottom-color: #e5e5e5;
        }
        .title {
            color: #1a1a1a;
        }
        .greeting {
            color: #1a1a1a;
        }
        .subtitle {
            color: #737373;
        }
        .details-card {
            background-color: #e5e5e5;
            border-color: #e5e5e5;
        }
        .event-title {
            color: #1a1a1a;
        }
        .event-time {
            color: #737373;
        }
        .help-text {
            color: #737373;
        }
        .footer {
            border-top-color: #e5e5e5;
        }
        .footer-text {
            color: #a1a1aa;
        }
        .reason {
            color: #737373;
        }
        .time-label {
            color: #737373;
        }
        .time-value {
            color: #1a1a1a;
        }
        .time-value.old {
            color: #a1a1aa;
        }
    }
`;

// Icon color styles for different email types
export const ICON_STYLES = {
    success: {
        dark: {
            circleBackground: "rgba(34, 197, 94, 0.1)",
            iconColor: "#22c55e",
        },
        light: {
            circleBackground: "rgba(22, 163, 74, 0.15)",
            iconColor: "#16a34a",
        },
    },
    error: {
        dark: {
            circleBackground: "rgba(239, 68, 68, 0.1)",
            iconColor: "#ef4444",
        },
        light: {
            circleBackground: "rgba(220, 38, 38, 0.15)",
            iconColor: "#dc2626",
        },
    },
    warning: {
        dark: {
            circleBackground: "rgba(245, 158, 11, 0.1)",
            iconColor: "#f59e0b",
        },
        light: {
            circleBackground: "rgba(217, 119, 6, 0.15)",
            iconColor: "#d97706",
        },
    },
    info: {
        dark: {
            circleBackground: "rgba(59, 130, 246, 0.1)",
            iconColor: "#3b82f6",
        },
        light: {
            circleBackground: "rgba(37, 99, 235, 0.15)",
            iconColor: "#2563eb",
        },
    },
};

// Button styles (matched to frontend shadcn/ui design system)
export const BUTTON_STYLES = {
    primary: "display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border: none; border-radius: 10px; background-color: #2d2d2d; color: #fafafa; font-size: 14px; font-weight: 500; text-decoration: none;",
    // View Booking button (matches card styling - grey monochrome)
    viewBooking: "display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border: 1px solid #404040; border-radius: 10px; background-color: #3a3a3a; color: #fafafa; font-size: 14px; font-weight: 500; text-decoration: none;",
    success: "display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #22c55e; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 500;",
    warning: "display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 500;",
};

// Link styles
export const LINK_STYLES = {
    primary: "color: #3b82f6; text-decoration: none; font-size: 14px;",
    danger: "color: #ef4444; text-decoration: none; font-size: 14px;",
};

// Secondary action buttons (side-by-side layout, matched to frontend shadcn/ui design)
export const SECONDARY_BUTTON_STYLES = {
    // Reschedule button - white text for dark mode visibility
    primary: "display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border: 1px solid #404040; border-radius: 10px; background-color: transparent; color: #fafafa; font-size: 14px; font-weight: 500; text-decoration: none;",
    // Cancel button - red outline (not solid)
    outlined: "display: inline-flex; align-items: center; justify-content: center; padding: 9px 16px; border: 2px solid #e95b5b; border-radius: 10px; background-color: transparent; color: #e95b5b; font-size: 14px; font-weight: 500; text-decoration: none;",
};
