"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvitationSchema, invitationRoleLookup, inviteSchema } from "@/core/auth/schemas";
import { getSession, PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { ownerAssignmentPermissionKey } from "@/core/rbac/permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; ok?: boolean };

type InvitationActionResult = ActionState & { acceptUrl: string };

type InvitationSession = Awaited<ReturnType<typeof requirePermission>>["session"];

const PERMISSION_DENIED = "You do not have permission to perform this action.";
const INVITATION_INVALID = "This invitation is invalid or has expired.";
const INVITATION_ACCEPT_FAILED = "Unable to accept this invitation.";

async function requestAuditContext(): Promise<Pick<AuditActor, "ip" | "userAgent">> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    ip: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

async function invitationActor(session: InvitationSession): Promise<AuditActor> {
  return {
    userId: session.user.id,
    email: session.user.email,
    ...(await requestAuditContext()),
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
  let permission: Awaited<ReturnType<typeof requirePermission>>;
  try {
    permission = await requirePermission("users.invite");
  } catch (error: unknown) {
    if (error instanceof PermissionDeniedError) return { error: PERMISSION_DENIED };
    throw error;
  }
  const { session, permissionKeys } = permission;

  const parsed = inviteSchema.safeParse({
    email: field(formData, "email"),
    roleId: field(formData, "roleId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // The form submits a Role id so custom roles work and key renames cannot
  // change what the invitation grants.
  const role = await prisma.role.findUnique({
    where: { id: parsed.data.roleId },
    select: {
      id: true,
      key: true,
      workspaceId: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });
  if (!role || role.workspaceId !== "") return { error: "The selected role is unavailable." };

  // Check the granted permission, not just the role key: an inherited custom
  // role that carries Owner assignment must also be gated by the inviter.
  const grantsOwnerAssignment = role.permissions.some(
    (assignment) => assignment.permission.key === ownerAssignmentPermissionKey,
  );
  if (
    (role.key === "owner" || grantsOwnerAssignment) &&
    !permissionKeys.includes(ownerAssignmentPermissionKey)
  ) {
    return { error: PERMISSION_DENIED };
  }

  const actor = await invitationActor(session);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const email = parsed.data.email.toLowerCase();

  const invitation = await prisma.invitation.create({
    data: {
      email,
      token,
      roleId: role.id,
      role: role.key,
      workspaceId: "",
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
    after: { email, role: role.key, roleId: role.id, expiresAt: expiresAt.toISOString() },
  });

  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`;
  logger.info("Invitation created", {
    milestone: "M1",
    email,
    invitedBy: session.user.id,
    invitationId: invitation.id,
    roleId: role.id,
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
    return { error: INVITATION_INVALID };
  }

  const roleLookup = invitationRoleLookup(invitation);
  if (!roleLookup) return { error: INVITATION_INVALID };

  const role =
    roleLookup.by === "id"
      ? await prisma.role.findUnique({
          where: { id: roleLookup.value },
          select: { id: true, key: true, workspaceId: true },
        })
      : await prisma.role.findUnique({
          where: { key: roleLookup.value },
          select: { id: true, key: true, workspaceId: true },
        });
  if (!role || role.workspaceId !== "") return { error: INVITATION_INVALID };

  const email = invitation.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  let userId: string;
  let createdUserId: string | null = null;
  try {
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const signUp = await auth.api.signUpEmail({
        body: {
          email,
          name: parsed.data.name,
          password: parsed.data.password,
        },
      });
      userId = signUp.user.id;
      createdUserId = userId;
    }
  } catch (error: unknown) {
    logger.warn("Invitation sign-up failed", {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: INVITATION_ACCEPT_FAILED };
  }

  const requestContext = await requestAuditContext();

  try {
    await prisma.$transaction(async (tx) => {
      const [inviter, invited] = await Promise.all([
        tx.user.findUnique({
          where: { id: invitation.invitedById },
          select: { email: true },
        }),
        tx.user.findUnique({
          where: { id: userId },
          select: { email: true, roles: { select: { id: true } } },
        }),
      ]);
      if (!invited) throw new Error("Invited user is missing");

      await tx.userRole.upsert({
        where: {
          userId_roleId_workspaceId: { userId, roleId: role.id, workspaceId: "" },
        },
        create: {
          userId,
          roleId: role.id,
          workspaceId: "",
          assignedById: invitation.invitedById,
        },
        update: {},
      });

      // Better Auth's admin plugin reads `User.role`, but RBAC stays
      // authoritative. Stamp the legacy mirror only for an account without
      // existing roles; an existing multi-role user's mirror can be more
      // privileged, so leave it untouched.
      if (invited.roles.length === 0) {
        await tx.user.update({ where: { id: userId }, data: { role: role.key } });
      }

      const acceptedAt = new Date();
      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: acceptedAt } },
        data: { acceptedAt },
      });
      if (consumed.count !== 1) throw new Error("Invitation is no longer valid");

      await audit.log({
        action: auditActions.invitationAccepted,
        actor: {
          userId,
          email: invited.email ?? email,
          ...requestContext,
        },
        client: tx,
        strict: true,
        targetType: "invitation",
        targetId: invitation.id,
        after: {
          email,
          role: role.key,
          roleId: role.id,
          acceptedAt: acceptedAt.toISOString(),
          invitedBy: invitation.invitedById,
        },
      });

      await audit.log({
        action: auditActions.usersInvited,
        actor: {
          userId: invitation.invitedById,
          email: inviter?.email,
          ...requestContext,
        },
        client: tx,
        strict: true,
        targetType: "user",
        targetId: userId,
        after: {
          email,
          userId,
          role: role.key,
          roleId: role.id,
          invitationId: invitation.id,
        },
      });
    });
  } catch (error: unknown) {
    if (createdUserId) {
      try {
        // Do not leave a roleless account behind if the assignment failed.
        await prisma.user.delete({ where: { id: createdUserId } });
      } catch (compensationError: unknown) {
        logger.error("Invitation compensation failed", {
          invitationId: invitation.id,
          userId: createdUserId,
          error:
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError),
        });
      }
    }
    logger.warn("Invitation acceptance failed", {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: INVITATION_ACCEPT_FAILED };
  }

  redirect("/sign-in");
}
