"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { AuditActor } from "@/core/audit";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import {
  EntitlementDeniedError,
  hasEntitlement,
  requireEntitlement,
  requireModuleInstallEntitlement,
} from "@/core/entitlements/guards";
import { getEntitlements } from "@/core/entitlements/service";
import { logger } from "@/core/logging/logger";
import { moduleIdSchema, type ModuleManifest } from "@/core/modules/manifest";
import { getModuleManifest } from "@/core/modules/registry";
import {
  disableModule,
  enableModule,
  installModule,
  uninstallModule,
  updateModuleSettings,
  type UninstallMode,
} from "@/core/modules/service";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";
const INVALID_INPUT = "Invalid module input.";
const EMPTY_SUBMISSION = "No module settings were submitted.";
const ENTITLEMENT_DENIED = "Your plan does not include this module.";
const INSTALL_FAILED = "Unable to install the module.";
const ENABLE_FAILED = "Unable to enable the module.";
const DISABLE_FAILED = "Unable to disable the module.";
const SETTINGS_FAILED = "Unable to save module settings.";
const UNINSTALL_FAILED = "Unable to uninstall the module.";

const moduleErrorNames: ReadonlySet<string> = new Set([
  "ModuleNotFoundError",
  "ModuleStateError",
  "ModuleDependencyError",
  "ModuleEntitlementError",
]);

type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];
type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: Array<{ message?: string }> } };
type SchemaLike = {
  shape?: Record<string, unknown>;
  safeParse(data: unknown): SafeParseResult;
};

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function guard(): Promise<{ session: GuardedSession } | { error: string }> {
  try {
    const { session } = await requirePermission("modules.manage");
    return { session };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof PermissionDeniedError) return { error: DENIED };
    throw error;
  }
}

async function actorFrom(session: GuardedSession): Promise<AuditActor> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    userId: session.user.id,
    email: session.user.email,
    ip: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: { issues: Array<{ message?: string }> }): string {
  return error.issues[0]?.message ?? INVALID_INPUT;
}

function logFailure(message: string, error: unknown): void {
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function parseModuleId(formData: FormData): { moduleId: string } | { error: string } {
  const parsed = moduleIdSchema.safeParse(field(formData, "moduleId"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return { moduleId: parsed.data };
}

function schemaLike(value: unknown): SchemaLike | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { safeParse?: unknown };
  return typeof candidate.safeParse === "function" ? (value as SchemaLike) : null;
}

function candidates(raw: string): unknown[] {
  const values: unknown[] = [raw];
  if (raw === "true" || raw === "1") values.push(true);
  if (raw === "false" || raw === "0") values.push(false);
  if (raw.trim() !== "" && /^-?\d+(?:\.\d+)?$/.test(raw.trim())) values.push(Number(raw));
  return values;
}

function validateConfigValue(
  manifest: ModuleManifest,
  key: string,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = schemaLike(manifest.settingsSchema);
  if (!schema) return { ok: true, value: raw };

  const shape = schema.shape;
  if (shape && !Object.prototype.hasOwnProperty.call(shape, key)) {
    return { ok: false, error: `Unknown module setting: ${key}` };
  }
  const fieldSchema = shape ? schemaLike(shape[key]) : null;
  const target = fieldSchema ?? schema;

  let lastError: string = INVALID_INPUT;
  for (const candidate of candidates(raw)) {
    const result = target.safeParse(fieldSchema ? candidate : { [key]: candidate });
    if (result.success) {
      if (fieldSchema) return { ok: true, value: result.data };
      const data = result.data;
      return {
        ok: true,
        value:
          typeof data === "object" && data !== null && !Array.isArray(data)
            ? (data as Record<string, unknown>)[key]
            : candidate,
      };
    }
    lastError = firstIssue(result.error);
  }
  return { ok: false, error: lastError };
}

function configFields(formData: FormData): Record<string, string> | null {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("config.")) continue;
    const key = name.slice("config.".length);
    if (!key || typeof value !== "string") return null;
    values[key] = value;
  }
  return Object.keys(values).length > 0 ? values : null;
}

async function assertInstallEntitlement(moduleId: string): Promise<ActionState | null> {
  try {
    await requireModuleInstallEntitlement();

    const manifest = getModuleManifest(moduleId);
    if (!manifest) return { error: INVALID_INPUT };

    if (manifest.requiredPlan || manifest.requiredEntitlement) {
      const entitlements = await getEntitlements();
      if (manifest.requiredPlan === "pro" && !hasEntitlement(entitlements, "modules.store")) {
        return { error: ENTITLEMENT_DENIED };
      }
      if (
        manifest.requiredPlan === "enterprise" &&
        !hasEntitlement(entitlements, "modules.premium")
      ) {
        return { error: ENTITLEMENT_DENIED };
      }
      if (manifest.requiredEntitlement) {
        await requireEntitlement(manifest.requiredEntitlement);
      }
    }
    return null;
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof EntitlementDeniedError) return { error: ENTITLEMENT_DENIED };
    logFailure("Module entitlement check failed", error);
    return { error: ENTITLEMENT_DENIED };
  }
}

function failure(message: string, error: unknown, fallback: string): ActionState {
  if (isRedirectError(error)) throw error;
  if (error instanceof PermissionDeniedError) return { error: DENIED };
  logFailure(message, error);
  if (error instanceof Error && moduleErrorNames.has(error.name) && error.message) {
    return { error: error.message };
  }
  return { error: fallback };
}

export async function installModuleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsedModule = parseModuleId(formData);
  if ("error" in parsedModule) return parsedModule;

  const denied = await assertInstallEntitlement(parsedModule.moduleId);
  if (denied) return denied;

  const actor = await actorFrom(guarded.session);
  try {
    await installModule({ moduleId: parsedModule.moduleId, actor });
    return { ok: true, message: "Module installed." };
  } catch (error: unknown) {
    return failure("Module install failed", error, INSTALL_FAILED);
  }
}

export async function enableModuleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsedModule = parseModuleId(formData);
  if ("error" in parsedModule) return parsedModule;

  const denied = await assertInstallEntitlement(parsedModule.moduleId);
  if (denied) return denied;

  const actor = await actorFrom(guarded.session);
  try {
    await enableModule({ moduleId: parsedModule.moduleId, actor });
    return { ok: true, message: "Module enabled." };
  } catch (error: unknown) {
    return failure("Module enable failed", error, ENABLE_FAILED);
  }
}

export async function disableModuleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsedModule = parseModuleId(formData);
  if ("error" in parsedModule) return parsedModule;

  const actor = await actorFrom(guarded.session);
  try {
    await disableModule({ moduleId: parsedModule.moduleId, actor });
    return { ok: true, message: "Module disabled." };
  } catch (error: unknown) {
    return failure("Module disable failed", error, DISABLE_FAILED);
  }
}

export async function updateModuleSettingsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsedModule = parseModuleId(formData);
  if ("error" in parsedModule) return parsedModule;

  const rawValues = configFields(formData);
  if (!rawValues) return { error: EMPTY_SUBMISSION };

  const manifest = getModuleManifest(parsedModule.moduleId);
  if (!manifest) return { error: INVALID_INPUT };

  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(rawValues)) {
    const parsed = validateConfigValue(manifest, key, raw);
    if (!parsed.ok) return { error: parsed.error };
    values[key] = parsed.value;
  }

  const actor = await actorFrom(guarded.session);
  try {
    await updateModuleSettings({ moduleId: parsedModule.moduleId, values, actor });
    return { ok: true, message: "Module settings saved." };
  } catch (error: unknown) {
    return failure("Module settings update failed", error, SETTINGS_FAILED);
  }
}

export async function uninstallModuleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsedModule = parseModuleId(formData);
  if ("error" in parsedModule) return parsedModule;

  const parsedMode = z.enum(["keep-data", "delete-data"]).safeParse(field(formData, "mode"));
  if (!parsedMode.success) return { error: INVALID_INPUT };

  const actor = await actorFrom(guarded.session);
  try {
    await uninstallModule({
      moduleId: parsedModule.moduleId,
      mode: parsedMode.data as UninstallMode,
      confirmation: field(formData, "confirmation"),
      actor,
    });
    return { ok: true, message: "Module uninstalled." };
  } catch (error: unknown) {
    return failure("Module uninstall failed", error, UNINSTALL_FAILED);
  }
}
