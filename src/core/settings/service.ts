import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";
import { audit, auditActions, type AuditActor } from "@/core/audit/audit";
import type { PasswordRules } from "@/core/auth/schemas";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";
import {
  defaultSettingValues,
  getSettingDefault,
  getSettingDescriptor,
  isInfrastructureKey,
  isSettingKey,
  parseSettingValue,
  settingKeys,
  type SettingKey,
  type SettingValue,
} from "./registry";

/** All runtime rows use the single-workspace sentinel. */
const WORKSPACE_ID = "";
const SETTINGS_CACHE_TAG = "settings";
const SETTINGS_REVALIDATE_SECONDS = 300;

const actorSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

const valuesSchema = z.record(z.string(), z.unknown());

type StoredSetting = { key: string; value: Prisma.JsonValue };

async function readAllSettingsFromDatabase(): Promise<Partial<Record<SettingKey, unknown>>> {
  const rows = await prisma.setting.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { key: true, value: true },
  });
  return rows.reduce<Partial<Record<SettingKey, unknown>>>((result, row: StoredSetting) => {
    if (isSettingKey(row.key)) result[row.key] = row.value;
    return result;
  }, {});
}

/**
 * Single cached snapshot for all settings. Consumers (including entitlement
 * readers) must consult `getCacheReadsEnabled()` before using cached reads;
 * when it is false they go straight to Prisma.
 */
const cachedSettingsSnapshot = unstable_cache(readAllSettingsFromDatabase, ["settings", "all"], {
  tags: [SETTINGS_CACHE_TAG],
  revalidate: SETTINGS_REVALIDATE_SECONDS,
});

async function getSettingsSnapshot(): Promise<Partial<Record<SettingKey, unknown>>> {
  try {
    return await cachedSettingsSnapshot();
  } catch (error: unknown) {
    logger.warn("Settings cache read failed; using registry defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function valueOrDefault<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  if (value === undefined || value === null) return getSettingDefault(key);
  try {
    return parseSettingValue(key, value);
  } catch (error: unknown) {
    logger.warn("Stored setting failed validation; using registry default", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return getSettingDefault(key);
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Runtime settings must be JSON primitives.");
}

/** Cached; false means every settings/entitlement read bypasses Next's cache. */
export async function getCacheReadsEnabled(): Promise<boolean> {
  const snapshot = await getSettingsSnapshot();
  return valueOrDefault("performance.cacheReads", snapshot["performance.cacheReads"]);
}

export async function getSettingValue<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const snapshot = await getSettingsSnapshot();
  if (valueOrDefault("performance.cacheReads", snapshot["performance.cacheReads"])) {
    return valueOrDefault(key, snapshot[key]);
  }

  try {
    return valueOrDefault(key, await readDirectSettingValue(key));
  } catch (error: unknown) {
    logger.warn("Direct settings read failed; using registry default", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return getSettingDefault(key);
  }
}

async function readDirectSettingValue(key: SettingKey): Promise<unknown> {
  const row = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  });
  return row?.value;
}

export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const snapshot = await getSettingsSnapshot();
  let stored: Partial<Record<SettingKey, unknown>> = snapshot;

  if (!valueOrDefault("performance.cacheReads", snapshot["performance.cacheReads"])) {
    try {
      stored = await readAllSettingsFromDatabase();
    } catch (error: unknown) {
      logger.warn("Direct settings list read failed; using registry defaults", {
        error: error instanceof Error ? error.message : String(error),
      });
      stored = {};
    }
  }

  const values = {} as Record<SettingKey, unknown>;
  for (const key of settingKeys) values[key] = valueOrDefault(key, stored[key]);
  return values;
}

export async function getPasswordRules(): Promise<PasswordRules> {
  const [minLength, maxLength, requireNumber, requireSymbol] = await Promise.all([
    getSettingValue("security.passwordMinLength"),
    getSettingValue("security.passwordMaxLength"),
    getSettingValue("security.requireNumber"),
    getSettingValue("security.requireSymbol"),
  ]);
  return { minLength, maxLength, requireNumber, requireSymbol };
}

export type SecuritySettings = PasswordRules & { requireTwoFactor: boolean };

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const [rules, requireTwoFactor] = await Promise.all([
    getPasswordRules(),
    getSettingValue("security.requireTwoFactor"),
  ]);
  return { ...rules, requireTwoFactor };
}

export async function getDefaultLocale(): Promise<SettingValue<"localization.defaultLocale">> {
  return getSettingValue("localization.defaultLocale");
}

export async function getTimeZone(): Promise<string> {
  return getSettingValue("workspace.timeZone");
}

/** Create-only seeding; existing edited values are never overwritten. */
export async function ensureDefaultSettings(): Promise<number> {
  const data = settingKeys.map((key) => ({
    key,
    value: toInputJson(getSettingDefault(key)),
    workspaceId: WORKSPACE_ID,
  }));
  const result = await prisma.setting.createMany({ data, skipDuplicates: true });
  return result.count;
}

type PendingChange = {
  key: SettingKey;
  before: unknown;
  after: unknown;
  value: Prisma.InputJsonValue;
};

/**
 * Zod-validates every value, writes changed rows in one transaction, records a
 * single before/after audit entry, and invalidates the settings cache.
 * Authorization is enforced by the caller via `requirePermission`.
 */
export async function updateSettings(
  values: Partial<Record<SettingKey, unknown>>,
  actor: AuditActor,
): Promise<void> {
  const parsedValues = valuesSchema.parse(values);
  const parsedActor = actorSchema.parse(actor);

  const pending: PendingChange[] = [];
  for (const [key, rawValue] of Object.entries(parsedValues)) {
    if (isInfrastructureKey(key)) throw new Error(`Setting is read-only: ${key}`);
    if (!isSettingKey(key)) throw new Error(`Unknown setting key: ${key}`);

    const descriptor = getSettingDescriptor(key);
    if (descriptor.infrastructure) throw new Error(`Setting is read-only: ${key}`);

    const after = parseSettingValue(key, rawValue);
    pending.push({ key, before: undefined, after, value: toInputJson(after) });
  }
  if (pending.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const applied: PendingChange[] = [];
    for (const change of pending) {
      const existing = await tx.setting.findUnique({
        where: { key: change.key },
        select: { value: true },
      });
      const before = existing?.value ?? getSettingDefault(change.key);
      if (Object.is(before, change.after)) continue;

      await tx.setting.upsert({
        where: { key: change.key },
        create: {
          key: change.key,
          value: change.value,
          workspaceId: WORKSPACE_ID,
          updatedById: parsedActor.userId,
        },
        update: {
          value: change.value,
          updatedById: parsedActor.userId,
        },
      });
      applied.push({ ...change, before });
    }
    if (applied.length === 0) return;

    await audit.log({
      action: auditActions.settingsUpdated,
      actor: parsedActor,
      targetType: "setting",
      targetId: applied.map((change) => change.key).join(","),
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: Object.fromEntries(applied.map((change) => [change.key, change.before])),
      after: Object.fromEntries(applied.map((change) => [change.key, change.after])),
      client: tx,
      strict: true,
    });
  });

  // Next 16 requires the second argument; expire 0 forces a blocking refresh
  // so dynamic password/2FA/retention rules take effect on the next request.
  revalidateTag(SETTINGS_CACHE_TAG, { expire: 0 });
  revalidatePath("/settings");
  revalidatePath("/audit");
}

/** Convenience for consumers that need a full populated snapshot. */
export function defaultSettingsSnapshot(): Record<SettingKey, unknown> {
  return defaultSettingValues();
}
