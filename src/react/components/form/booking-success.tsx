"use client";

import React from "react";
import { Calendar, CheckCircle, MapPin, User } from "lucide-react";
import type { Booking } from "../../types";
import { formatDateTime, formatDuration } from "../../utils/formatting";

interface EventType {
  title: string;
  description?: string;
  lengthInMinutes: number;
}

interface BookingSuccessProps {
  booking: Booking;
  eventType: EventType;
  onBookAnother: () => void;
}

export const BookingSuccess: React.FC<BookingSuccessProps> = ({
  booking,
  eventType,
  onBookAnother,
}) => {
  return (
    <div className="max-w-2xl mx-auto p-8">
      {/* Success Icon */}
      <div className="flex justify-center mb-6">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          You're booked!
        </h1>
        <p className="text-muted-foreground">
          A confirmation email has been sent to {booking.bookerEmail}
        </p>
      </div>

      {/* Booking Details Card */}
      <div className="bg-muted border border-border rounded-lg p-6 space-y-4 mb-6">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium text-foreground">{eventType.title}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDateTime(booking.start, booking.timezone)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDuration(booking.end - booking.start)} duration
            </p>
          </div>
        </div>

        {booking.location.value && (
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
            <p className="text-sm text-foreground">{booking.location.value}</p>
          </div>
        )}

        <div className="flex items-start gap-3">
          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
          <p className="text-sm text-foreground">{booking.bookerName}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          onClick={onBookAnother}
        >
          Book Another
        </button>
      </div>
    </div>
  );
};
