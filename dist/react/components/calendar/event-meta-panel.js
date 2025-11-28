"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Clock, MapPin, Globe, User } from "lucide-react";
import { getTimezoneDisplayName } from "../../utils/timezone-utils";
export const EventMetaPanel = ({ eventType, selectedDuration, onDurationChange, userTimezone, onTimezoneChange, timezoneLocked, organizerName = "Organizer", organizerAvatar, readOnly = false, }) => {
    if (!eventType) {
        return (_jsx("div", { className: "w-full p-4 border-b border-border md:w-60 lg:w-72 md:border-b-0 md:border-r", children: _jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "h-4 w-24 bg-accent animate-pulse rounded" }), _jsx("div", { className: "h-6 w-full bg-accent animate-pulse rounded" }), _jsx("div", { className: "h-16 w-full bg-accent animate-pulse rounded" })] }) }));
    }
    // Format duration for display (e.g., 60 → "1h", 90 → "1h 30min")
    const formatDuration = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0)
            return `${mins}min`;
        if (mins === 0)
            return `${hours}h`;
        return `${hours}h ${mins}min`;
    };
    // Get public address from locations
    const publicAddress = eventType.locations?.find((loc) => loc.type === "address" && loc.public)?.address;
    return (_jsx("div", { className: "w-full p-4 border-b border-border md:w-60 lg:w-72 md:border-b-0 md:border-r", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsx("div", { className: "h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden", children: organizerAvatar ? (_jsx("img", { src: organizerAvatar, alt: organizerName, className: "h-full w-full object-cover" })) : (_jsx(User, { className: "h-4 w-4 text-muted-foreground" })) }) }), _jsx("p", { className: "text-xs font-medium text-muted-foreground", children: organizerName })] }), _jsx("div", { children: _jsx("h1", { className: "text-lg font-semibold text-foreground break-words leading-tight", children: eventType.title }) }), eventType.description && (_jsx("div", { className: "text-xs text-muted-foreground max-h-[140px] overflow-y-auto pr-2 break-words leading-relaxed", children: _jsx("p", { children: eventType.description }) })), _jsxs("div", { className: "flex items-center text-xs text-muted-foreground", children: [_jsx(Clock, { className: "mr-2 h-3.5 w-3.5 flex-shrink-0" }), _jsx("div", { className: "flex-1", children: !readOnly &&
                                eventType.lengthInMinutesOptions &&
                                eventType.lengthInMinutesOptions.length > 1 ? (_jsx("div", { className: "relative max-w-full", children: _jsx("div", { className: "border border-border rounded-md bg-card/50 p-1", children: _jsx("ul", { className: "flex items-center gap-1 overflow-x-auto no-scrollbar", children: eventType.lengthInMinutesOptions.map((duration) => (_jsx("li", { onClick: () => onDurationChange(duration), className: `flex-1 cursor-pointer text-center rounded px-3 py-1.5 text-xs font-medium transition-all duration-200 ${selectedDuration === duration
                                                ? "bg-accent text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`, children: _jsx("div", { className: "whitespace-nowrap", children: formatDuration(duration) }) }, duration))) }) }) })) : (_jsx("span", { className: "text-xs", children: formatDuration(selectedDuration) })) })] }), publicAddress && (_jsxs("div", { className: "flex items-start text-xs text-muted-foreground", children: [_jsx(MapPin, { className: "mr-2 mt-[2px] h-3.5 w-3.5 flex-shrink-0" }), _jsx("p", { className: "break-words line-clamp-2 text-xs", children: publicAddress })] })), userTimezone && (_jsxs("div", { className: "flex items-center text-xs text-muted-foreground cursor-pointer hover:text-foreground transition", children: [_jsx(Globe, { className: "mr-2 h-3.5 w-3.5 flex-shrink-0" }), _jsx("span", { className: "font-medium text-foreground text-xs", children: getTimezoneDisplayName(userTimezone) })] }))] }) }));
};
//# sourceMappingURL=event-meta-panel.js.map