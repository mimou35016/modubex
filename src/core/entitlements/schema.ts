import { z } from "zod";
import { planSchema } from "./plans";

/**
 * Form schema for the single workspace License row. Kept outside the
 * "use server" action module so it can be unit tested and so Next's server
 * action export restrictions still apply.
 */
export const licenseUpdateSchema = z.object({
  plan: planSchema,
  licenseKey: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  validUntil: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine(
      (value) =>
        value === null ||
        (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
          value,
        ) &&
          !Number.isNaN(Date.parse(value))),
      { message: "Valid until must be a valid ISO date." },
    )
    .transform((value) => (value === null ? null : new Date(value))),
});

export type LicenseUpdateInput = z.infer<typeof licenseUpdateSchema>;
