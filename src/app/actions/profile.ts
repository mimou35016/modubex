"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { requireSession } from "@/core/auth/dal";
import { validatePasswordWithSettings } from "@/core/auth/schemas";
import { logger } from "@/core/logging/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; ok?: boolean; message?: string };

type ProfileSession = Awaited<ReturnType<typeof requireSession>>;
type RequestContext = Pick<AuditActor, "ip" | "userAgent">;

const NAME_UPDATE_FAILED = "Unable to update your name. Please try again.";
const PASSWORD_CHANGE_FAILED =
  "Unable to change your password. Check your current password and try again.";
const SESSION_NOT_FOUND = "That session is no longer active.";
const SESSION_REVOKE_FAILED = "Unable to revoke this session.";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120, "Your name is too long."),
});

const passwordInputSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(1, "Enter a new password."),
});

const sessionIdSchema = z.object({
  sessionId: z.string().min(1, "Select a session to revoke."),
});

// The platform audit constants are added alongside this workstream. Reading
// them through a string map keeps the action valid whether the profile action
// is exported under either name; no credential-like value is ever passed here.
const auditActionNames: Readonly<Record<string, string | undefined>> = { ...auditActions };
const profileUpdatedAction =
  auditActionNames.profileNameUpdated ?? auditActionNames.profileUpdated ?? "profile.updated";
const passwordChangedAction =
  auditActionNames.authPasswordChanged ??
  auditActionNames.passwordChanged ??
  "auth.password.changed";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

async function requestContext(): Promise<RequestContext> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    ip: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

function actorFor(session: ProfileSession, context: RequestContext): AuditActor {
  return {
    userId: session.user.id,
    email: session.user.email,
    ...context,
  };
}

export async function updateProfileNameAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Self-only: the session is the identity source; no userId is read from input.
  const session = await requireSession();
  const parsed = nameSchema.safeParse({ name: field(formData, "name") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const beforeName = session.user.name ?? null;
  const context = await requestContext();

  try {
    await auth.api.updateUser({
      body: { name: parsed.data.name },
      headers: await headers(),
    });
  } catch {
    logger.warn("Profile name update failed");
    return { error: NAME_UPDATE_FAILED };
  }

  await audit.log({
    action: profileUpdatedAction,
    actor: actorFor(session, context),
    strict: true,
    targetType: "user",
    targetId: session.user.id,
    before: beforeName === null ? null : { name: beforeName },
    after: { name: parsed.data.name },
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Self-only: Better Auth derives the target account from the session headers.
  const session = await requireSession();
  const parsed = passwordInputSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    newPassword: field(formData, "newPassword"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // The live settings-backed policy is authoritative; the static bootstrap
  // schema is intentionally not used here.
  const policy = await validatePasswordWithSettings(parsed.data.newPassword);
  if (!policy.success) return { error: firstIssue(policy.error) };

  const context = await requestContext();
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });
  } catch {
    // Never echo or log a provider error: it may quote the submitted password.
    return { error: PASSWORD_CHANGE_FAILED };
  }

  await audit.log({
    action: passwordChangedAction,
    actor: actorFor(session, context),
    strict: true,
    targetType: "user",
    targetId: session.user.id,
    after: { changedAt: new Date().toISOString() },
  });

  revalidatePath("/profile");
  return { ok: true };
}

export async function revokeOwnSessionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = sessionIdSchema.safeParse({ sessionId: field(formData, "sessionId") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const context = await requestContext();
  // The ownership predicate is part of the query, so a forged session id can
  // never resolve to another user's session.
  const owned = await prisma.session.findFirst({
    where: { id: parsed.data.sessionId, userId: session.user.id },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
  });
  if (!owned) return { error: SESSION_NOT_FOUND };

  try {
    await auth.api.revokeSession({
      body: { token: owned.token },
      headers: await headers(),
    });
  } catch {
    logger.warn("Profile session revocation failed");
    return { error: SESSION_REVOKE_FAILED };
  }

  await audit.log({
    action: auditActions.usersSessionRevoked,
    actor: actorFor(session, context),
    strict: true,
    targetType: "session",
    targetId: owned.id,
    before: {
      userId: session.user.id,
      expiresAt: owned.expiresAt.toISOString(),
      ipAddress: owned.ipAddress,
      userAgent: owned.userAgent,
    },
    after: null,
  });

  revalidatePath("/profile");
  return { ok: true };
}
