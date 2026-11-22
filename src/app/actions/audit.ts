"use server";

import { headers } from "next/headers";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { type AuditActor } from "@/core/audit";
import { getAuditRetention, purgeExpiredAuditLogs } from "@/core/audit/retention";
import { logger } from "@/core/logging/logger";
import type { PermissionKey } from "@/core/rbac/permissions";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";
const FOREVER_ERROR =
  "Audit retention is set to keep logs forever. Configure a retention window before purging.";

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

export async function runAuditPurgeAction(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  // A purge takes no user-supplied fields; keep the useActionState signature.
  void _state;
  void _formData;

  const guarded = await guard("audit.manage");
  if ("error" in guarded) return guarded;

  const actor = await actorFrom(guarded.session);
  try {
    // Zero days means "keep forever"; never run a destructive purge in that case.
    const retentionDays = getAuditRetention();
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return { error: FOREVER_ERROR };

    // The core purge writes its own append-only audit entry in the same transaction.
    const { deleted } = await purgeExpiredAuditLogs(actor);
    return {
      ok: true,
      message: `Purged ${deleted} expired audit ${deleted === 1 ? "entry" : "entries"}.`,
    };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof PermissionDeniedError) return { error: DENIED };
    logger.error("Audit retention purge failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error:
        error instanceof Error && error.message ? error.message : "Unable to purge audit logs.",
    };
  }
}
