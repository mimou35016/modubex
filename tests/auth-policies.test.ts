import { afterEach, describe, expect, it, vi } from "vitest";

const { createAuditLog } = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: createAuditLog,
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  createAuditLog.mockReset();
});

describe("OAuth availability policy", () => {
  it("enables GitHub only when both credentials are present", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "github-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    vi.resetModules();

    const { enabledOAuthProviders } = await import("@/core/auth/oauth");

    expect(enabledOAuthProviders.map((provider) => provider.id)).toEqual(["github"]);
  });

  it("enables no providers when credentials are incomplete", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "github-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.resetModules();

    const { enabledOAuthProviders } = await import("@/core/auth/oauth");

    expect(enabledOAuthProviders).toEqual([]);
  });
});

describe("audit policy", () => {
  it("does not throw into the auth flow when persistence fails", async () => {
    createAuditLog.mockRejectedValueOnce(new Error("database offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { audit } = await import("@/core/audit");

    await expect(
      audit.log({
        action: "auth.sign_in.success",
        email: "user@example.com",
        metadata: { path: "/sign-in/email" },
      }),
    ).resolves.toBeUndefined();

    expect(createAuditLog).toHaveBeenCalledTimes(1);
  });

  it("does not throw when audit input is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { audit } = await import("@/core/audit");

    await expect(audit.log({ action: "" })).resolves.toBeUndefined();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
