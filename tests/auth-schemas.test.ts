import { afterEach, describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  buildPasswordSchema,
  configurePasswordRulesResolver,
  inviteSchema,
  passwordRules,
  passwordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  twoFactorSchema,
  validatePasswordWithSettings,
} from "@/core/auth/schemas";

afterEach(() => {
  configurePasswordRulesResolver(async () => passwordRules);
});

function validPassword(): string {
  const prefix = "a".repeat(Math.max(0, passwordRules.minLength - 2));
  return `${prefix}1!`.padEnd(passwordRules.minLength, "a");
}

describe("auth schemas", () => {
  it("exposes an internally consistent password policy", () => {
    expect(passwordRules.minLength).toBeGreaterThan(0);
    expect(passwordRules.maxLength).toBeGreaterThanOrEqual(passwordRules.minLength);
    expect(passwordSchema.safeParse(validPassword()).success).toBe(true);
  });

  it("rejects passwords outside the configured length bounds", () => {
    expect(passwordSchema.safeParse("a".repeat(passwordRules.minLength - 1)).success).toBe(false);
    expect(passwordSchema.safeParse("a1".repeat(passwordRules.maxLength)).success).toBe(false);
  });

  it("enforces the configured number and symbol rules", () => {
    const valid = validPassword();
    if (passwordRules.requireNumber) {
      expect(passwordSchema.safeParse(valid.replace(/\d/g, "a")).success).toBe(false);
    }
    if (passwordRules.requireSymbol) {
      expect(passwordSchema.safeParse(valid.replace(/[^A-Za-z0-9]/g, "a")).success).toBe(false);
    }
  });

  it("validates sign-in and sign-up payloads", () => {
    expect(signInSchema.safeParse({ email: "user@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);

    expect(
      signUpSchema.safeParse({
        name: "Jane",
        email: "jane@example.com",
        password: validPassword(),
      }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({
        name: "",
        email: "jane@example.com",
        password: validPassword(),
      }).success,
    ).toBe(false);
  });

  it("accepts both reset-password field names", () => {
    const password = validPassword();
    const byPassword = resetPasswordSchema.safeParse({ token: "abc", password });
    const byNewPassword = resetPasswordSchema.safeParse({ token: "abc", newPassword: password });

    expect(byPassword.success).toBe(true);
    expect(byNewPassword.success).toBe(true);
    if (byPassword.success && byNewPassword.success) {
      expect(byPassword.data.password).toBe(password);
      expect(byNewPassword.data.newPassword).toBe(password);
    }
    expect(resetPasswordSchema.safeParse({ token: "abc" }).success).toBe(false);
  });

  it("validates 2FA, invitation and acceptance payloads", () => {
    expect(twoFactorSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(twoFactorSchema.safeParse({ code: "12ab56" }).success).toBe(false);

    expect(inviteSchema.parse({ email: "teammate@example.com", roleId: "role_123" }).roleId).toBe(
      "role_123",
    );
    expect(inviteSchema.safeParse({ email: "bad", roleId: "role_123" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "teammate@example.com", role: "member" }).success).toBe(
      false,
    );
    expect(inviteSchema.safeParse({ email: "teammate@example.com", roleId: "" }).success).toBe(
      false,
    );

    expect(
      acceptInvitationSchema.safeParse({
        token: "token",
        name: "Teammate",
        password: validPassword(),
      }).success,
    ).toBe(true);
    expect(
      acceptInvitationSchema.safeParse({
        token: "token",
        name: "Teammate",
        password: "short",
      }).success,
    ).toBe(false);
  });
});

describe("buildPasswordSchema", () => {
  it("applies an explicit rule set without reading settings", () => {
    const schema = buildPasswordSchema({
      minLength: 8,
      maxLength: 10,
      requireNumber: true,
      requireSymbol: true,
    });

    expect(schema.safeParse("Abcdef1!").success).toBe(true);
    expect(schema.safeParse("Abcdefg!").success).toBe(false);
    expect(schema.safeParse("Abcdefg1").success).toBe(false);
    expect(schema.safeParse("Ab1!").success).toBe(false);
    expect(schema.safeParse("Abcdefg1!xy").success).toBe(false);
  });

  it("validates through the configured live settings resolver", async () => {
    configurePasswordRulesResolver(async () => ({
      minLength: 16,
      maxLength: 20,
      requireNumber: false,
      requireSymbol: false,
    }));

    expect((await validatePasswordWithSettings("a".repeat(15))).success).toBe(false);
    expect((await validatePasswordWithSettings("a".repeat(16))).success).toBe(true);
    expect((await validatePasswordWithSettings("a".repeat(21))).success).toBe(false);
  });
});
