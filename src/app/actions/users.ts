"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import type { AuditActor } from "@/core/audit";
import { logger } from "@/core/logging/logger";
import type { PermissionKey } from "@/core/rbac/permissions";
import { revokeSession, setUserActive } from "@/core/rbac/service";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";

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

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function failureMessage(error: unknown, fallback: string): string {
  if (isRedirectError(error)) throw error;
  if (error instanceof PermissionDeniedError) return DENIED;
  return error instanceof Error && error.message ? error.message : fallback;
}

function logFailure(message: string, error: unknown): void {
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

const setActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.enum(["true", "false"]),
});

const revokeSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
});

export async function setUserActiveAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("users.update");
  if ("error" in guarded) return guarded;

  const parsed = setActiveSchema.safeParse({
    userId: field(formData, "userId"),
    active: field(formData, "active"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const active = parsed.data.active === "true";
  const actor = await actorFrom(guarded.session);
  try {
    // The service audits the change (with before/after) in the same transaction.
    await setUserActive({ userId: parsed.data.userId, active, actor });
    return { ok: true, message: active ? "User reactivated." : "User deactivated." };
  } catch (error: unknown) {
    logFailure("User status change failed", error);
    return { error: failureMessage(error, "Unable to change this user's status.") };
  }
}

export async function revokeSessionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("users.sessions.read");
  if ("error" in guarded) return guarded;

  const parsed = revokeSchema.safeParse({
    sessionId: field(formData, "sessionId"),
    userId: field(formData, "userId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const actor = await actorFrom(guarded.session);
  try {
    await revokeSession({ sessionId: parsed.data.sessionId, actor });
    return { ok: true, message: "Session revoked." };
  } catch (error: unknown) {
    logFailure("Session revocation failed", error);
    return { error: failureMessage(error, "Unable to revoke this session.") };
  }
}
