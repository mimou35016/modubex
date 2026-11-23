import { z } from "zod";

/**
 * Environment values are infrastructure-only: they are read from the process
 * environment and never exposed through runtime settings. Defaults keep a
 * database-less M0 build working; production must supply real values.
 */
function booleanFromEnv(fallback: "true" | "false") {
  return z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");
}

const envSchema = z
  .object({
    DATABASE_URL: z.url().optional(),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-before-production"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).max(256).default(12),
    AUTH_PASSWORD_MAX_LENGTH: z.coerce.number().int().min(1).max(256).default(128),
    AUTH_PASSWORD_REQUIRE_NUMBER: booleanFromEnv("true"),
    AUTH_PASSWORD_REQUIRE_SYMBOL: booleanFromEnv("false"),
    AUTH_REQUIRE_EMAIL_VERIFICATION: booleanFromEnv("false"),
    AUTH_2FA_REQUIRED: booleanFromEnv("false"),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    SEED_OWNER_EMAIL: z.email().default("owner@modubex.local"),
    // Default is a local-only development credential; override in real environments.
    SEED_OWNER_PASSWORD: z.string().min(1).default("Owner!Local2026#"),

    // Seed default for the runtime audit.retentionDays setting. 0 keeps logs
    // forever; the runtime value lives in the settings table.
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(0),
  })
  .refine((values) => values.AUTH_PASSWORD_MAX_LENGTH >= values.AUTH_PASSWORD_MIN_LENGTH, {
    path: ["AUTH_PASSWORD_MAX_LENGTH"],
    message: "AUTH_PASSWORD_MAX_LENGTH must be >= AUTH_PASSWORD_MIN_LENGTH",
  });

export const env = envSchema.parse(process.env);
