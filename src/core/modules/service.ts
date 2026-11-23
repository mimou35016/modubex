import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { audit, auditActions, type AuditActor } from "@/core/audit/audit";
import type { PermissionDescriptor } from "@/core/rbac/permissions";
import { syncSystemRolePermissions } from "@/core/rbac/service";
import { prisma } from "@/lib/prisma";
import { modulePermissionDescriptors } from "./catalog";
import { canTransition, findEnabledDependents, findUnmetDependencies } from "./dependencies";
import { ModuleDependencyError, ModuleNotFoundError, ModuleStateError } from "./errors";
import {
  moduleManifestSchema,
  type ModuleCleanupContext,
  type ModuleCleanupHook,
  type ModuleManifest,
} from "./manifest";
import { getModuleDefinition, getModuleManifests, getModuleManifest } from "./registry";
import {
  moduleLifecycleSchema,
  moduleSettingsActionSchema,
  moduleUninstallSchema,
} from "./schemas";
import { MODULES_CACHE_TAG, readModuleStates, type ModuleState } from "./state";

export type UninstallMode = "keep-data" | "delete-data";

/** All module rows share the single-workspace sentinel. */
const WORKSPACE_ID = "";

const stateValues = ["available", "installed", "enabled", "disabled"] as const;
const allowedTransitionSources: ReadonlySet<string> = new Set([
  "available",
  "installed",
  "enabled",
  "disabled",
]);

const actorSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});
const lifecycleSchema = z.object({ moduleId: z.string().min(1), actor: actorSchema });
const settingsActionSchema = lifecycleSchema.extend({ values: z.record(z.string(), z.unknown()) });
const uninstallActionSchema = lifecycleSchema.extend({
  mode: z.enum(["keep-data", "delete-data"]),
  confirmation: z.string(),
});

type LifecycleData = { moduleId: string; actor: AuditActor };
type SettingsData = LifecycleData & { values: Record<string, unknown> };
type UninstallData = LifecycleData & { mode: UninstallMode; confirmation: string };

type RowWrite = {
  state: ModuleState;
  version: string;
  config: Prisma.InputJsonValue;
  dataRetained: boolean;
  installedById?: string | null;
  installedAt?: Date | null;
  enabledAt?: Date | null;
  disabledAt?: Date | null;
  uninstalledAt?: Date | null;
};

type ModuleRow = {
  id?: string;
  moduleId: string;
  state: string;
  version: string;
  config: unknown;
  installedById: string | null;
  installedAt: Date | null;
  enabledAt: Date | null;
  disabledAt: Date | null;
  uninstalledAt: Date | null;
  dataRetained: boolean;
};

type ModuleSnapshot = {
  moduleId: string;
  state: string;
  version: string;
  config: Record<string, unknown>;
  installedById: string | null;
  installedAt: string | null;
  enabledAt: string | null;
  disabledAt: string | null;
  uninstalledAt: string | null;
  dataRetained: boolean;
};

type PermissionUpsert = {
  where: { key: string };
  update: Record<string, never>;
  create: { key: string; description: string; module: string };
};

type ModuleTx = {
  moduleInstall: {
    findUnique(args: { where: { moduleId: string } }): Promise<unknown>;
    upsert(args: {
      where: { moduleId: string };
      create: RowWrite & { moduleId: string; workspaceId: string };
      update: RowWrite;
    }): Promise<unknown>;
    update(args: { where: { moduleId: string }; data: Partial<RowWrite> }): Promise<unknown>;
    delete(args: { where: { moduleId: string } }): Promise<unknown>;
  };
  permission: {
    upsert(args: PermissionUpsert): Promise<unknown>;
    deleteMany(args: { where: { key: { in: string[] } } }): Promise<unknown>;
  };
  rolePermission: {
    deleteMany(args: { where: { permission: { key: { in: string[] } } } }): Promise<unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asState(value: unknown): ModuleState {
  return stateValues.includes(value as ModuleState) ? (value as ModuleState) : "available";
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

type JsonInputValue = Prisma.InputJsonValue | null;

function toJsonInput(value: unknown): JsonInputValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toJsonInput(item));
  if (isRecord(value)) {
    const result: Record<string, JsonInputValue> = {};
    for (const [key, nested] of Object.entries(value)) result[key] = toJsonInput(nested);
    return result;
  }
  return null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  // Prisma forbids a top-level JSON null; config is an object, so fall back to
  // an empty object for unsupported top-level values.
  return toJsonInput(value) ?? {};
}

function normalizeConfig(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value };
  return {};
}

function txClient(tx: Prisma.TransactionClient): ModuleTx {
  return tx as unknown as ModuleTx;
}

function parseLifecycle(
  input: LifecycleData,
  action: "install" | "enable" | "disable",
): LifecycleData {
  const contract = moduleLifecycleSchema.parse({
    moduleId: input.moduleId,
    action,
    actor: input.actor,
  });
  const parsed = lifecycleSchema.parse({ moduleId: contract.moduleId, actor: contract.actor });
  return { moduleId: parsed.moduleId, actor: parsed.actor };
}

function parseSettings(input: SettingsData): SettingsData {
  const contract = moduleSettingsActionSchema.parse({
    moduleId: input.moduleId,
    values: input.values,
    actor: input.actor,
  });
  const parsed = settingsActionSchema.parse({
    moduleId: contract.moduleId,
    values: contract.settings,
    actor: contract.actor,
  });
  return { moduleId: parsed.moduleId, values: parsed.values, actor: parsed.actor };
}

function parseUninstall(input: UninstallData): UninstallData {
  if (input.mode === "delete-data" && input.confirmation !== input.moduleId) {
    throw new ModuleStateError(input.moduleId, `Type "${input.moduleId}" to confirm data deletion`);
  }

  const contract = moduleUninstallSchema.parse({
    moduleId: input.moduleId,
    mode: input.mode === "keep-data" ? "retain" : "purge",
    confirmation: input.mode === "delete-data" ? input.confirmation : undefined,
    actor: input.actor,
  });
  const parsed = uninstallActionSchema.parse({
    moduleId: contract.moduleId,
    mode: input.mode,
    confirmation: input.confirmation,
    actor: contract.actor,
  });
  return {
    moduleId: parsed.moduleId,
    mode: parsed.mode,
    confirmation: parsed.confirmation,
    actor: parsed.actor,
  };
}

function requireManifest(moduleId: string): ModuleManifest {
  const manifest = getModuleManifest(moduleId);
  if (!manifest) throw new ModuleNotFoundError(moduleId);
  return moduleManifestSchema.parse(manifest);
}

function allManifests(): readonly ModuleManifest[] {
  const manifests: unknown = getModuleManifests();
  if (!Array.isArray(manifests)) return [];
  return manifests.filter((manifest): manifest is ModuleManifest => isRecord(manifest));
}

function permissionDescriptorsFor(manifest: ModuleManifest): readonly PermissionDescriptor[] {
  const catalog: unknown = modulePermissionDescriptors;
  if (Array.isArray(catalog)) {
    const matches = catalog.filter(
      (item): item is PermissionDescriptor =>
        isRecord(item) &&
        typeof item.key === "string" &&
        typeof item.description === "string" &&
        item.module === manifest.id,
    );
    if (matches.length > 0) return matches;
  }
  return manifest.permissions.map((permission) => ({
    key: permission.key,
    description: permission.description,
    module: manifest.id,
  }));
}

function permissionConnectOrCreate(descriptor: PermissionDescriptor): PermissionUpsert {
  return {
    where: { key: descriptor.key },
    // An existing Permission row (e.g. from seed or a prior install attempt)
    // must make this a no-op instead of failing Prisma's upsert validation.
    update: {},
    create: {
      key: descriptor.key,
      description: descriptor.description,
      module: descriptor.module,
    },
  };
}

async function ensurePermissions(
  tx: Prisma.TransactionClient,
  client: ModuleTx,
  descriptors: readonly PermissionDescriptor[],
): Promise<void> {
  for (const descriptor of descriptors) {
    await client.permission.upsert(permissionConnectOrCreate(descriptor));
  }
  await syncSystemRolePermissions(tx);
}

async function removePermissions(
  client: ModuleTx,
  descriptors: readonly PermissionDescriptor[],
): Promise<void> {
  const keys = descriptors.map((descriptor) => descriptor.key);
  if (keys.length === 0) return;
  await client.rolePermission.deleteMany({ where: { permission: { key: { in: keys } } } });
  await client.permission.deleteMany({ where: { key: { in: keys } } });
}

async function readRow(client: ModuleTx, moduleId: string): Promise<ModuleRow | null> {
  const row: unknown = await client.moduleInstall.findUnique({ where: { moduleId } });
  if (!isRecord(row)) return null;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    moduleId: typeof row.moduleId === "string" ? row.moduleId : moduleId,
    state: typeof row.state === "string" ? row.state : "available",
    version: typeof row.version === "string" ? row.version : "",
    config: row.config,
    installedById: typeof row.installedById === "string" ? row.installedById : null,
    installedAt: asDate(row.installedAt),
    enabledAt: asDate(row.enabledAt),
    disabledAt: asDate(row.disabledAt),
    uninstalledAt: asDate(row.uninstalledAt),
    dataRetained: row.dataRetained === true,
  };
}

function snapshot(
  row: ModuleRow | null,
  moduleId: string,
  manifest: ModuleManifest,
): ModuleSnapshot {
  if (!row) {
    return {
      moduleId,
      state: "available",
      version: manifest.version,
      config: {},
      installedById: null,
      installedAt: null,
      enabledAt: null,
      disabledAt: null,
      uninstalledAt: null,
      dataRetained: false,
    };
  }
  return {
    moduleId,
    state: row.state,
    version: row.version,
    config: normalizeConfig(row.config),
    installedById: row.installedById,
    installedAt: isoDate(row.installedAt),
    enabledAt: isoDate(row.enabledAt),
    disabledAt: isoDate(row.disabledAt),
    uninstalledAt: isoDate(row.uninstalledAt),
    dataRetained: row.dataRetained,
  };
}

function assertTransition(moduleId: string, from: ModuleState, to: ModuleState): void {
  if (!allowedTransitionSources.has(from) || !canTransition(from, to)) {
    throw new ModuleStateError(moduleId, from, to);
  }
}

function assertDependenciesReady(
  manifest: ModuleManifest,
  states: Readonly<Record<string, ModuleState>>,
): void {
  const unmet = new Set<string>(findUnmetDependencies(manifest, states));
  // The pure helper accepts installed dependencies; installs and enables must
  // additionally require them to be enabled.
  for (const dependency of manifest.dependencies) {
    if (states[dependency] !== "enabled") unmet.add(dependency);
  }
  if (unmet.size > 0) {
    const dependencies = [...unmet];
    throw new ModuleDependencyError(
      manifest.id,
      dependencies,
      `Module dependencies are not enabled: ${dependencies.join(", ")}`,
    );
  }
}

function findDependents(
  moduleId: string,
  states: Readonly<Record<string, ModuleState>>,
): readonly string[] {
  return findEnabledDependents(moduleId, allManifests(), states);
}

function assertNoEnabledDependents(moduleId: string, dependents: readonly string[]): void {
  if (dependents.length > 0) {
    throw new ModuleDependencyError(
      moduleId,
      dependents,
      `Enabled modules still depend on ${moduleId}: ${dependents.join(", ")}`,
    );
  }
}

function defaultConfig(manifest: ModuleManifest): Record<string, unknown> {
  try {
    const parsed = manifest.settingsSchema.parse({});
    return normalizeConfig(parsed);
  } catch {
    return {};
  }
}

type SchemaLike = {
  shape?: Record<string, unknown>;
  safeParse(
    data: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: Array<{ message?: string }> } };
};

function schemaLike(value: unknown): SchemaLike | null {
  if (!isRecord(value) || typeof value.safeParse !== "function") return null;
  return value as unknown as SchemaLike;
}

function parseConfigValues(
  manifest: ModuleManifest,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const schema = schemaLike(manifest.settingsSchema);
  const shape = schema?.shape;
  const parsedValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (shape && !Object.prototype.hasOwnProperty.call(shape, key)) {
      throw new ModuleStateError(manifest.id, `Unknown module setting: ${key}`);
    }
    const fieldSchema = shape ? schemaLike(shape[key]) : null;
    if (fieldSchema) {
      const result = fieldSchema.safeParse(value);
      if (!result.success) {
        throw new ModuleStateError(manifest.id, result.error.issues[0]?.message ?? "Invalid value");
      }
      parsedValues[key] = result.data;
      continue;
    }
    if (schema) {
      const result = schema.safeParse({ [key]: value });
      if (!result.success) {
        throw new ModuleStateError(manifest.id, result.error.issues[0]?.message ?? "Invalid value");
      }
      parsedValues[key] = isRecord(result.data) ? result.data[key] : value;
      continue;
    }
    parsedValues[key] = value;
  }
  return parsedValues;
}

function cleanupHook(moduleId: string): ModuleCleanupHook | undefined {
  return getModuleDefinition(moduleId)?.cleanup;
}

function cleanupCounts(result: unknown): Record<string, number> {
  if (!isRecord(result) || !isRecord(result.deleted)) return {};
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(result.deleted)) {
    if (typeof value === "number" && Number.isFinite(value)) counts[key] = value;
  }
  return counts;
}

function invalidate(moduleId: string, dependentIds: readonly string[] = []): void {
  revalidateTag(MODULES_CACHE_TAG, { expire: 0 });
  revalidatePath("/modules");
  revalidatePath("/");
  revalidatePath(`/modules/${moduleId}/settings`);

  const paths = new Set<string>();
  for (const id of [moduleId, ...dependentIds]) {
    for (const path of moduleRoutePaths(id)) paths.add(path);
  }
  for (const path of paths) revalidatePath(path);
}

/** Full route paths for every route declared by a module manifest. */
export function moduleRoutePaths(moduleId: string): string[] {
  const manifest = getModuleManifest(moduleId);
  if (!manifest) return [];
  const base = `/modules/run/${moduleId}`;
  const paths = new Set<string>();
  for (const route of manifest.routes) {
    paths.add(route.path ? `${base}/${route.path}` : base);
  }
  return [...paths];
}

export async function installModule(input: {
  moduleId: string;
  actor: AuditActor;
}): Promise<{ id: string; state: "installed" }> {
  const data = parseLifecycle(input, "install");
  const manifest = requireManifest(data.moduleId);

  const id = await prisma.$transaction(async (tx) => {
    const client = txClient(tx);
    const states = await readModuleStates(tx);
    const current = asState(states[data.moduleId]);
    assertTransition(data.moduleId, current, "installed");
    assertDependenciesReady(manifest, states);

    const beforeRow = await readRow(client, data.moduleId);
    const before = snapshot(beforeRow, data.moduleId, manifest);
    const retained = beforeRow?.dataRetained === true;
    const config = retained ? normalizeConfig(beforeRow?.config) : defaultConfig(manifest);
    const descriptors = permissionDescriptorsFor(manifest);
    await ensurePermissions(tx, client, descriptors);

    const now = new Date();
    const write: RowWrite = {
      state: "installed",
      version: manifest.version,
      config: toInputJson(config),
      dataRetained: retained,
      installedById: data.actor.userId,
      installedAt: now,
      enabledAt: null,
      disabledAt: null,
      uninstalledAt: null,
    };
    const saved: unknown = await client.moduleInstall.upsert({
      where: { moduleId: data.moduleId },
      create: { moduleId: data.moduleId, workspaceId: WORKSPACE_ID, ...write },
      update: write,
    });
    const after: ModuleSnapshot = {
      ...before,
      state: "installed",
      version: manifest.version,
      config,
      installedById: data.actor.userId,
      installedAt: now.toISOString(),
      enabledAt: null,
      disabledAt: null,
      uninstalledAt: null,
      dataRetained: retained,
    };

    await audit.log({
      action: auditActions.modulesInstalled,
      actor: data.actor,
      targetType: "module",
      targetId: data.moduleId,
      module: data.moduleId,
      workspaceId: WORKSPACE_ID,
      before,
      after,
      metadata: {
        permissions: descriptors.map((descriptor) => descriptor.key),
        dependencies: manifest.dependencies,
        retainedData: retained,
      },
      client: tx,
      strict: true,
    });

    return isRecord(saved) && typeof saved.id === "string" ? saved.id : data.moduleId;
  });

  invalidate(data.moduleId);
  return { id, state: "installed" };
}

export async function enableModule(input: { moduleId: string; actor: AuditActor }): Promise<void> {
  const data = parseLifecycle(input, "enable");
  const manifest = requireManifest(data.moduleId);

  await prisma.$transaction(async (tx) => {
    const client = txClient(tx);
    const states = await readModuleStates(tx);
    const current = asState(states[data.moduleId]);
    assertTransition(data.moduleId, current, "enabled");
    assertDependenciesReady(manifest, states);

    const beforeRow = await readRow(client, data.moduleId);
    const before = snapshot(beforeRow, data.moduleId, manifest);
    const now = new Date();
    await client.moduleInstall.update({
      where: { moduleId: data.moduleId },
      data: {
        state: "enabled",
        version: manifest.version,
        enabledAt: now,
        disabledAt: null,
        uninstalledAt: null,
      },
    });
    await syncSystemRolePermissions(tx);

    await audit.log({
      action: auditActions.modulesEnabled,
      actor: data.actor,
      targetType: "module",
      targetId: data.moduleId,
      module: data.moduleId,
      workspaceId: WORKSPACE_ID,
      before,
      after: {
        ...before,
        state: "enabled",
        version: manifest.version,
        enabledAt: now.toISOString(),
        disabledAt: null,
        uninstalledAt: null,
      },
      metadata: {
        permissions: permissionDescriptorsFor(manifest).map((descriptor) => descriptor.key),
        dependencies: manifest.dependencies,
      },
      client: tx,
      strict: true,
    });
  });

  invalidate(data.moduleId);
}

export async function disableModule(input: { moduleId: string; actor: AuditActor }): Promise<void> {
  const data = parseLifecycle(input, "disable");
  const manifest = requireManifest(data.moduleId);
  let dependents: readonly string[] = [];

  await prisma.$transaction(async (tx) => {
    const client = txClient(tx);
    const states = await readModuleStates(tx);
    const current = asState(states[data.moduleId]);
    assertTransition(data.moduleId, current, "disabled");

    dependents = findDependents(data.moduleId, states);
    assertNoEnabledDependents(data.moduleId, dependents);

    const beforeRow = await readRow(client, data.moduleId);
    const before = snapshot(beforeRow, data.moduleId, manifest);
    const now = new Date();
    await client.moduleInstall.update({
      where: { moduleId: data.moduleId },
      data: { state: "disabled", enabledAt: null, disabledAt: now },
    });

    await audit.log({
      action: auditActions.modulesDisabled,
      actor: data.actor,
      targetType: "module",
      targetId: data.moduleId,
      module: data.moduleId,
      workspaceId: WORKSPACE_ID,
      before,
      after: {
        ...before,
        state: "disabled",
        enabledAt: null,
        disabledAt: now.toISOString(),
      },
      metadata: { dependents: [...dependents] },
      client: tx,
      strict: true,
    });
  });

  invalidate(data.moduleId, dependents);
}

export async function updateModuleSettings(input: {
  moduleId: string;
  values: Record<string, unknown>;
  actor: AuditActor;
}): Promise<void> {
  const data = parseSettings(input);
  const manifest = requireManifest(data.moduleId);
  const values = parseConfigValues(manifest, data.values);

  await prisma.$transaction(async (tx) => {
    const client = txClient(tx);
    const states = await readModuleStates(tx);
    const current = asState(states[data.moduleId]);
    if (current !== "installed" && current !== "enabled" && current !== "disabled") {
      throw new ModuleStateError(data.moduleId, current, "installed");
    }

    const beforeRow = await readRow(client, data.moduleId);
    if (!beforeRow) throw new ModuleStateError(data.moduleId, "Module is not installed");
    const before = snapshot(beforeRow, data.moduleId, manifest);
    const config = { ...normalizeConfig(beforeRow.config), ...values };
    await client.moduleInstall.update({
      where: { moduleId: data.moduleId },
      data: { config: toInputJson(config) },
    });

    await audit.log({
      action: auditActions.modulesSettingsUpdated,
      actor: data.actor,
      targetType: "module",
      targetId: data.moduleId,
      module: data.moduleId,
      workspaceId: WORKSPACE_ID,
      before: { config: before.config },
      after: { config },
      metadata: { keys: Object.keys(values) },
      client: tx,
      strict: true,
    });
  });

  invalidate(data.moduleId);
}

export async function uninstallModule(input: {
  moduleId: string;
  mode: UninstallMode;
  confirmation: string;
  actor: AuditActor;
}): Promise<{ dataRetained: boolean }> {
  const data = parseUninstall(input);
  const manifest = requireManifest(data.moduleId);
  let dependents: readonly string[] = [];

  await prisma.$transaction(async (tx) => {
    const client = txClient(tx);
    const states = await readModuleStates(tx);
    const current = asState(states[data.moduleId]);
    assertTransition(data.moduleId, current, "available");

    dependents = findDependents(data.moduleId, states);
    assertNoEnabledDependents(data.moduleId, dependents);

    const beforeRow = await readRow(client, data.moduleId);
    if (!beforeRow) throw new ModuleStateError(data.moduleId, "Module is not installed");
    const before = snapshot(beforeRow, data.moduleId, manifest);
    const descriptors = permissionDescriptorsFor(manifest);
    const keepData = data.mode === "keep-data";
    let counts: Record<string, number> = {};

    if (keepData) {
      const now = new Date();
      await client.moduleInstall.update({
        where: { moduleId: data.moduleId },
        data: {
          state: "available",
          enabledAt: null,
          disabledAt: null,
          uninstalledAt: now,
          dataRetained: true,
        },
      });
    } else {
      const hook = cleanupHook(data.moduleId);
      if (hook) {
        const context: ModuleCleanupContext = {
          client: tx,
          actor: data.actor,
          moduleId: data.moduleId,
        };
        counts = cleanupCounts(await hook(context));
      }
      await removePermissions(client, descriptors);
      await client.moduleInstall.delete({ where: { moduleId: data.moduleId } });
    }

    const after: ModuleSnapshot = {
      ...before,
      state: "available",
      config: keepData ? before.config : {},
      enabledAt: null,
      disabledAt: null,
      uninstalledAt: keepData ? new Date().toISOString() : null,
      dataRetained: keepData,
    };

    await audit.log({
      action: auditActions.modulesUninstalled,
      actor: data.actor,
      targetType: "module",
      targetId: data.moduleId,
      module: data.moduleId,
      workspaceId: WORKSPACE_ID,
      before,
      after,
      metadata: {
        mode: data.mode,
        confirmationMatched: true,
        dataRetained: keepData,
        cleanup: counts,
        permissionsRemoved: keepData ? [] : descriptors.map((descriptor) => descriptor.key),
        dependents: [...dependents],
      },
      client: tx,
      strict: true,
    });
  });

  invalidate(data.moduleId, dependents);
  return { dataRetained: data.mode === "keep-data" };
}
