import { z } from "zod";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeSearchParams(params: RawSearchParams): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key] = firstValue(value);
  }
  return normalized;
}

const pageField = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    const parsed = Number.parseInt(value ?? "1", 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1;
  });

const textField = z.string().trim().max(191).catch("").default("");

const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)))
  .optional()
  .catch("");

export const usersListParamsSchema = z.object({
  q: textField,
  page: pageField,
});

export const auditListParamsSchema = z.object({
  action: textField,
  userId: textField,
  module: textField,
  from: dateField,
  to: dateField,
  page: pageField,
});

export const modulesListParamsSchema = z.object({
  q: textField,
  state: z
    .enum(["all", "available", "installed", "enabled", "disabled"])
    .catch("all")
    .default("all"),
});

export const userIdParamSchema = z.string().trim().min(1).max(191);

export type AuditListParams = z.infer<typeof auditListParamsSchema>;
