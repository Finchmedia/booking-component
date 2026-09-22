import { z } from "zod";
export declare const bookingFormSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BookingFormValues = z.infer<typeof bookingFormSchema>;
//# sourceMappingURL=validation.d.ts.map