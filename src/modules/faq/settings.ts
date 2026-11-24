import { z } from "zod";

/** Runtime settings rendered by the generic module settings page. */
export const faqSettingsSchema = z.object({
  perPage: z.number().int().min(1).max(50).default(10),
  emptyMessage: z.string().trim().min(1).max(120).default("No questions yet."),
});

export type FaqSettings = z.infer<typeof faqSettingsSchema>;
