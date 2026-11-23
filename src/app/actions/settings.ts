"use server";

import { headers } from "next/headers";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import type { AuditActor } from "@/core/audit";
import { EntitlementDeniedError, requireEntitlement } from "@/core/entitlements/guards";
import type { EntitlementKey } from "@/core/entitlements/plans";
import { logger } from "@/core/logging/logger";
import type { PermissionKey } from "@/core/rbac/permissions";
import { settingsRegistry, type SettingKey } from "@/core/settings/registry";
import { updateSettings } from "@/core/settings/service";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";
const INVALID_INPUT = "Invalid setting value.";
const EMPTY_SUBMISSION = "No editable settings were submitted.";
const ADVANCED_DENIED =
  "Your plan does not include advanced performance tuning. Upgrade to Pro or Enterprise to change this setting.";
const ENTITLEMENT_DENIED = "Your plan does not include this setting.";
const UPDATE_FAILED = "Unable to save the settings.";

type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function guard(key: PermissionKey): Promise<{ session: GuardedSession } | { error: string }> {
  try {
    const { session } = await requirePermission(key);
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

function logFailure(message: string, error: unknown): void {
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function coerce(raw: string, descriptorDefault: unknown): unknown {
  if (typeof descriptorDefault === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return raw;
  }
  if (typeof descriptorDefault === "number") {
    if (raw.trim().length === 0) return raw;
    return Number(raw);
  }
  return raw;
}

function firstIssue(error: { issues: Array<{ message?: string }> }): string {
  return error.issues[0]?.message ?? INVALID_INPUT;
}

/**
 * Saves only submitted, editable registry keys. Infrastructure metadata lives
 * in a separate registry and can never reach the settings service from here.
 */
export async function updateSettingsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("settings.update");
  if ("error" in guarded) return guarded;

  const values: Partial<Record<SettingKey, unknown>> = {};

  for (const descriptor of settingsRegistry) {
    if (descriptor.infrastructure || !formData.has(descriptor.key)) continue;
    const raw = formData.get(descriptor.key);
    if (typeof raw !== "string") return { error: INVALID_INPUT };

    const parsed = descriptor.schema.safeParse(coerce(raw, descriptor.default));
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    values[descriptor.key] = parsed.data;
  }

  if (Object.keys(values).length === 0) return { error: EMPTY_SUBMISSION };

  const requiredEntitlements = new Set<EntitlementKey>();
  if (values["performance.cacheReads"] !== undefined) {
    requiredEntitlements.add("settings.advancedPerformance");
  }
  for (const descriptor of settingsRegistry) {
    if (!descriptor.entitlement || values[descriptor.key] === undefined) continue;
    requiredEntitlements.add(descriptor.entitlement as EntitlementKey);
  }

  for (const entitlement of requiredEntitlements) {
    try {
      await requireEntitlement(entitlement);
    } catch (error: unknown) {
      if (isRedirectError(error)) throw error;
      if (error instanceof EntitlementDeniedError) {
        return {
          error:
            entitlement === "settings.advancedPerformance" ? ADVANCED_DENIED : ENTITLEMENT_DENIED,
        };
      }
      logFailure("Entitlement check failed during settings update", error);
      return { error: UPDATE_FAILED };
    }
  }

  const actor = await actorFrom(guarded.session);
  try {
    // The service owns validation, the before/after audit entry, and cache invalidation.
    await updateSettings(values, actor);
    return { ok: true, message: "Settings saved." };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof PermissionDeniedError) return { error: DENIED };
    logFailure("Settings update failed", error);
    return { error: UPDATE_FAILED };
  }
}
