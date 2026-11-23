import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  requirePermission,
  PermissionDeniedError,
  headersGet,
  callOrder,
  requireModuleInstallEntitlement,
  requireEntitlement,
  hasEntitlement,
  EntitlementDeniedError,
  getEntitlements,
  loggerWarn,
  getManifest,
  install,
  enable,
  disable,
  updateSettings,
  uninstall,
} = vi.hoisted(() => {
  class PermissionDeniedError extends Error {
    readonly permission: string;

    constructor(permission: string) {
      super(`Missing required permission: ${permission}`);
      this.name = "PermissionDeniedError";
      this.permission = permission;
    }
  }

  class EntitlementDeniedError extends Error {
    readonly entitlement: string;

    constructor(entitlement: string) {
      super(`Missing entitlement: ${entitlement}`);
      this.name = "EntitlementDeniedError";
      this.entitlement = entitlement;
    }
  }

  const callOrder: string[] = [];

  return {
    requirePermission: vi.fn(),
    PermissionDeniedError,
    headersGet: vi.fn(),
    callOrder,
    requireModuleInstallEntitlement: vi.fn(),
    requireEntitlement: vi.fn(),
    hasEntitlement: vi.fn(),
    EntitlementDeniedError,
    getEntitlements: vi.fn(),
    loggerWarn: vi.fn(),
    getManifest: vi.fn(),
    install: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    updateSettings: vi.fn(),
    uninstall: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));

vi.mock("@/core/auth/dal", () => ({ PermissionDeniedError, requirePermission }));

vi.mock("@/core/entitlements/guards", () => ({
  EntitlementDeniedError,
  hasEntitlement,
  requireEntitlement,
  requireModuleInstallEntitlement,
}));

vi.mock("@/core/entitlements/service", () => ({ getEntitlements }));

vi.mock("@/core/logging/logger", () => ({ logger: { warn: loggerWarn } }));

vi.mock("@/core/modules/registry", () => ({ getModuleManifest: getManifest }));

vi.mock("@/core/modules/service", () => ({
  installModule: install,
  enableModule: enable,
  disableModule: disable,
  updateModuleSettings: updateSettings,
  uninstallModule: uninstall,
}));

import {
  disableModuleAction,
  enableModuleAction,
  installModuleAction,
  uninstallModuleAction,
  updateModuleSettingsAction,
} from "@/app/actions/modules";

const manifest = {
  id: "demo",
  name: "Demo",
  description: "Demo module",
  version: "1.0.0",
  author: "Team",
  icon: "puzzle",
  dependencies: [],
  permissions: [],
  routes: [],
  settingsSchema: z.object({ enabled: z.boolean(), count: z.number() }),
  ownedModels: [],
  migrations: [],
};

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;

  requirePermission.mockImplementation(async (key: string) => {
    callOrder.push(`permission:${key}`);
    return { session: { user: { id: "user_1", email: "owner@example.com" } } };
  });
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
    if (name === "x-real-ip") return null;
    if (name === "user-agent") return "test-agent";
    return null;
  });
  requireModuleInstallEntitlement.mockImplementation(async () => {
    callOrder.push("installEntitlement");
    return {};
  });
  requireEntitlement.mockImplementation(async (key: string) => {
    callOrder.push(`entitlement:${key}`);
    return {};
  });
  hasEntitlement.mockImplementation(
    (_entitlements: unknown, key: string) => key !== "modules.premium",
  );
  getEntitlements.mockResolvedValue({});
  getManifest.mockReturnValue(manifest);
  install.mockResolvedValue({ id: "demo", state: "installed" });
  enable.mockResolvedValue(undefined);
  disable.mockResolvedValue(undefined);
  updateSettings.mockResolvedValue(undefined);
  uninstall.mockResolvedValue({ dataRetained: false });
});

describe("module server actions", () => {
  it("denies the action before checking entitlements when permission is missing", async () => {
    requirePermission.mockRejectedValueOnce(new PermissionDeniedError("modules.manage"));

    const state = await installModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ error: "You do not have permission to perform this action." });
    expect(requireModuleInstallEntitlement).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it("checks permission before the module-install entitlement", async () => {
    const state = await installModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ ok: true, message: "Module installed." });
    expect(callOrder.slice(0, 2)).toEqual(["permission:modules.manage", "installEntitlement"]);
    expect(install).toHaveBeenCalledWith({
      moduleId: "demo",
      actor: {
        userId: "user_1",
        email: "owner@example.com",
        ip: "203.0.113.7",
        userAgent: "test-agent",
      },
    });
  });

  it("returns an entitlement message when the store entitlement is missing", async () => {
    requireModuleInstallEntitlement.mockRejectedValueOnce(
      new EntitlementDeniedError("modules.store"),
    );

    const state = await enableModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ error: "Your plan does not include this module." });
    expect(enable).not.toHaveBeenCalled();
  });

  it("uses the single entitlement seam for declared plan and entitlement requirements", async () => {
    getManifest.mockReturnValue({ ...manifest, requiredPlan: "enterprise" });

    const planState = await installModuleAction({}, form({ moduleId: "demo" }));
    expect(planState).toEqual({ error: "Your plan does not include this module." });
    expect(hasEntitlement).toHaveBeenCalledWith(expect.anything(), "modules.premium");
    expect(install).not.toHaveBeenCalled();

    getManifest.mockReturnValue({ ...manifest, requiredEntitlement: "modules.premium" });
    requireEntitlement.mockRejectedValueOnce(new EntitlementDeniedError("modules.premium"));
    const keyState = await installModuleAction({}, form({ moduleId: "demo" }));
    expect(keyState).toEqual({ error: "Your plan does not include this module." });
    expect(requireEntitlement).toHaveBeenCalledWith("modules.premium");
  });

  it("rejects forged module ids and unknown config fields", async () => {
    const forgedId = await installModuleAction({}, form({ moduleId: "Bad_ID" }));
    expect(forgedId.error).toBeTruthy();
    expect(install).not.toHaveBeenCalled();

    const unknownField = await updateModuleSettingsAction(
      {},
      form({ moduleId: "demo", "config.admin": "true" }),
    );
    expect(unknownField).toEqual({ error: "Unknown module setting: admin" });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("rejects empty settings submissions", async () => {
    const state = await updateModuleSettingsAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ error: "No module settings were submitted." });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("coerces config fields using the manifest schema and saves parsed values", async () => {
    const state = await updateModuleSettingsAction(
      {},
      form({ moduleId: "demo", "config.enabled": "true", "config.count": "42" }),
    );

    expect(state).toEqual({ ok: true, message: "Module settings saved." });
    expect(updateSettings).toHaveBeenCalledWith({
      moduleId: "demo",
      values: { enabled: true, count: 42 },
      actor: {
        userId: "user_1",
        email: "owner@example.com",
        ip: "203.0.113.7",
        userAgent: "test-agent",
      },
    });
  });

  it("forwards uninstall mode and typed confirmation to the service", async () => {
    const state = await uninstallModuleAction(
      {},
      form({ moduleId: "demo", mode: "delete-data", confirmation: "demo" }),
    );

    expect(state).toEqual({ ok: true, message: "Module uninstalled." });
    expect(uninstall).toHaveBeenCalledWith({
      moduleId: "demo",
      mode: "delete-data",
      confirmation: "demo",
      actor: expect.objectContaining({ userId: "user_1" }),
    });
  });

  it("returns action-state messages for lifecycle failures", async () => {
    const dependencyError = new Error("Enabled modules still depend on demo: dependent");
    dependencyError.name = "ModuleDependencyError";
    disable.mockRejectedValueOnce(dependencyError);

    const state = await disableModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({
      error: "Enabled modules still depend on demo: dependent",
    });
    expect(loggerWarn).toHaveBeenCalled();
  });
});
