import { z } from "zod";
import { env } from "@/core/config/env";

/** Shared shape for the env bootstrap rules and the live runtime rules. */
export type PasswordRules = {
  minLength: number;
  maxLength: number;
  requireNumber: boolean;
  requireSymbol: boolean;
};

/** Client-safe bootstrap policy derived from validated environment configuration. */
export const passwordRules = {
  minLength: env.AUTH_PASSWORD_MIN_LENGTH,
  maxLength: env.AUTH_PASSWORD_MAX_LENGTH,
  requireNumber: env.AUTH_PASSWORD_REQUIRE_NUMBER,
  requireSymbol: env.AUTH_PASSWORD_REQUIRE_SYMBOL,
} as const satisfies PasswordRules;

/** Synchronous schema builder; callers choose bootstrap or live rules. */
export function buildPasswordSchema(rules: PasswordRules) {
  return z
    .string()
    .min(rules.minLength, `Password must be at least ${rules.minLength} characters.`)
    .max(rules.maxLength, `Password must be at most ${rules.maxLength} characters.`)
    .refine((password) => !rules.requireNumber || /\d/.test(password), {
      message: "Password must contain at least one number.",
    })
    .refine((password) => !rules.requireSymbol || /[^A-Za-z0-9]/.test(password), {
      message: "Password must contain at least one symbol.",
    });
}

/** Synchronous bootstrap schema used by client forms and static schemas. */
export const passwordSchema = buildPasswordSchema(passwordRules);

type PasswordRulesResolver = () => Promise<PasswordRules>;

// The server entrypoint injects the settings-backed resolver. Keeping the
// dependency inverted prevents Prisma/next/cache from entering client bundles.
let livePasswordRulesResolver: PasswordRulesResolver = async () => passwordRules;

export function configurePasswordRulesResolver(resolver: PasswordRulesResolver): void {
  livePasswordRulesResolver = resolver;
}

/** Resolves the live settings policy, then validates with the same zod rules. */
export async function validatePasswordWithSettings(password: string) {
  const rules = await livePasswordRulesResolver();
  return buildPasswordSchema(rules).safeParse(password);
}

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
  roleId: z.string().min(1),
});

/**
 * Invitations created before the `roleId` migration only carry the legacy
 * role key. Prefer the id so role renames cannot change the granted role.
 */
export function invitationRoleLookup(invitation: {
  roleId?: string | null;
  role?: string | null;
}): { by: "id"; value: string } | { by: "key"; value: string } | null {
  const roleId = invitation.roleId?.trim();
  if (roleId) return { by: "id", value: roleId };

  const roleKey = invitation.role?.trim();
  return roleKey ? { by: "key", value: roleKey } : null;
}

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1),
  password: passwordSchema,
});
