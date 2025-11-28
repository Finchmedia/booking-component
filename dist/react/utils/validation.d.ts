import { z } from "zod";
export declare const bookingFormSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    phone?: string | undefined;
    notes?: string | undefined;
}, {
    name: string;
    email: string;
    phone?: string | undefined;
    notes?: string | undefined;
}>;
export type BookingFormValues = z.infer<typeof bookingFormSchema>;
//# sourceMappingURL=validation.d.ts.map