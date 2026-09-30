"use client";

import React, { useId } from "react";
import { Clock, MapPin, Globe, User } from "lucide-react";
import { getTimezoneDisplayName } from "../../utils/timezone-utils.js";

interface EventType {
  title: string;
  description?: string;
  lengthInMinutes: number;
  lengthInMinutesOptions?: number[];
  locations?: Array<{
    type: string;
    address?: string;
    public?: boolean;
  }>;
  timezone?: string;
  lockTimeZoneToggle?: boolean;
}

interface EventMetaPanelProps {
  eventType: EventType | undefined;
  selectedDuration: number;
  onDurationChange: (duration: number) => void;
  userTimezone: string;
  onTimezoneChange: (timezone: string) => void;
  timezoneLocked: boolean;
  organizerName?: string; // Optional organizer name
  organizerAvatar?: string; // Optional organizer avatar URL
  readOnly?: boolean; // Hide interactive controls
}

export const EventMetaPanel: React.FC<EventMetaPanelProps> = ({
  eventType,
  selectedDuration,
  onDurationChange,
  userTimezone,
  onTimezoneChange: _onTimezoneChange,
  timezoneLocked: _timezoneLocked,
  organizerName = "Organizer",
  organizerAvatar,
  readOnly = false,
}) => {
  const durationName = useId();

  if (!eventType) {
    return (
      <div className="w-full p-4 border-b border-border md:w-60 lg:w-72 md:border-b-0 md:border-r">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-accent animate-pulse rounded" />
          <div className="h-6 w-full bg-accent animate-pulse rounded" />
          <div className="h-16 w-full bg-accent animate-pulse rounded" />
        </div>
      </div>
    );
  }

  // Format duration for display (e.g., 60 → "1h", 90 → "1h 30min")
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) return `${mins}min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  };

  // Get public address from locations
  const publicAddress = eventType.locations?.find(
    (loc) => loc.type === "address" && loc.public
  )?.address;

  return (
    <div className="w-full p-4 border-b border-border md:w-60 lg:w-72 md:border-b-0 md:border-r">
      <div className="space-y-4">
        {/* Avatar and Organizer Name */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
              {organizerAvatar ? (
                <img
                  src={organizerAvatar}
                  alt={organizerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {organizerName}
          </p>
        </div>

        {/* Event Title (the calendar step's heading) */}
        <div>
          <h1
            data-step-heading={readOnly ? undefined : ""}
            tabIndex={readOnly ? undefined : -1}
            className="text-lg font-semibold text-foreground break-words leading-tight outline-none"
          >
            {eventType.title}
          </h1>
        </div>

        {/* Description */}
        {eventType.description && (
          <div className="text-xs text-muted-foreground max-h-[140px] overflow-y-auto pr-2 break-words leading-relaxed">
            <p>{eventType.description}</p>
          </div>
        )}

        {/* Duration Options */}
        <div className="flex items-center text-xs text-muted-foreground">
          <Clock className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
          <div className="flex-1">
            {!readOnly &&
            eventType.lengthInMinutesOptions &&
            eventType.lengthInMinutesOptions.length > 1 ? (
              <fieldset className="relative max-w-full min-w-0">
                <legend className="sr-only">Duration</legend>
                <div className="border border-border rounded-md bg-card/50 p-1">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {eventType.lengthInMinutesOptions.map((duration) => (
                      <label key={duration} className="flex-1 cursor-pointer">
                        {/* Native radios: Tab reaches the group, arrow keys choose */}
                        <input
                          type="radio"
                          name={durationName}
                          value={duration}
                          checked={selectedDuration === duration}
                          onChange={() => onDurationChange(duration)}
                          className="peer sr-only"
                        />
                        <span
                          className={`block whitespace-nowrap text-center rounded px-3 py-1.5 text-xs font-medium transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                            selectedDuration === duration
                              ? "bg-accent text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {formatDuration(duration)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            ) : (
              <span className="text-xs">{formatDuration(selectedDuration)}</span>
            )}
          </div>
        </div>

        {/* Location */}
        {publicAddress && (
          <div className="flex items-start text-xs text-muted-foreground">
            <MapPin className="mr-2 mt-[2px] h-3.5 w-3.5 flex-shrink-0" />
            <p className="break-words line-clamp-2 text-xs">{publicAddress}</p>
          </div>
        )}

        {/* Timezone display */}
        {userTimezone && (
          <div className="flex items-center text-xs text-muted-foreground">
            <Globe className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-medium text-foreground text-xs">
              {getTimezoneDisplayName(userTimezone)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
