"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import type { AuditActor } from "@/core/audit";
import { logger } from "@/core/logging/logger";
import { corePermissionKeys, type PermissionKey } from "@/core/rbac/permissions";
import { assignRole, createRole, deleteRole, unassignRole, updateRole } from "@/core/rbac/service";
import { prisma } from "@/lib/prisma";

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

function repeatedFields(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function failureMessage(error: unknown, fallback: string): string {
  if (isRedirectError(error)) throw error;
  if (error instanceof PermissionDeniedError) return DENIED;
  return error instanceof Error && error.message ? error.message : fallback;
}

function knownPermissionKeySet(): Set<string> {
  const catalog: unknown = corePermissionKeys;
  if (Array.isArray(catalog)) {
    return new Set(catalog.filter((item): item is string => typeof item === "string"));
  }
  if (catalog instanceof Set) {
    return new Set(Array.from(catalog).filter((item): item is string => typeof item === "string"));
  }
  if (typeof catalog === "object" && catalog !== null) {
    return new Set(
      Object.values(catalog as Record<string, unknown>).filter(
        (item): item is string => typeof item === "string",
      ),
    );
  }
  return new Set();
}

const knownPermissions = knownPermissionKeySet();

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z][a-z0-9._-]*$/,
    "Role keys must start with a lowercase letter and use lowercase letters, numbers, dots, dashes or underscores.",
  );
const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(500).optional().default("");
const permissionListSchema = z
  .array(z.string().min(1))
  .refine(
    (keys) => knownPermissions.size === 0 || keys.every((key) => knownPermissions.has(key)),
    "Unknown permission key.",
  );

const createRoleSchema = z.object({
  key: slugSchema,
  name: nameSchema,
  description: descriptionSchema,
  permissions: permissionListSchema,
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: nameSchema,
  description: descriptionSchema,
  permissions: permissionListSchema,
});

const idSchema = z.object({ roleId: z.string().min(1) });

const assignmentSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

function logFailure(message: string, error: unknown): void {
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

/** Accept either a role id or its stable key from the form. */
async function resolveRole(
  identifier: string,
): Promise<{ role: { id: string; key: string } | null; error?: string }> {
  try {
    const role = await prisma.role.findFirst({
      where: { OR: [{ id: identifier }, { key: identifier }] },
      select: { id: true, key: true },
    });
    return { role };
  } catch (error: unknown) {
    logFailure("Role lookup failed", error);
    return { role: null, error: failureMessage(error, "Unable to look up this role.") };
  }
}

export async function createRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("roles.manage");
  if ("error" in guarded) return guarded;

  const parsed = createRoleSchema.safeParse({
    key: field(formData, "key"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    permissions: repeatedFields(formData, "permissions"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const actor = await actorFrom(guarded.session);
  try {
    // The service writes the strict, before/after audit entry in the same transaction.
    await createRole({
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      permissionKeys: parsed.data.permissions as PermissionKey[],
      actor,
    });
    return { ok: true, message: "Role created." };
  } catch (error: unknown) {
    logFailure("Role creation failed", error);
    return { error: failureMessage(error, "Unable to create the role.") };
  }
}

export async function updateRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("roles.manage");
  if ("error" in guarded) return guarded;

  const parsed = updateRoleSchema.safeParse({
    roleId: field(formData, "roleId") || field(formData, "key"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    permissions: repeatedFields(formData, "permissions"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lookup = await resolveRole(parsed.data.roleId);
  if (lookup.error) return { error: lookup.error };
  if (!lookup.role) return { error: "Role not found." };
  const role = lookup.role;

  const actor = await actorFrom(guarded.session);
  try {
    await updateRole({
      roleId: role.id,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      permissionKeys: parsed.data.permissions as PermissionKey[],
      actor,
    });

    return { ok: true, message: "Role updated." };
  } catch (error: unknown) {
    logFailure("Role update failed", error);
    return { error: failureMessage(error, "Unable to update the role.") };
  }
}

export async function deleteRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("roles.manage");
  if ("error" in guarded) return guarded;

  const parsed = idSchema.safeParse({ roleId: field(formData, "roleId") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lookup = await resolveRole(parsed.data.roleId);
  if (lookup.error) return { error: lookup.error };
  if (!lookup.role) return { error: "Role not found." };
  const role = lookup.role;

  const actor = await actorFrom(guarded.session);
  try {
    await deleteRole({ roleId: role.id, actor });
    return { ok: true, message: "Role deleted." };
  } catch (error: unknown) {
    logFailure("Role deletion failed", error);
    return { error: failureMessage(error, "Unable to delete the role.") };
  }
}

export async function assignRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("roles.manage");
  if ("error" in guarded) return guarded;

  const parsed = assignmentSchema.safeParse({
    userId: field(formData, "userId"),
    roleId: field(formData, "roleId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lookup = await resolveRole(parsed.data.roleId);
  if (lookup.error) return { error: lookup.error };
  if (!lookup.role) return { error: "Role not found." };
  const role = lookup.role;

  if (role.key === "owner") {
    const ownerGuarded = await guard("roles.assign_owner");
    if ("error" in ownerGuarded) return ownerGuarded;
  }

  const actor = await actorFrom(guarded.session);
  try {
    await assignRole({ userId: parsed.data.userId, roleId: role.id, actor });
    return { ok: true, message: "Role assigned." };
  } catch (error: unknown) {
    logFailure("Role assignment failed", error);
    return { error: failureMessage(error, "Unable to assign the role.") };
  }
}

export async function unassignRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard("roles.manage");
  if ("error" in guarded) return guarded;

  const parsed = assignmentSchema.safeParse({
    userId: field(formData, "userId"),
    roleId: field(formData, "roleId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lookup = await resolveRole(parsed.data.roleId);
  if (lookup.error) return { error: lookup.error };
  if (!lookup.role) return { error: "Role not found." };
  const role = lookup.role;

  if (role.key === "owner") {
    const ownerGuarded = await guard("roles.assign_owner");
    if ("error" in ownerGuarded) return ownerGuarded;
  }

  const actor = await actorFrom(guarded.session);
  try {
    await unassignRole({ userId: parsed.data.userId, roleId: role.id, actor });
    return { ok: true, message: "Role removed." };
  } catch (error: unknown) {
    logFailure("Role unassignment failed", error);
    return { error: failureMessage(error, "Unable to remove the role.") };
  }
}
