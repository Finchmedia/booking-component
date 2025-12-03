"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventMetaPanel } from "../calendar/event-meta-panel";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "../../utils/validation";
import { formatDate, formatTimeDisplay } from "../../utils/formatting";
import type { BookingFormData } from "../../types";

// Define a local interface for EventType to match EventMetaPanel's expectation
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

/**
 * Current user information for prefilling the form
 * This data typically comes from the authentication provider
 */
export interface CurrentUser {
  /** User's display name */
  name?: string;
  /** User's email address */
  email?: string;
  /** User's avatar URL */
  avatarUrl?: string;
}

interface BookingFormProps {
  eventType: EventType;
  selectedSlot: string; // ISO timestamp
  selectedDuration: number;
  timezone: string;
  onSubmit: (data: BookingFormData) => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
  /** Optional: Current logged-in user for prefilling name/email */
  currentUser?: CurrentUser;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  eventType,
  selectedSlot,
  selectedDuration,
  timezone,
  onSubmit,
  onBack,
  isSubmitting,
  currentUser,
}) => {
  // Check if user has prefilled data
  const isPrefilled = !!(currentUser?.name || currentUser?.email);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      name: currentUser?.name ?? "",
      email: currentUser?.email ?? "",
      phone: "",
      notes: "",
    },
  });

  const submitHandler = async (data: BookingFormValues) => {
    await onSubmit(data);
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Left: Event Summary (reuse EventMetaPanel with read-only variant) */}
      <EventMetaPanel
        eventType={eventType}
        selectedDuration={selectedDuration}
        onDurationChange={() => {}} // No-op in read-only
        userTimezone={timezone}
        onTimezoneChange={() => {}} // No-op in read-only
        timezoneLocked={true}
        readOnly={true}
      />

      {/* Right: Booking Form */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            Enter Details
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(selectedSlot, timezone)} at{" "}
            {formatTimeDisplay(selectedSlot, "12h", timezone)}
          </p>
        </div>

        {/* User identity indicator when logged in */}
        {isPrefilled && (
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50 border border-border">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name ?? "User"}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                {(currentUser?.name ?? currentUser?.email ?? "U")[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Booking as {currentUser?.name ?? currentUser?.email}
              </p>
              {currentUser?.email && currentUser?.name && (
                <p className="text-xs text-muted-foreground">{currentUser.email}</p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(submitHandler)} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Name *
            </label>
            <input
              {...register("name")}
              placeholder="John Doe"
              className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Email *
            </label>
            <input
              {...register("email")}
              type="email"
              placeholder="john@example.com"
              readOnly={!!currentUser?.email}
              className={`w-full px-3 py-2 rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring ${
                currentUser?.email
                  ? "bg-muted/50 cursor-not-allowed opacity-75"
                  : "bg-muted"
              }`}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Phone Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Phone Number
            </label>
            <input
              {...register("phone")}
              type="tel"
              placeholder="+1 (555) 000-0000"
              className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

          {/* Notes Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Additional Notes
            </label>
            <textarea
              {...register("notes")}
              placeholder="Please share anything that will help prepare for our meeting."
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none"
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 px-4 py-2 rounded-md border border-border bg-transparent text-muted-foreground font-medium hover:bg-muted hover:text-foreground transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Confirming...
                </span>
              ) : (
                "Confirm Booking"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
