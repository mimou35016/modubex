import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSession,
  auditLog,
  auditActions,
  updateUser,
  changePassword,
  revokeSession,
  sessionFindFirst,
  headersGet,
  revalidatePath,
  loggerWarn,
} = vi.hoisted(() => ({
  requireSession: vi.fn(),
  auditLog: vi.fn(),
  auditActions: {
    profileNameUpdated: "profile.updated",
    profileUpdated: "profile.updated",
    authPasswordChanged: "auth.password.changed",
    passwordChanged: "auth.password.changed",
    usersSessionRevoked: "users.session.revoked",
  },
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  revokeSession: vi.fn(),
  sessionFindFirst: vi.fn(),
  headersGet: vi.fn(),
  revalidatePath: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/dal", () => ({ requireSession }));
vi.mock("@/core/audit", () => ({ audit: { log: auditLog }, auditActions }));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn, error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { updateUser, changePassword, revokeSession } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { session: { findFirst: sessionFindFirst } } }));

import {
  changePasswordAction,
  revokeOwnSessionAction,
  updateProfileNameAction,
} from "@/app/actions/profile";
import { configurePasswordRulesResolver, type PasswordRules } from "@/core/auth/schemas";

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

function auditEntry(index = 0): Record<string, unknown> {
  return auditLog.mock.calls[index]?.[0] as Record<string, unknown>;
}

let rules: PasswordRules;

beforeEach(() => {
  vi.clearAllMocks();
  rules = { minLength: 10, maxLength: 20, requireNumber: true, requireSymbol: true };
  configurePasswordRulesResolver(async () => rules);

  requireSession.mockResolvedValue({
    user: { id: "user_self", email: "self@example.com", name: "Original Name" },
    session: { id: "session_self" },
  });
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
    if (name === "user-agent") return "test-agent";
    return null;
  });
  updateUser.mockResolvedValue({});
  changePassword.mockResolvedValue({});
  revokeSession.mockResolvedValue({});
  sessionFindFirst.mockResolvedValue(null);
  auditLog.mockResolvedValue(undefined);
});

describe("profile name action", () => {
  it("rejects invalid names before calling Better Auth or auditing", async () => {
    const state = await updateProfileNameAction({}, form({ name: "   " }));

    expect(state.error).toBe("Enter your name.");
    expect(updateUser).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("audits the trimmed before/after name for the session user only", async () => {
    const state = await updateProfileNameAction(
      {},
      form({ name: "  Renamed User  ", userId: "user_other" }),
    );

    expect(state).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({
      body: { name: "Renamed User" },
      headers: expect.anything(),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "profile.updated",
        actor: expect.objectContaining({ userId: "user_self", ip: "203.0.113.7" }),
        targetType: "user",
        targetId: "user_self",
        before: { name: "Original Name" },
        after: { name: "Renamed User" },
        strict: true,
      }),
    );
    expect(JSON.stringify(auditEntry())).not.toContain("user_other");
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });
});

describe("password change action", () => {
  it("enforces the live settings policy instead of the bootstrap policy", async () => {
    rules = { minLength: 10, maxLength: 20, requireNumber: true, requireSymbol: true };

    const weak = await changePasswordAction(
      {},
      form({ currentPassword: "Current1!", newPassword: "short" }),
    );
    expect(weak.error).toContain("at least 10 characters");
    expect(changePassword).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();

    rules = { minLength: 10, maxLength: 20, requireNumber: false, requireSymbol: false };
    const valid = await changePasswordAction(
      {},
      form({ currentPassword: "Current1!", newPassword: "simplepass" }),
    );
    expect(valid).toEqual({ ok: true });
    expect(changePassword).toHaveBeenCalledTimes(1);
  });

  it("uses Better Auth session identity and audits without any password value", async () => {
    const state = await changePasswordAction(
      {},
      form({
        currentPassword: "Current1!",
        newPassword: "StrongPass1!",
        userId: "user_other",
      }),
    );

    expect(state).toEqual({ ok: true });
    expect(changePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "Current1!",
        newPassword: "StrongPass1!",
        revokeOtherSessions: false,
      },
      headers: expect.anything(),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.password.changed",
        actor: expect.objectContaining({ userId: "user_self" }),
        targetType: "user",
        targetId: "user_self",
        strict: true,
      }),
    );
    const serialized = JSON.stringify(auditEntry());
    expect(serialized).not.toContain("Current1!");
    expect(serialized).not.toContain("StrongPass1!");
    expect(serialized).not.toContain("user_other");
  });

  it("never echoes a provider error that quotes a submitted password", async () => {
    changePassword.mockRejectedValueOnce(new Error("Invalid password: StrongPass1!"));

    const state = await changePasswordAction(
      {},
      form({ currentPassword: "Current1!", newPassword: "StrongPass1!" }),
    );

    expect(state.error).toBeTruthy();
    expect(state.error).not.toContain("StrongPass1!");
    expect(state.error).not.toContain("Current1!");
    expect(auditLog).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining("StrongPass1!"));
  });
});

describe("session revocation action", () => {
  it("ignores a forged userId and refuses sessions not owned by the caller", async () => {
    const state = await revokeOwnSessionAction(
      {},
      form({ sessionId: "foreign_session", userId: "user_other" }),
    );

    expect(state).toEqual({ error: "That session is no longer active." });
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign_session", userId: "user_self" },
      select: expect.objectContaining({ id: true, token: true }),
    });
    expect(revokeSession).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("revokes the caller's session and audits without the session token", async () => {
    sessionFindFirst.mockResolvedValue({
      id: "own_session",
      token: "secret-token-value",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      ipAddress: "203.0.113.7",
      userAgent: "test-agent",
    });

    const state = await revokeOwnSessionAction({}, form({ sessionId: "own_session" }));

    expect(state).toEqual({ ok: true });
    expect(revokeSession).toHaveBeenCalledWith({
      body: { token: "secret-token-value" },
      headers: expect.anything(),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "users.session.revoked",
        actor: expect.objectContaining({ userId: "user_self" }),
        targetType: "session",
        targetId: "own_session",
        strict: true,
      }),
    );
    const serialized = JSON.stringify(auditEntry());
    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toContain("user_other");
  });
});
