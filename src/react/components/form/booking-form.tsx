"use client";

import React, { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventMetaPanel } from "../calendar/event-meta-panel.js";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "../../utils/validation.js";
import { formatDate, formatTimeDisplay } from "../../utils/formatting.js";
import type { BookingFormData } from "../../types.js";

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
  /** Optional: Show reschedule-specific messaging */
  isRescheduling?: boolean;
  /** Optional: Submission failure, shown as an alert that describes the submit button */
  submitError?: string;
  /**
   * Optional: Contact details to confirm read-only instead of editable fields.
   * The Booker passes the original booking's details when rescheduling, because
   * a reschedule keeps them. Submitting sends these details without validation.
   */
  readOnlyDetails?: BookingFormData;
  /** Optional: 12h/24h format of the selected time (default: "12h") */
  timeFormat?: "12h" | "24h";
  /** Optional: BCP 47 locale for the selected date and time (default: "en-US") */
  locale?: string;
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
  isRescheduling = false,
  submitError,
  readOnlyDetails,
  timeFormat = "12h",
  locale,
}) => {
  const submitErrorId = useId();
  const fieldId = useId();
  // Check if user has prefilled data
  const isPrefilled = !readOnlyDetails && !!(currentUser?.name || currentUser?.email);

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

  // Labels name their fields; errors describe the field they belong to
  const ids = (field: keyof BookingFormValues) => ({
    input: `${fieldId}-${field}`,
    error: `${fieldId}-${field}-error`,
  });
  const fieldState = (field: keyof BookingFormValues) => ({
    id: ids(field).input,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? ids(field).error : undefined,
  });

  const submitHandler = async (data: BookingFormValues) => {
    await onSubmit(data);
  };
  // Read-only details are confirmed as they are; there is nothing to validate.
  const handleFormSubmit = readOnlyDetails
    ? (event: React.FormEvent) => {
        event.preventDefault();
        void onSubmit(readOnlyDetails);
      }
    : handleSubmit(submitHandler);

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
          <h2
            data-step-heading=""
            tabIndex={-1}
            className="text-xl font-semibold text-foreground outline-none"
          >
            {isRescheduling ? "Confirm Reschedule" : "Enter Details"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isRescheduling ? "New time: " : ""}
            {formatDate(selectedSlot, timezone, locale)} at{" "}
            {formatTimeDisplay(selectedSlot, timeFormat, timezone, locale)}
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

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {readOnlyDetails ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
              <dl className="space-y-3 text-sm">
                {(
                  [
                    ["Name", readOnlyDetails.name],
                    ["Email", readOnlyDetails.email],
                    ["Phone Number", readOnlyDetails.phone],
                    ["Additional Notes", readOnlyDetails.notes],
                  ] as const
                ).map(([label, value]) =>
                  value ? (
                    <div key={label}>
                      <dt className="font-medium text-foreground">{label}</dt>
                      <dd className="whitespace-pre-wrap text-muted-foreground">{value}</dd>
                    </div>
                  ) : null
                )}
              </dl>
              <p className="text-xs text-muted-foreground">
                Your contact details stay the same.
              </p>
            </div>
          ) : (
            <>
              {/* Name Field */}
              <div className="space-y-2">
                <label htmlFor={ids("name").input} className="text-sm font-medium text-foreground">
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  {...register("name")}
                  {...fieldState("name")}
                  aria-required="true"
                  placeholder="John Doe"
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {errors.name && (
                  <p id={ids("name").error} className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor={ids("email").input} className="text-sm font-medium text-foreground">
                  Email <span aria-hidden="true">*</span>
                </label>
                <input
                  {...register("email")}
                  {...fieldState("email")}
                  aria-required="true"
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
                  <p id={ids("email").error} className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              {/* Phone Field */}
              <div className="space-y-2">
                <label htmlFor={ids("phone").input} className="text-sm font-medium text-foreground">
                  Phone Number
                </label>
                <input
                  {...register("phone")}
                  {...fieldState("phone")}
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {errors.phone && (
                  <p id={ids("phone").error} className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>

              {/* Notes Field */}
              <div className="space-y-2">
                <label htmlFor={ids("notes").input} className="text-sm font-medium text-foreground">
                  Additional Notes
                </label>
                <textarea
                  {...register("notes")}
                  {...fieldState("notes")}
                  placeholder="Please share anything that will help prepare for our meeting."
                  rows={4}
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none"
                />
                {errors.notes && (
                  <p id={ids("notes").error} className="text-sm text-destructive">{errors.notes.message}</p>
                )}
              </div>
            </>
          )}

          {submitError && (
            <p
              id={submitErrorId}
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

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
              aria-describedby={submitError ? submitErrorId : undefined}
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
                  {isRescheduling ? "Rescheduling..." : "Confirming..."}
                </span>
              ) : (
                isRescheduling ? "Confirm Reschedule" : "Confirm Booking"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
