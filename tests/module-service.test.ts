import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  transaction,
  tx,
  txModuleFindUnique,
  txModuleUpsert,
  txModuleUpdate,
  txModuleDelete,
  txPermissionUpsert,
  txPermissionDeleteMany,
  txRolePermissionDeleteMany,
  auditLog,
  revalidateTag,
  revalidatePath,
  getManifest,
  getDefinition,
  getManifests,
  readStates,
  findUnmet,
  findDependents,
  canMove,
  syncRoles,
  cleanupHook,
} = vi.hoisted(() => {
  const tx = {
    moduleInstall: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
    },
  };
  return {
    transaction: vi.fn(),
    tx,
    txModuleFindUnique: tx.moduleInstall.findUnique,
    txModuleUpsert: tx.moduleInstall.upsert,
    txModuleUpdate: tx.moduleInstall.update,
    txModuleDelete: tx.moduleInstall.delete,
    txPermissionUpsert: tx.permission.upsert,
    txPermissionDeleteMany: tx.permission.deleteMany,
    txRolePermissionDeleteMany: tx.rolePermission.deleteMany,
    auditLog: vi.fn(),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    getManifest: vi.fn(),
    getDefinition: vi.fn(),
    getManifests: vi.fn(),
    readStates: vi.fn(),
    findUnmet: vi.fn(),
    findDependents: vi.fn(),
    canMove: vi.fn(),
    syncRoles: vi.fn(),
    cleanupHook: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transaction } }));

vi.mock("@/core/audit/audit", () => ({
  audit: { log: auditLog },
  auditActions: {
    modulesInstalled: "modules.installed",
    modulesEnabled: "modules.enabled",
    modulesDisabled: "modules.disabled",
    modulesSettingsUpdated: "modules.settings.updated",
    modulesUninstalled: "modules.uninstalled",
  },
}));

vi.mock("@/core/rbac/service", () => ({ syncSystemRolePermissions: syncRoles }));

vi.mock("@/core/modules/registry", () => ({
  getModuleManifest: getManifest,
  getModuleDefinition: getDefinition,
  getModuleManifests: getManifests,
}));

vi.mock("@/core/modules/catalog", () => ({
  modulePermissionDescriptors: [
    { key: "demo.use", description: "Use demo", module: "demo" },
    { key: "dependent.use", description: "Use dependent", module: "dependent" },
  ],
}));

vi.mock("@/core/modules/dependencies", () => ({
  findUnmetDependencies: findUnmet,
  findEnabledDependents: findDependents,
  canTransition: canMove,
}));

vi.mock("@/core/modules/state", () => ({
  MODULES_CACHE_TAG: "modules",
  readModuleStates: readStates,
}));

import { ModuleDependencyError, ModuleStateError } from "@/core/modules/errors";
import {
  disableModule,
  enableModule,
  installModule,
  moduleRoutePaths,
  uninstallModule,
  updateModuleSettings,
} from "@/core/modules/service";

const actor = { userId: "user_1", email: "owner@example.com" };

const manifest = {
  id: "demo",
  name: "Demo",
  description: "Demo module",
  version: "1.0.0",
  author: "Team",
  icon: "puzzle",
  requiredPlan: "free",
  dependencies: [],
  permissions: [{ key: "demo.use", description: "Use demo" }],
  routes: [{ key: "home", path: "", labelKey: "demo.title" }],
  settingsSchema: z.object({
    title: z.string().default("Demo"),
    enabled: z.boolean().default(false),
  }),
  ownedModels: ["DemoItem"],
  migrations: [],
};

const dependentManifest = {
  ...manifest,
  id: "dependent",
  name: "Dependent",
  description: "Depends on demo",
  permissions: [{ key: "dependent.use", description: "Use dependent" }],
  dependencies: ["demo"],
  routes: [{ key: "home", path: "dependent", labelKey: "dependent.title" }],
  settingsSchema: z.object({}),
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "row_1",
    moduleId: "demo",
    state: "enabled",
    version: "1.0.0",
    config: { title: "Old", enabled: false },
    installedById: "user_1",
    installedAt: new Date("2026-01-01T00:00:00.000Z"),
    enabledAt: new Date("2026-01-02T00:00:00.000Z"),
    disabledAt: null,
    uninstalledAt: null,
    dataRetained: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  getManifest.mockReturnValue(manifest);
  getDefinition.mockReturnValue({ manifest, cleanup: cleanupHook });
  getManifests.mockReturnValue([manifest, dependentManifest]);
  readStates.mockResolvedValue({ demo: "available" });
  findUnmet.mockReturnValue([]);
  findDependents.mockReturnValue([]);
  canMove.mockReturnValue(true);
  syncRoles.mockResolvedValue(undefined);
  cleanupHook.mockResolvedValue({ deleted: { demoItem: 2 } });
  txModuleFindUnique.mockResolvedValue(null);
  txModuleUpsert.mockResolvedValue({ id: "row_1" });
  txModuleUpdate.mockResolvedValue({});
  txModuleDelete.mockResolvedValue({});
  txPermissionUpsert.mockResolvedValue({});
  txPermissionDeleteMany.mockResolvedValue({ count: 1 });
  txRolePermissionDeleteMany.mockResolvedValue({ count: 1 });
});

describe("module lifecycle service", () => {
  it("installs from available with schema defaults, permissions, strict audit, and invalidation", async () => {
    await expect(installModule({ moduleId: "demo", actor })).resolves.toEqual({
      id: "row_1",
      state: "installed",
    });

    expect(txPermissionUpsert).toHaveBeenCalledWith({
      where: { key: "demo.use" },
      update: {},
      create: { key: "demo.use", description: "Use demo", module: "demo" },
    });
    expect(syncRoles).toHaveBeenCalledWith(tx);
    expect(txModuleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { moduleId: "demo" },
        create: expect.objectContaining({
          moduleId: "demo",
          workspaceId: "",
          state: "installed",
          config: { title: "Demo", enabled: false },
          installedById: "user_1",
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.installed",
        targetType: "module",
        targetId: "demo",
        module: "demo",
        actor,
        client: tx,
        strict: true,
        before: expect.objectContaining({ state: "available" }),
        after: expect.objectContaining({ state: "installed" }),
      }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("modules", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/modules");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/modules/demo/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/modules/run/demo");
    expect(moduleRoutePaths("demo")).toEqual(["/modules/run/demo"]);
  });

  it("provisions permissions idempotently with missing and existing rows", async () => {
    const permissionIds = new Map<string, string>();
    txPermissionUpsert.mockImplementation(
      async (args: {
        where: { key: string };
        update?: Record<string, never>;
        create: { key: string };
      }) => {
        if (!Object.prototype.hasOwnProperty.call(args, "update")) {
          throw new Error("Argument update is missing");
        }
        expect(args.update).toEqual({});
        const id = permissionIds.get(args.where.key) ?? `permission_${args.where.key}`;
        permissionIds.set(args.where.key, id);
        return { id };
      },
    );

    // First install: the Permission row does not exist yet.
    await expect(installModule({ moduleId: "demo", actor })).resolves.toEqual({
      id: "row_1",
      state: "installed",
    });
    expect(permissionIds.get("demo.use")).toBe("permission_demo.use");

    // Second install: the row from the previous attempt (or seed) already exists.
    readStates.mockResolvedValue({ demo: "installed" });
    await expect(installModule({ moduleId: "demo", actor })).resolves.toEqual({
      id: "row_1",
      state: "installed",
    });
    expect(permissionIds.get("demo.use")).toBe("permission_demo.use");
    expect(txPermissionUpsert).toHaveBeenCalledTimes(2);
    expect(txPermissionUpsert).toHaveBeenCalledWith({
      where: { key: "demo.use" },
      update: {},
      create: { key: "demo.use", description: "Use demo", module: "demo" },
    });
    expect(syncRoles).toHaveBeenCalledTimes(2);
  });

  it("blocks install when a dependency is not enabled", async () => {
    readStates.mockResolvedValue({ demo: "available", other: "installed" });
    getManifest.mockReturnValue({ ...manifest, dependencies: ["other"] });
    findUnmet.mockReturnValue(["other"]);

    await expect(installModule({ moduleId: "demo", actor })).rejects.toBeInstanceOf(
      ModuleDependencyError,
    );
    expect(txModuleUpsert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("rejects invalid transitions", async () => {
    canMove.mockReturnValue(false);

    await expect(installModule({ moduleId: "demo", actor })).rejects.toBeInstanceOf(
      ModuleStateError,
    );
    expect(transaction).toHaveBeenCalled();
    expect(txModuleUpsert).not.toHaveBeenCalled();
  });

  it("enables an installed module and re-syncs system roles", async () => {
    readStates.mockResolvedValue({ demo: "installed" });
    txModuleFindUnique.mockResolvedValue(row({ state: "installed", enabledAt: null }));

    await enableModule({ moduleId: "demo", actor });

    expect(txModuleUpdate).toHaveBeenCalledWith({
      where: { moduleId: "demo" },
      data: expect.objectContaining({ state: "enabled" }),
    });
    expect(syncRoles).toHaveBeenCalledWith(tx);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.enabled",
        strict: true,
        before: expect.objectContaining({ state: "installed" }),
        after: expect.objectContaining({ state: "enabled" }),
      }),
    );
  });

  it("blocks disable while an enabled dependent exists", async () => {
    readStates.mockResolvedValue({ demo: "enabled", dependent: "enabled" });
    findDependents.mockReturnValue(["dependent"]);

    await expect(disableModule({ moduleId: "demo", actor })).rejects.toBeInstanceOf(
      ModuleDependencyError,
    );
    expect(txModuleUpdate).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("merges validated settings and audits the config change", async () => {
    readStates.mockResolvedValue({ demo: "enabled" });
    txModuleFindUnique.mockResolvedValue(row());

    await updateModuleSettings({ moduleId: "demo", values: { enabled: true }, actor });

    expect(txModuleUpdate).toHaveBeenCalledWith({
      where: { moduleId: "demo" },
      data: { config: { title: "Old", enabled: true } },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.settings.updated",
        strict: true,
        before: { config: { title: "Old", enabled: false } },
        after: { config: { title: "Old", enabled: true } },
        metadata: { keys: ["enabled"] },
      }),
    );
  });

  it("keeps data, config, and permissions on a keep-data uninstall", async () => {
    readStates.mockResolvedValue({ demo: "enabled" });
    txModuleFindUnique.mockResolvedValue(row());

    await expect(
      uninstallModule({ moduleId: "demo", mode: "keep-data", confirmation: "", actor }),
    ).resolves.toEqual({ dataRetained: true });

    expect(cleanupHook).not.toHaveBeenCalled();
    expect(txModuleDelete).not.toHaveBeenCalled();
    expect(txPermissionDeleteMany).not.toHaveBeenCalled();
    expect(txModuleUpdate).toHaveBeenCalledWith({
      where: { moduleId: "demo" },
      data: expect.objectContaining({ state: "available", dataRetained: true }),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.uninstalled",
        strict: true,
        metadata: expect.objectContaining({ mode: "keep-data", dataRetained: true }),
      }),
    );
  });

  it("requires the module id as typed confirmation for delete-data", async () => {
    await expect(
      uninstallModule({
        moduleId: "demo",
        mode: "delete-data",
        confirmation: "PURGE:demo",
        actor,
      }),
    ).rejects.toBeInstanceOf(ModuleStateError);
    expect(transaction).not.toHaveBeenCalled();
    expect(cleanupHook).not.toHaveBeenCalled();
  });

  it("runs cleanup, removes permissions, and audits counts on delete-data uninstall", async () => {
    readStates.mockResolvedValue({ demo: "enabled" });
    txModuleFindUnique.mockResolvedValue(row());

    await expect(
      uninstallModule({ moduleId: "demo", mode: "delete-data", confirmation: "demo", actor }),
    ).resolves.toEqual({ dataRetained: false });

    expect(cleanupHook).toHaveBeenCalledWith({ client: tx, actor, moduleId: "demo" });
    expect(txRolePermissionDeleteMany).toHaveBeenCalledWith({
      where: { permission: { key: { in: ["demo.use"] } } },
    });
    expect(txPermissionDeleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["demo.use"] } },
    });
    expect(txModuleDelete).toHaveBeenCalledWith({ where: { moduleId: "demo" } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "modules.uninstalled",
        strict: true,
        metadata: expect.objectContaining({
          mode: "delete-data",
          dataRetained: false,
          cleanup: { demoItem: 2 },
          permissionsRemoved: ["demo.use"],
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/modules/run/demo");
  });
});
