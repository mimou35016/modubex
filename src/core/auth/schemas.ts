import { z } from "zod";
import { env } from "@/core/config/env";

/** Active password policy, derived from validated environment configuration. */
export const passwordRules = {
  minLength: env.AUTH_PASSWORD_MIN_LENGTH,
  maxLength: env.AUTH_PASSWORD_MAX_LENGTH,
  requireNumber: env.AUTH_PASSWORD_REQUIRE_NUMBER,
  requireSymbol: env.AUTH_PASSWORD_REQUIRE_SYMBOL,
} as const;

export const passwordSchema = z
  .string()
  .min(passwordRules.minLength, `Password must be at least ${passwordRules.minLength} characters.`)
  .max(passwordRules.maxLength, `Password must be at most ${passwordRules.maxLength} characters.`)
  .refine(
    (password) => !passwordRules.requireNumber || /\d/.test(password),
    "Password must contain at least one number.",
  )
  .refine(
    (password) => !passwordRules.requireSymbol || /[^A-Za-z0-9]/.test(password),
    "Password must contain at least one symbol.",
  );

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  password: passwordSchema,
  callbackURL: z.string().optional(),
});

export const resetRequestSchema = z.object({
  email: z.email(),
});

/**
 * Accepts both `password` (our form field) and `newPassword` (Better Auth's
 * field name) and exposes both after parsing so either caller works.
 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema.optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((value) => value.password !== undefined || value.newPassword !== undefined, {
    message: "Password is required.",
    path: ["password"],
  })
  .transform((value) => ({
    token: value.token,
    password: value.password ?? value.newPassword ?? "",
    newPassword: value.newPassword ?? value.password ?? "",
  }));

export const twoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  trustDevice: z.boolean().optional(),
});

export const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1),
  password: passwordSchema,
});
