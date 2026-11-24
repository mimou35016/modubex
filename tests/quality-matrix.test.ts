import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ModuleDefinition, ModuleManifest } from "@/core/modules/manifest";

const {
  authGetSession,
  headersGet,
  redirect,
  RedirectError,
  getCacheReadsEnabled,
  auditLog,
  loggerWarn,
  loggerError,
  transaction,
  tx,
  revalidateTag,
  revalidatePath,
  syncSystemRolePermissions,
  cleanupHook,
  registryControl,
  controls,
  prisma,
} = vi.hoisted(() => {
  class RedirectError extends Error {
    readonly digest = "NEXT_REDIRECT;quality-matrix";

    constructor(path: string) {
      super(`Redirect to ${path}`);
      this.name = "RedirectError";
    }
  }

  const tx = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    userRole: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn(), create: vi.fn() },
    permission: { upsert: vi.fn(), deleteMany: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    moduleInstall: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
  };

  const prisma = {
    user: { findUnique: vi.fn() },
    role: { findUnique: vi.fn() },
    moduleInstall: { findMany: vi.fn() },
    setting: { findMany: vi.fn(), findUnique: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
    license: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };

  return {
    authGetSession: vi.fn(),
    headersGet: vi.fn(),
    redirect: vi.fn(),
    RedirectError,
    getCacheReadsEnabled: vi.fn(),
    auditLog: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    transaction: prisma.$transaction,
    tx,
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    syncSystemRolePermissions: vi.fn(),
    cleanupHook: vi.fn(),
    registryControl: { manifests: [] as unknown[], definitions: new Map<string, unknown>() },
    controls: {
      permissionKeys: [] as string[],
      licenseRow: null as null | { plan: unknown; entitlements: unknown; validUntil: unknown },
      moduleStates: [] as Array<{ moduleId: string; state: string }>,
    },
    prisma,
  };
});

vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag,
  revalidatePath,
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authGetSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma }));

vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn, error: loggerError, info: vi.fn() },
}));

vi.mock("@/core/audit/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/audit/audit")>();
  return { ...actual, audit: { log: auditLog } };
});

vi.mock("@/core/settings/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/settings/service")>();
  return { ...actual, getCacheReadsEnabled };
});

vi.mock("@/core/rbac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/rbac/service")>();
  return { ...actual, syncSystemRolePermissions };
});

vi.mock("@/core/modules/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/modules/registry")>();
  return {
    ...actual,
    moduleDefinitions: actual.moduleDefinitions,
    getModuleManifest: (id: string) =>
      (registryControl.manifests.find((item) => (item as { id?: string }).id === id) as
        ModuleManifest | undefined) ?? actual.getModuleManifest(id),
    getModuleDefinition: (id: string) =>
      (registryControl.definitions.get(id) as ModuleDefinition | undefined) ??
      actual.getModuleDefinition(id),
    getModuleManifests: () =>
      registryControl.manifests.length > 0
        ? (registryControl.manifests as ModuleManifest[])
        : actual.getModuleManifests(),
    validateModuleDefinitions: actual.validateModuleDefinitions,
  };
});

// state.ts imports the registry by relative path, so mirror the fixture view here.
vi.mock("@/core/modules/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/modules/state")>();
  return {
    ...actual,
    readModuleStates: async (client: {
      moduleInstall: {
        findMany(args: unknown): Promise<Array<{ moduleId: string; state: string }>>;
      };
    }) => {
      const rows = await client.moduleInstall.findMany({ where: { workspaceId: "" } });
      const states: Record<string, string> = {};
      for (const manifest of registryControl.manifests as ModuleManifest[]) {
        states[manifest.id] =
          rows.find((row) => row.moduleId === manifest.id)?.state ?? "available";
      }
      return states;
    },
  };
});

import { installModuleAction } from "@/app/actions/modules";
import { PermissionDeniedError, requirePagePermission, requirePermission } from "@/core/auth/dal";
import { getEntitlements } from "@/core/entitlements/service";
import { normalizePlan, planEntitlements } from "@/core/entitlements/plans";
import { ModuleDependencyError, ModuleStateError } from "@/core/modules/errors";
import { moduleDefinitions } from "@/core/modules/registry";
import { disableModule, installModule, uninstallModule } from "@/core/modules/service";
import {
  deleteRole,
  setUserActive,
  systemRolePermissionDiff,
  unassignRole,
  updateRole,
  wouldRemoveLastActiveOwner,
} from "@/core/rbac/service";
import { updateSettings } from "@/core/settings/service";

const actor = { userId: "user_1", email: "owner@example.com" };
const signedInSession = { user: { id: "user_1", email: "owner@example.com", role: "owner" } };

function moduleFixture(id: string, dependencies: readonly string[] = []) {
  return {
    id,
    name: `${id} module`,
    description: `Quality matrix fixture for ${id}.`,
    version: "1.0.0",
    author: "Modubex tests",
    icon: "puzzle",
    dependencies: [...dependencies],
    permissions: [{ key: `${id}.read`, description: `Read ${id} data.` }],
    routes: [
      {
        key: "home",
        path: "",
        labelKey: `modules.${id}.home`,
        sidebar: { labelKey: `modules.${id}.home`, icon: "puzzle" },
      },
    ],
    settingsSchema: z.object({ enabled: z.boolean().default(false) }),
    ownedModels: [],
    migrations: [],
  };
}

const demoManifest = moduleFixture("demo");
const baseManifest = moduleFixture("base");
const dependentManifest = moduleFixture("dependent", ["base"]);

function moduleRow(moduleId: string, state: string) {
  return {
    moduleId,
    state,
    version: "1.0.0",
    config: {},
    installedById: null,
    installedAt: null,
    enabledAt: null,
    disabledAt: null,
    uninstalledAt: null,
    dataRetained: false,
  };
}

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();

  authGetSession.mockResolvedValue(signedInSession);
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
    if (name === "user-agent") return "quality-matrix-tests";
    return null;
  });
  redirect.mockImplementation((path: string): never => {
    throw new RedirectError(path);
  });
  getCacheReadsEnabled.mockResolvedValue(true);
  auditLog.mockResolvedValue(undefined);
  syncSystemRolePermissions.mockResolvedValue(undefined);
  cleanupHook.mockResolvedValue({ deleted: { demoItem: 2 } });
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

  prisma.user.findUnique.mockImplementation((args: { select?: { roles?: unknown } }) => {
    if (args?.select && "roles" in args.select) {
      return Promise.resolve({
        banned: false,
        roles: controls.permissionKeys.map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        })),
      });
    }
    return Promise.resolve({ id: "user_1", banned: false });
  });
  prisma.license.findFirst.mockImplementation(async () => controls.licenseRow);
  prisma.setting.findMany.mockResolvedValue([]);
  prisma.setting.findUnique.mockResolvedValue(null);
  prisma.setting.createMany.mockResolvedValue({ count: 0 });
  prisma.setting.upsert.mockResolvedValue({});

  tx.setting.findUnique.mockResolvedValue({ value: "Modubex" });
  tx.setting.upsert.mockResolvedValue({});
  tx.user.findUnique.mockResolvedValue({ banned: false });
  tx.user.update.mockResolvedValue({});
  tx.role.findUnique.mockResolvedValue({
    id: "role_owner",
    key: "owner",
    isSystem: true,
    workspaceId: "",
    permissions: [],
  });
  tx.role.update.mockResolvedValue({ permissions: [] });
  tx.role.delete.mockResolvedValue({});
  tx.userRole.findUnique.mockResolvedValue({ id: "assignment_1", role: { key: "owner" } });
  tx.userRole.count.mockResolvedValue(1);
  tx.userRole.delete.mockResolvedValue({});
  tx.userRole.create.mockResolvedValue({ id: "assignment_2" });
  tx.permission.upsert.mockResolvedValue({});
  tx.permission.deleteMany.mockResolvedValue({ count: 1 });
  tx.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
  tx.rolePermission.createMany.mockResolvedValue({ count: 1 });
  tx.moduleInstall.findMany.mockImplementation(async () =>
    controls.moduleStates.map((item) => moduleRow(item.moduleId, item.state)),
  );
  tx.moduleInstall.findUnique.mockResolvedValue(null);
  tx.moduleInstall.upsert.mockResolvedValue({ id: "row_1" });
  tx.moduleInstall.update.mockResolvedValue({});
  tx.moduleInstall.delete.mockResolvedValue({});

  controls.permissionKeys = [];
  controls.licenseRow = { plan: "pro", entitlements: ["modules.store"], validUntil: null };
  controls.moduleStates = [{ moduleId: "demo", state: "available" }];

  registryControl.manifests = [demoManifest, baseManifest, dependentManifest];
  registryControl.definitions.clear();
  registryControl.definitions.set("demo", {
    manifest: demoManifest,
    routes: { home: () => null },
    cleanup: cleanupHook,
  });
});

describe("M6.6 quality matrix — RBAC guards (AC3)", () => {
  it("requirePermission denies a missing key and does not fall back to role names", async () => {
    controls.permissionKeys = [];

    await expect(requirePermission("users.update")).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(authGetSession).toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_1" },
        select: expect.objectContaining({ roles: expect.anything() }),
      }),
    );
  });

  it("requirePagePermission redirects to /forbidden when the key is absent despite an Owner role", async () => {
    controls.permissionKeys = [];

    await expect(requirePagePermission("app.access")).rejects.toBeInstanceOf(RedirectError);
    expect(redirect).toHaveBeenCalledWith("/forbidden");
  });

  it("requirePermission succeeds only when the exact permission key is granted", async () => {
    controls.permissionKeys = ["users.update"];

    const result = await requirePermission("users.update");

    expect(result.session).toEqual(signedInSession);
    expect(result.permissionKeys).toContain("users.update");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("M6.6 quality matrix — last Owner and locked roles (AC4)", () => {
  it("pure last-Owner guard blocks the only active Owner but allows a second one", () => {
    const lastOwner = {
      isOwnerRole: true,
      hasOwnerAssignment: true,
      targetIsActive: true,
      activeOwnerCount: 1,
    };

    expect(wouldRemoveLastActiveOwner(lastOwner)).toBe(true);
    expect(wouldRemoveLastActiveOwner({ ...lastOwner, activeOwnerCount: 2 })).toBe(false);
    expect(wouldRemoveLastActiveOwner({ ...lastOwner, isOwnerRole: false })).toBe(false);
  });

  it("unassignRole refuses to remove the only active Owner before writing", async () => {
    tx.userRole.count.mockResolvedValue(1);

    await expect(unassignRole({ userId: "user_1", roleId: "role_owner", actor })).rejects.toThrow(
      /last active Owner/i,
    );

    expect(tx.userRole.delete).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("setUserActive refuses to deactivate the only active Owner", async () => {
    tx.userRole.count.mockResolvedValue(1);

    await expect(setUserActive({ userId: "user_1", active: false, actor })).rejects.toThrow(
      /last active Owner/i,
    );

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("keeps system roles locked against edits and deletion", async () => {
    await expect(
      updateRole({
        roleId: "role_owner",
        name: "Renamed owner",
        permissionKeys: ["users.update"],
        actor,
      }),
    ).rejects.toThrow(/System roles cannot be edited/);
    await expect(deleteRole({ roleId: "role_owner", actor })).rejects.toThrow(
      /System roles cannot be deleted/,
    );

    expect(tx.role.update).not.toHaveBeenCalled();
    expect(tx.role.delete).not.toHaveBeenCalled();
  });

  it("rejects over-grants when diffing a locked system role bundle", () => {
    expect(systemRolePermissionDiff("admin", ["roles.assign_owner", "not.a.permission"])).toEqual({
      toAdd: expect.arrayContaining(["app.access"]),
      toRemove: expect.arrayContaining(["roles.assign_owner", "not.a.permission"]),
    });
    expect(systemRolePermissionDiff("owner", ["roles.assign_owner"]).toRemove).toEqual([]);
  });
});

describe("M6.6 quality matrix — module lifecycle (AC5/AC6/AC7)", () => {
  it("requires modules.manage before touching the entitlement seam", async () => {
    controls.permissionKeys = [];

    const state = await installModuleAction({}, form({ moduleId: "demo" }));

    expect(state.error).toMatch(/permission/i);
    expect(prisma.license.findFirst).not.toHaveBeenCalled();
    expect(tx.moduleInstall.upsert).not.toHaveBeenCalled();
  });

  it("requires modules.store through getEntitlements before installing", async () => {
    controls.permissionKeys = ["modules.manage"];
    controls.licenseRow = { plan: "free", entitlements: ["modules.store"], validUntil: null };

    const denied = await installModuleAction({}, form({ moduleId: "demo" }));
    expect(denied).toEqual({ error: "Your plan does not include this module." });
    expect(prisma.license.findFirst).toHaveBeenCalledWith({ where: { workspaceId: "" } });
    expect(tx.moduleInstall.upsert).not.toHaveBeenCalled();

    controls.licenseRow = { plan: "pro", entitlements: [], validUntil: null };
    const allowed = await installModuleAction({}, form({ moduleId: "demo" }));
    expect(allowed).toEqual({ ok: true, message: "Module installed." });
    expect(tx.moduleInstall.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { moduleId: "demo" } }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.installed",
        targetId: "demo",
        client: tx,
        strict: true,
      }),
    );
  });

  it("evaluates a declared requiredPlan through the entitlement seam", async () => {
    controls.permissionKeys = ["modules.manage"];
    controls.licenseRow = { plan: "pro", entitlements: ["modules.premium"], validUntil: null };
    registryControl.manifests = [
      { ...demoManifest, requiredPlan: "enterprise" },
      baseManifest,
      dependentManifest,
    ];

    const state = await installModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ error: "Your plan does not include this module." });
    expect(prisma.license.findFirst).toHaveBeenCalled();
    expect(tx.moduleInstall.upsert).not.toHaveBeenCalled();
  });

  it("evaluates a declared requiredEntitlement through the entitlement seam", async () => {
    controls.permissionKeys = ["modules.manage"];
    controls.licenseRow = { plan: "pro", entitlements: [], validUntil: null };
    registryControl.manifests = [
      { ...demoManifest, requiredEntitlement: "modules.premium" },
      baseManifest,
      dependentManifest,
    ];

    const state = await installModuleAction({}, form({ moduleId: "demo" }));

    expect(state).toEqual({ error: "Your plan does not include this module." });
    expect(prisma.license.findFirst).toHaveBeenCalled();
    expect(tx.moduleInstall.upsert).not.toHaveBeenCalled();
  });

  it("blocks installing a module whose dependency is only installed, not enabled", async () => {
    controls.moduleStates = [
      { moduleId: "demo", state: "available" },
      { moduleId: "base", state: "installed" },
    ];
    registryControl.manifests = [
      { ...demoManifest, dependencies: ["base"] },
      baseManifest,
      dependentManifest,
    ];

    await expect(installModule({ moduleId: "demo", actor })).rejects.toBeInstanceOf(
      ModuleDependencyError,
    );

    expect(tx.moduleInstall.upsert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("blocks disabling a module that still has enabled dependents", async () => {
    controls.moduleStates = [
      { moduleId: "base", state: "enabled" },
      { moduleId: "dependent", state: "enabled" },
    ];
    registryControl.manifests = [baseManifest, dependentManifest];

    await expect(disableModule({ moduleId: "base", actor })).rejects.toBeInstanceOf(
      ModuleDependencyError,
    );

    expect(tx.moduleInstall.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("forwards keep-data uninstall mode and audits retained data", async () => {
    controls.moduleStates = [{ moduleId: "demo", state: "enabled" }];
    tx.moduleInstall.findUnique.mockResolvedValue(moduleRow("demo", "enabled"));

    const result = await uninstallModule({
      moduleId: "demo",
      mode: "keep-data",
      confirmation: "",
      actor,
    });

    expect(result).toEqual({ dataRetained: true });
    expect(tx.moduleInstall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "available", dataRetained: true }),
      }),
    );
    expect(tx.moduleInstall.delete).not.toHaveBeenCalled();
    expect(cleanupHook).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.uninstalled",
        metadata: expect.objectContaining({
          mode: "keep-data",
          dataRetained: true,
          confirmationMatched: true,
        }),
        client: tx,
        strict: true,
      }),
    );
  });

  it("forwards delete-data mode, runs cleanup, and audits purged data", async () => {
    controls.moduleStates = [{ moduleId: "demo", state: "enabled" }];
    tx.moduleInstall.findUnique.mockResolvedValue(moduleRow("demo", "enabled"));

    const result = await uninstallModule({
      moduleId: "demo",
      mode: "delete-data",
      confirmation: "demo",
      actor,
    });

    expect(result).toEqual({ dataRetained: false });
    expect(cleanupHook).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: "demo", actor, client: tx }),
    );
    expect(tx.permission.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["demo.read"] } },
    });
    expect(tx.moduleInstall.delete).toHaveBeenCalledWith({ where: { moduleId: "demo" } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.uninstalled",
        metadata: expect.objectContaining({
          mode: "delete-data",
          dataRetained: false,
          cleanup: { demoItem: 2 },
          permissionsRemoved: ["demo.read"],
        }),
        client: tx,
        strict: true,
      }),
    );
  });

  it("requires typed delete confirmation before any data deletion", async () => {
    controls.moduleStates = [{ moduleId: "demo", state: "enabled" }];
    tx.moduleInstall.findUnique.mockResolvedValue(moduleRow("demo", "enabled"));

    await expect(
      uninstallModule({
        moduleId: "demo",
        mode: "delete-data",
        confirmation: "not-demo",
        actor,
      }),
    ).rejects.toBeInstanceOf(ModuleStateError);

    expect(transaction).not.toHaveBeenCalled();
    expect(cleanupHook).not.toHaveBeenCalled();
    expect(tx.moduleInstall.delete).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe("M6.6 quality matrix — entitlements (AC7)", () => {
  it("normalizes malformed and unknown plans to Free", () => {
    expect(normalizePlan("unknown")).toBe("free");
    expect(normalizePlan({ tier: "enterprise" })).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan("")).toBe("free");
    expect(normalizePlan("PRO")).toBe("pro");
  });

  it("maps Pro to modules.store and Enterprise to modules.premium", () => {
    expect(planEntitlements.free).not.toContain("modules.store");
    expect(planEntitlements.pro).toContain("modules.store");
    expect(planEntitlements.enterprise).toContain("modules.premium");
  });

  it("ignores forged entitlement JSON in the license row", async () => {
    controls.licenseRow = {
      plan: "free",
      entitlements: ["modules.store", "modules.premium"],
      validUntil: null,
    };

    const entitlements = await getEntitlements();

    expect(entitlements.plan).toBe("free");
    expect(entitlements.has("modules.store")).toBe(false);
    expect(entitlements.has("modules.premium")).toBe(false);
    expect(prisma.license.findFirst).toHaveBeenCalledWith({ where: { workspaceId: "" } });
  });

  it("degrades a malformed persisted plan to Free without reading its JSON grants", async () => {
    controls.licenseRow = {
      plan: { tier: "enterprise" },
      entitlements: ["modules.premium"],
      validUntil: null,
    };

    const entitlements = await getEntitlements();

    expect(entitlements.plan).toBe("free");
    expect(entitlements.has("modules.premium")).toBe(false);
  });
});

describe("M6.6 quality matrix — settings invalidation (AC8)", () => {
  it("validates, audits, and revalidates a runtime setting update", async () => {
    await updateSettings({ "site.name": "Acme" }, actor);

    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "site.name" },
        update: expect.objectContaining({ value: "Acme", updatedById: actor.userId }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.updated",
        before: { "site.name": "Modubex" },
        after: { "site.name": "Acme" },
        client: tx,
        strict: true,
      }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("settings", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/audit");
  });

  it("rejects invalid and unknown values before any write or revalidation", async () => {
    await expect(updateSettings({ "audit.retentionDays": -1 }, actor)).rejects.toThrow();
    await expect(updateSettings({ "not.a.key": "x" } as never, actor)).rejects.toThrow(
      /Unknown setting key/,
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects infrastructure keys as read-only", async () => {
    await expect(
      updateSettings({ "infrastructure.authSecret": "secret" } as never, actor),
    ).rejects.toThrow(/read-only/);

    expect(transaction).not.toHaveBeenCalled();
    expect(tx.setting.upsert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("M6.6 quality matrix — zero fake UI registry contract (AC2)", () => {
  const generatedRoutes = moduleDefinitions.flatMap((definition) =>
    definition.manifest.routes.map((route) => ({ definition, route })),
  );

  it("declares a component key and prefixed sidebar label for every generated route", () => {
    const missingComponents = generatedRoutes
      .filter(({ definition, route }) => typeof definition.routes[route.key] !== "function")
      .map(({ definition, route }) => `${definition.manifest.id}/${route.key}`);
    const badSidebarLabels = generatedRoutes
      .filter(({ definition, route }) => {
        const labelKey = route.sidebar?.labelKey;
        return labelKey !== undefined && !labelKey.startsWith(`modules.${definition.manifest.id}.`);
      })
      .map(
        ({ definition, route }) =>
          `${definition.manifest.id}/${route.key}:${route.sidebar?.labelKey}`,
      );

    expect(
      missingComponents,
      "Every manifest route must map to a bundled component in the generated registry.",
    ).toEqual([]);
    expect(
      badSidebarLabels,
      "Every declared sidebar labelKey must be scoped to modules.<moduleId>.",
    ).toEqual([]);
  });

  it("notes whether the generated registry check is vacuous or populated", () => {
    if (moduleDefinitions.length === 0) {
      // Vacuous pass: no generated modules or routes exist to check yet.
      expect(generatedRoutes).toHaveLength(0);
      return;
    }
    expect(generatedRoutes.length).toBeGreaterThan(0);
  });
});
