"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventMetaPanel } from "../calendar/event-meta-panel.js";
import { bookingFormSchema, } from "../../utils/validation.js";
import { formatDateTime } from "../../utils/formatting.js";
export const BookingForm = ({ eventType, selectedSlot, selectedDuration, timezone, onSubmit, onBack, isSubmitting, currentUser, isRescheduling = false, submitError, readOnlyDetails, timeFormat = "12h", locale, }) => {
    const submitErrorId = useId();
    const fieldId = useId();
    // Check if user has prefilled data
    const isPrefilled = !readOnlyDetails && !!(currentUser?.name || currentUser?.email);
    const { register, handleSubmit, formState: { errors }, } = useForm({
        resolver: zodResolver(bookingFormSchema),
        defaultValues: {
            name: currentUser?.name ?? "",
            email: currentUser?.email ?? "",
            phone: "",
            notes: "",
        },
    });
    // Labels name their fields; errors describe the field they belong to
    const ids = (field) => ({
        input: `${fieldId}-${field}`,
        error: `${fieldId}-${field}-error`,
    });
    const fieldState = (field) => ({
        id: ids(field).input,
        "aria-invalid": errors[field] ? true : undefined,
        "aria-describedby": errors[field] ? ids(field).error : undefined,
    });
    const submitHandler = async (data) => {
        await onSubmit(data);
    };
    // Read-only details are confirmed as they are; there is nothing to validate.
    const handleFormSubmit = readOnlyDetails
        ? (event) => {
            event.preventDefault();
            void onSubmit(readOnlyDetails);
        }
        : handleSubmit(submitHandler);
    return (_jsxs("div", { className: "flex flex-col md:flex-row h-full", children: [_jsx(EventMetaPanel, { eventType: eventType, selectedDuration: selectedDuration, onDurationChange: () => { }, userTimezone: timezone, onTimezoneChange: () => { }, timezoneLocked: true, readOnly: true }), _jsxs("div", { className: "flex-1 p-6", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h2", { "data-step-heading": "", tabIndex: -1, className: "text-xl font-semibold text-foreground outline-none", children: isRescheduling ? "Confirm Reschedule" : "Enter Details" }), _jsxs("p", { className: "text-sm text-muted-foreground mt-1", children: [isRescheduling ? "New time: " : "", formatDateTime(Date.parse(selectedSlot), timezone, timeFormat, locale)] })] }), isPrefilled && (_jsxs("div", { className: "flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50 border border-border", children: [currentUser?.avatarUrl ? (_jsx("img", { src: currentUser.avatarUrl, alt: currentUser.name ?? "User", className: "w-10 h-10 rounded-full object-cover" })) : (_jsx("div", { className: "w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium", children: (currentUser?.name ?? currentUser?.email ?? "U")[0].toUpperCase() })), _jsxs("div", { className: "flex-1", children: [_jsxs("p", { className: "text-sm font-medium text-foreground", children: ["Booking as ", currentUser?.name ?? currentUser?.email] }), currentUser?.email && currentUser?.name && (_jsx("p", { className: "text-xs text-muted-foreground", children: currentUser.email }))] })] })), _jsxs("form", { onSubmit: handleFormSubmit, className: "space-y-4", children: [readOnlyDetails ? (_jsxs("div", { className: "space-y-3 rounded-lg border border-border bg-muted/50 p-4", children: [_jsx("dl", { className: "space-y-3 text-sm", children: [
                                            ["Name", readOnlyDetails.name],
                                            ["Email", readOnlyDetails.email],
                                            ["Phone Number", readOnlyDetails.phone],
                                            ["Additional Notes", readOnlyDetails.notes],
                                        ].map(([label, value]) => value ? (_jsxs("div", { children: [_jsx("dt", { className: "font-medium text-foreground", children: label }), _jsx("dd", { className: "whitespace-pre-wrap text-muted-foreground", children: value })] }, label)) : null) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Your contact details stay the same." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("label", { htmlFor: ids("name").input, className: "text-sm font-medium text-foreground", children: ["Name ", _jsx("span", { "aria-hidden": "true", children: "*" })] }), _jsx("input", { ...register("name"), ...fieldState("name"), "aria-required": "true", placeholder: "John Doe", className: "w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring" }), errors.name && (_jsx("p", { id: ids("name").error, className: "text-sm text-destructive", children: errors.name.message }))] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { htmlFor: ids("email").input, className: "text-sm font-medium text-foreground", children: ["Email ", _jsx("span", { "aria-hidden": "true", children: "*" })] }), _jsx("input", { ...register("email"), ...fieldState("email"), "aria-required": "true", type: "email", placeholder: "john@example.com", readOnly: !!currentUser?.email, className: `w-full px-3 py-2 rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring ${currentUser?.email
                                                    ? "bg-muted/50 cursor-not-allowed opacity-75"
                                                    : "bg-muted"}` }), errors.email && (_jsx("p", { id: ids("email").error, className: "text-sm text-destructive", children: errors.email.message }))] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: ids("phone").input, className: "text-sm font-medium text-foreground", children: "Phone Number" }), _jsx("input", { ...register("phone"), ...fieldState("phone"), type: "tel", placeholder: "+1 (555) 000-0000", className: "w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring" }), errors.phone && (_jsx("p", { id: ids("phone").error, className: "text-sm text-destructive", children: errors.phone.message }))] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: ids("notes").input, className: "text-sm font-medium text-foreground", children: "Additional Notes" }), _jsx("textarea", { ...register("notes"), ...fieldState("notes"), placeholder: "Please share anything that will help prepare for our meeting.", rows: 4, className: "w-full px-3 py-2 rounded-md border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none" }), errors.notes && (_jsx("p", { id: ids("notes").error, className: "text-sm text-destructive", children: errors.notes.message }))] })] })), submitError && (_jsx("p", { id: submitErrorId, role: "alert", className: "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive", children: submitError })), _jsxs("div", { className: "flex gap-3 pt-4", children: [_jsx("button", { type: "button", onClick: onBack, className: "flex-1 px-4 py-2 rounded-md border border-border bg-transparent text-muted-foreground font-medium hover:bg-muted hover:text-foreground transition-colors", children: "Back" }), _jsx("button", { type: "submit", disabled: isSubmitting, "aria-describedby": submitError ? submitErrorId : undefined, className: "flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors", children: isSubmitting ? (_jsxs("span", { className: "flex items-center justify-center", children: [_jsxs("svg", { className: "animate-spin -ml-1 mr-2 h-4 w-4", fill: "none", viewBox: "0 0 24 24", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })] }), isRescheduling ? "Rescheduling..." : "Confirming..."] })) : (isRescheduling ? "Confirm Reschedule" : "Confirm Booking") })] })] })] })] }));
};
//# sourceMappingURL=booking-form.js.map