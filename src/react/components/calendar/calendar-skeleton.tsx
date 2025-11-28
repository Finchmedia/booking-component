"use client";

import React from "react";

/**
 * Skeleton loading state for the Calendar component.
 * Shows the full 3-column structure with placeholder content.
 */
export const CalendarSkeleton: React.FC = () => {
  return (
    <div className="bg-card overflow-hidden rounded-xl border border-border shadow">
      <div className="flex flex-col md:flex-row">
        {/* Event Meta Panel Skeleton */}
        <div className="w-full p-4 border-b border-border md:w-60 lg:w-72 md:border-b-0 md:border-r">
          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex flex-col gap-1.5">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
            {/* Title */}
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
            {/* Duration */}
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 bg-muted animate-pulse rounded" />
              <div className="h-8 w-full bg-muted animate-pulse rounded-md" />
            </div>
            {/* Timezone */}
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 bg-muted animate-pulse rounded" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>

        {/* Calendar Grid Skeleton */}
        <div className="flex-1 p-4 lg:max-w-[472px] lg:mx-auto">
          {/* Month Navigation */}
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-5 bg-muted animate-pulse rounded" />
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-5 bg-muted animate-pulse rounded" />
          </div>

          {/* Day Headers */}
          <div className="mb-1 grid grid-cols-7 gap-2">
            {["M", "T", "W", "T", "F", "S", "S"].map((_, i) => (
              <div
                key={i}
                className="flex h-14 w-14 items-center justify-center"
              >
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>

          {/* Calendar Days Grid (6 rows x 7 cols = 42 days) */}
          <div className="grid grid-cols-7 gap-2">
            {[...Array(42)].map((_, i) => (
              <div
                key={i}
                className="h-14 w-14 bg-muted animate-pulse rounded-full"
              />
            ))}
          </div>
        </div>

        {/* Time Slots Panel Skeleton */}
        <div className="w-full border-t border-border md:w-60 lg:w-72 md:border-t-0 md:border-l">
          <div className="p-4">
            {/* Date Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-6 w-16 bg-muted animate-pulse rounded-md" />
            </div>
          </div>

          {/* Time Slots */}
          <div className="px-6 pb-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-9 bg-muted animate-pulse rounded-md"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
