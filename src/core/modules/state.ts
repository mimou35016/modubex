import type { Prisma, PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";
import type { ModuleManifest } from "./manifest";
import { getModuleManifests } from "./registry";

/** Single-tenant sentinel shared with RBAC, settings, audit, and license. */
const WORKSPACE_ID = "";

export const MODULES_CACHE_TAG = "modules";
const MODULES_REVALIDATE_SECONDS = 300;

export const moduleStateSchema = z.enum(["available", "installed", "enabled", "disabled"]);
export type ModuleState = z.infer<typeof moduleStateSchema>;

export type ModuleView = {
  manifest: ModuleManifest;
  state: ModuleState;
  version: string;
  config: Record<string, unknown>;
  installedById: string | null;
  installedAt: Date | null;
  enabledAt: Date | null;
  disabledAt: Date | null;
  uninstalledAt: Date | null;
  dataRetained: boolean;
};

type ModuleRow = {
  moduleId: string;
  state: string;
  version: string;
  config: Prisma.JsonValue;
  installedById: string | null;
  installedAt: Date | null;
  enabledAt: Date | null;
  disabledAt: Date | null;
  uninstalledAt: Date | null;
  dataRetained: boolean;
};

type ModuleClient = Prisma.TransactionClient | PrismaClient;

type ModuleDelegate = {
  findMany(args: { where: { workspaceId: string } }): Promise<readonly ModuleRow[]>;
};

function delegateFor(client: ModuleClient): ModuleDelegate {
  return (client as unknown as { moduleInstall: ModuleDelegate }).moduleInstall;
}

async function readRows(client: ModuleClient): Promise<readonly ModuleRow[]> {
  return delegateFor(client).findMany({ where: { workspaceId: WORKSPACE_ID } });
}

const cachedModuleRows = unstable_cache(() => readRows(prisma), ["modules", "all"], {
  tags: [MODULES_CACHE_TAG],
  revalidate: MODULES_REVALIDATE_SECONDS,
});

async function readCachedRows(): Promise<readonly ModuleRow[]> {
  try {
    return await cachedModuleRows();
  } catch (error: unknown) {
    logger.warn("Module cache read failed; reading module rows directly", {
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      return await readRows(prisma);
    } catch (directError: unknown) {
      logger.warn("Direct module read failed; deriving available state", {
        error: directError instanceof Error ? directError.message : String(directError),
      });
      return [];
    }
  }
}

function normalizeState(value: string | undefined): ModuleState {
  const parsed = moduleStateSchema.safeParse(value);
  return parsed.success ? parsed.data : "available";
}

function normalizeConfig(value: Prisma.JsonValue | undefined): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function viewsFromRows(
  manifests: readonly ModuleManifest[],
  rows: readonly ModuleRow[],
): readonly ModuleView[] {
  const rowsById = new Map(rows.map((row) => [row.moduleId, row]));
  return manifests.map((manifest) => {
    const row = rowsById.get(manifest.id);
    return {
      manifest,
      state: normalizeState(row?.state),
      version: row?.version || manifest.version,
      config: normalizeConfig(row?.config),
      installedById: row?.installedById ?? null,
      installedAt: row?.installedAt ?? null,
      enabledAt: row?.enabledAt ?? null,
      disabledAt: row?.disabledAt ?? null,
      uninstalledAt: row?.uninstalledAt ?? null,
      dataRetained: row?.dataRetained ?? false,
    };
  });
}

/** Cached full views for every registered module; missing rows derive to available. */
export async function getModuleViews(): Promise<readonly ModuleView[]> {
  const [manifests, rows] = await Promise.all([getModuleManifests(), readCachedRows()]);
  return viewsFromRows(manifests, rows);
}

/** Cached state map for every registered module. */
export async function getModuleStates(): Promise<Record<string, ModuleState>> {
  const views = await getModuleViews();
  const states: Record<string, ModuleState> = {};
  for (const view of views) states[view.manifest.id] = view.state;
  return states;
}

/** Uncached state map for use inside an existing Prisma transaction. */
export async function readModuleStates(
  client: Prisma.TransactionClient,
): Promise<Record<string, ModuleState>> {
  const [manifests, rows] = await Promise.all([getModuleManifests(), readRows(client)]);
  const rowsById = new Map(rows.map((row) => [row.moduleId, row]));
  const states: Record<string, ModuleState> = {};
  for (const manifest of manifests) {
    states[manifest.id] = normalizeState(rowsById.get(manifest.id)?.state);
  }
  return states;
}

/** Uncached full views for use inside an existing Prisma transaction. */
export async function readModuleViews(
  client: Prisma.TransactionClient,
): Promise<readonly ModuleView[]> {
  const [manifests, rows] = await Promise.all([getModuleManifests(), readRows(client)]);
  return viewsFromRows(manifests, rows);
}
