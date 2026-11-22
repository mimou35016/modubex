"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvitationSchema, inviteSchema } from "@/core/auth/schemas";
import { getSession, PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; ok?: boolean };

type InvitationActionResult = ActionState & { acceptUrl: string };

type InvitationSession = Awaited<ReturnType<typeof requirePermission>>["session"];

const PERMISSION_DENIED = "You do not have permission to perform this action.";

async function invitationActor(session: InvitationSession): Promise<AuditActor> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    userId: session.user.id,
    email: session.user.email,
    ip: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

const verifyEmailTokenSchema = z.object({
  token: z.string().min(1),
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

export async function verifyEmailAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = verifyEmailTokenSchema.safeParse({ token: field(formData, "token") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await auth.api.verifyEmail({ query: { token: parsed.data.token } });
    return { ok: true };
  } catch (error: unknown) {
    logger.warn("Email verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Unable to verify this email address." };
  }
}

export async function createInvitationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let session: InvitationSession;
  try {
    ({ session } = await requirePermission("users.invite"));
  } catch (error: unknown) {
    if (error instanceof PermissionDeniedError) return { error: PERMISSION_DENIED };
    throw error;
  }

  const parsed = inviteSchema.safeParse({
    email: field(formData, "email"),
    role: field(formData, "role") || "member",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const actor = await invitationActor(session);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const email = parsed.data.email.toLowerCase();

  const invitation = await prisma.invitation.create({
    data: {
      email,
      token,
      role: parsed.data.role,
      invitedById: session.user.id,
      expiresAt,
    },
  });

  // Never write the token (or a URL containing it) to the audit log or logs.
  await audit.log({
    action: auditActions.invitationCreated,
    actor,
    strict: true,
    targetType: "invitation",
    targetId: invitation.id,
    after: { email, role: parsed.data.role, expiresAt: expiresAt.toISOString() },
  });

  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`;
  logger.info("Invitation created", {
    milestone: "M1",
    email,
    invitedBy: session.user.id,
    invitationId: invitation.id,
  });

  const result: InvitationActionResult = { ok: true, acceptUrl };
  return result;
}

export async function acceptInvitationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = acceptInvitationSchema.safeParse({
    token: field(formData, "token"),
    name: field(formData, "name"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const invitation = await prisma.invitation.findUnique({
    where: { token: parsed.data.token },
  });

  if (
    !invitation ||
    invitation.acceptedAt !== null ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    return { error: "This invitation is invalid or has expired." };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: invitation.email.toLowerCase(),
        name: parsed.data.name,
        password: parsed.data.password,
      },
    });

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  } catch (error: unknown) {
    logger.warn("Invitation acceptance failed", {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Unable to accept this invitation." };
  }

  redirect("/sign-in");
}
