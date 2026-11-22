import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { prisma } from "@/lib/prisma";
import {
  isSystemRoleKey,
  permissionDescriptor,
  permissionKeySchema,
  systemRoleKeys,
  systemRolePermissions,
  type PermissionKey,
  type SystemRoleKey,
} from "./permissions";

/** All RBAC mutations are scoped to the single-workspace sentinel. */
const WORKSPACE_ID = "";

const actorSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

const roleKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-z][a-z0-9_.-]*$/,
    "Role keys must be lowercase and dot, dash, or underscore separated",
  );

const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissionKeys: z.array(permissionKeySchema),
  actor: actorSchema,
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissionKeys: z.array(permissionKeySchema),
  actor: actorSchema,
});

const roleIdSchema = z.object({
  roleId: z.string().min(1),
  actor: actorSchema,
});

const assignmentSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  actor: actorSchema,
});

const setUserActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
  actor: actorSchema,
});

const revokeSessionSchema = z.object({
  sessionId: z.string().min(1),
  actor: actorSchema,
});

const lastOwnerSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  client: z.custom<Prisma.TransactionClient>(),
});

export type CreateRoleInput = {
  key: string;
  name: string;
  description?: string;
  permissionKeys: PermissionKey[];
  actor: AuditActor;
};

export type UpdateRoleInput = {
  roleId: string;
  name: string;
  description?: string;
  permissionKeys: PermissionKey[];
  actor: AuditActor;
};

export type RoleIdInput = { roleId: string; actor: AuditActor };
export type AssignmentInput = { userId: string; roleId: string; actor: AuditActor };
export type SetUserActiveInput = { userId: string; active: boolean; actor: AuditActor };
export type RevokeSessionInput = { sessionId: string; actor: AuditActor };

type RoleSnapshotSource = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  workspaceId: string;
  permissions: Array<{ permission: { key: string } }>;
};

function roleSnapshot(role: RoleSnapshotSource) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    workspaceId: role.workspaceId,
    permissionKeys: role.permissions.map((item) => item.permission.key).sort(),
  };
}

function uniquePermissionKeys(keys: readonly PermissionKey[]): PermissionKey[] {
  return [...new Set<string>(keys)] as PermissionKey[];
}

function permissionConnectOrCreate(key: string) {
  const descriptor = permissionDescriptor(key);
  return {
    permission: {
      connectOrCreate: {
        where: { key },
        create: {
          key,
          description: descriptor?.description ?? `Permission ${key}`,
          module: descriptor?.module ?? key.split(".")[0] ?? "core",
        },
      },
    },
  };
}

/**
 * Pure exact-sync diff for a locked system role. Anything not in the declared
 * bundle is returned in `toRemove`, so stale grants can never accumulate.
 */
export function systemRolePermissionDiff(
  role: SystemRoleKey,
  currentKeys: readonly string[],
): { toAdd: PermissionKey[]; toRemove: string[] } {
  const expected = new Set<string>(systemRolePermissions(role));
  const current = new Set<string>(currentKeys);
  return {
    toAdd: [...expected].filter((key) => !current.has(key)) as PermissionKey[],
    toRemove: [...current].filter((key) => !expected.has(key)),
  };
}

/**
 * Makes each locked system role's permission set exactly match its declared
 * bundle. Only rows belonging to system roles are added or removed; custom
 * roles are never touched. Safe to call repeatedly.
 */
export async function syncSystemRolePermissions(
  client: Prisma.TransactionClient | PrismaClient,
): Promise<void> {
  const permissionRows = await client.permission.findMany({
    select: { id: true, key: true },
  });
  const permissionIds = new Map(permissionRows.map((row) => [row.key, row.id]));

  for (const roleKey of systemRoleKeys) {
    const role = await client.role.findUnique({
      where: { key: roleKey },
      select: {
        id: true,
        isSystem: true,
        permissions: {
          select: { id: true, permission: { select: { key: true } } },
        },
      },
    });
    if (!role || !role.isSystem) continue;

    const diff = systemRolePermissionDiff(
      roleKey,
      role.permissions.map((item) => item.permission.key),
    );

    const staleIds = role.permissions
      .filter((item) => diff.toRemove.includes(item.permission.key))
      .map((item) => item.id);
    if (staleIds.length > 0) {
      await client.rolePermission.deleteMany({ where: { id: { in: staleIds } } });
    }

    const additions = diff.toAdd.flatMap((key) => {
      const permissionId = permissionIds.get(key);
      return permissionId ? [{ roleId: role.id, permissionId }] : [];
    });
    if (additions.length > 0) {
      await client.rolePermission.createMany({ data: additions, skipDuplicates: true });
    }
  }
}

/**
 * Pure form of the last-Owner guard so the invariant can be tested without a
 * database. A user who is already banned is not an active Owner.
 */
export function wouldRemoveLastActiveOwner(input: {
  isOwnerRole: boolean;
  hasOwnerAssignment: boolean;
  targetIsActive: boolean;
  activeOwnerCount: number;
}): boolean {
  return (
    input.isOwnerRole &&
    input.hasOwnerAssignment &&
    input.targetIsActive &&
    input.activeOwnerCount <= 1
  );
}

/**
 * Blocks removing or deactivating the last active Owner. Safe to call for any
 * role: non-Owner roles and unassigned users are no-ops.
 */
export async function assertNotLastOwnerRemoval(input: {
  userId: string;
  roleId: string;
  client: Prisma.TransactionClient;
}): Promise<void> {
  const data = lastOwnerSchema.parse(input);
  const ownerRole = await data.client.role.findUnique({
    where: { key: "owner" },
    select: { id: true, workspaceId: true },
  });
  if (!ownerRole || ownerRole.id !== data.roleId || ownerRole.workspaceId !== WORKSPACE_ID) return;

  const assignment = await data.client.userRole.findUnique({
    where: {
      userId_roleId_workspaceId: {
        userId: data.userId,
        roleId: data.roleId,
        workspaceId: WORKSPACE_ID,
      },
    },
    select: { id: true },
  });
  if (!assignment) return;

  const target = await data.client.user.findUnique({
    where: { id: data.userId },
    select: { banned: true },
  });
  const targetIsActive = target?.banned !== true;

  const activeOwnerCount = await data.client.userRole.count({
    where: {
      roleId: ownerRole.id,
      workspaceId: WORKSPACE_ID,
      user: { OR: [{ banned: false }, { banned: null }] },
    },
  });

  if (
    wouldRemoveLastActiveOwner({
      isOwnerRole: true,
      hasOwnerAssignment: true,
      targetIsActive,
      activeOwnerCount,
    })
  ) {
    throw new Error("Cannot remove, deactivate, or demote the last active Owner");
  }
}

export async function createRole(input: CreateRoleInput): Promise<{ id: string }> {
  const data = createRoleSchema.parse(input);
  if (isSystemRoleKey(data.key)) {
    throw new Error("System role keys are reserved and cannot be created");
  }

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.role.findUnique({
      where: { key: data.key },
      select: { id: true },
    });
    if (duplicate) throw new Error(`Role key already exists: ${data.key}`);

    const keys = uniquePermissionKeys(data.permissionKeys);
    const role = await tx.role.create({
      data: {
        key: data.key,
        name: data.name,
        description: data.description,
        isSystem: false,
        workspaceId: WORKSPACE_ID,
        permissions: { create: keys.map(permissionConnectOrCreate) },
      },
    });

    await audit.log({
      action: auditActions.rolesCreated,
      actor: data.actor,
      targetType: "role",
      targetId: role.id,
      module: "core",
      workspaceId: WORKSPACE_ID,
      after: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissionKeys: keys,
      },
      client: tx,
      strict: true,
    });

    return { id: role.id };
  });
}

export async function updateRole(input: UpdateRoleInput): Promise<void> {
  const data = updateRoleSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { id: data.roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new Error("Role not found");
    if (role.isSystem) throw new Error("System roles cannot be edited");

    const before = roleSnapshot(role);
    const keys = uniquePermissionKeys(data.permissionKeys);
    const updated = await tx.role.update({
      where: { id: role.id },
      data: {
        name: data.name,
        description: data.description,
        permissions: {
          deleteMany: {},
          create: keys.map(permissionConnectOrCreate),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });

    await audit.log({
      action: auditActions.rolesUpdated,
      actor: data.actor,
      targetType: "role",
      targetId: role.id,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before,
      after: roleSnapshot(updated),
      client: tx,
      strict: true,
    });
  });
}

export async function deleteRole(input: RoleIdInput): Promise<void> {
  const data = roleIdSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { id: data.roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new Error("Role not found");
    if (role.isSystem) throw new Error("System roles cannot be deleted");

    const assignedUsers = await tx.userRole.count({ where: { roleId: role.id } });
    if (assignedUsers > 0) {
      throw new Error("Cannot delete a role that is still assigned to users");
    }

    await tx.role.delete({ where: { id: role.id } });

    await audit.log({
      action: auditActions.rolesDeleted,
      actor: data.actor,
      targetType: "role",
      targetId: role.id,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: roleSnapshot(role),
      after: null,
      client: tx,
      strict: true,
    });
  });
}

/**
 * Assigns a role to a user. Callers must gate assignment of the Owner role
 * with `requirePermission("roles.assign_owner")`; this service enforces the
 * data invariant and writes the audit entry.
 */
export async function assignRole(input: AssignmentInput): Promise<void> {
  const data = assignmentSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const [user, role] = await Promise.all([
      tx.user.findUnique({ where: { id: data.userId }, select: { id: true } }),
      tx.role.findUnique({ where: { id: data.roleId }, select: { id: true, key: true } }),
    ]);
    if (!user) throw new Error("User not found");
    if (!role) throw new Error("Role not found");

    const existing = await tx.userRole.findUnique({
      where: {
        userId_roleId_workspaceId: {
          userId: data.userId,
          roleId: data.roleId,
          workspaceId: WORKSPACE_ID,
        },
      },
      select: { id: true },
    });
    if (existing) throw new Error("User already has this role");

    const assignment = await tx.userRole.create({
      data: {
        userId: data.userId,
        roleId: data.roleId,
        workspaceId: WORKSPACE_ID,
        assignedById: data.actor.userId,
      },
    });

    await audit.log({
      action: auditActions.usersRoleChanged,
      actor: data.actor,
      targetType: "user",
      targetId: data.userId,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: null,
      after: {
        assignmentId: assignment.id,
        roleId: role.id,
        roleKey: role.key,
        workspaceId: WORKSPACE_ID,
      },
      client: tx,
      strict: true,
    });
  });
}

export async function unassignRole(input: AssignmentInput): Promise<void> {
  const data = assignmentSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.userRole.findUnique({
      where: {
        userId_roleId_workspaceId: {
          userId: data.userId,
          roleId: data.roleId,
          workspaceId: WORKSPACE_ID,
        },
      },
      include: { role: { select: { key: true } } },
    });
    if (!assignment) throw new Error("User does not have this role");

    await assertNotLastOwnerRemoval({ userId: data.userId, roleId: data.roleId, client: tx });
    await tx.userRole.delete({ where: { id: assignment.id } });

    await audit.log({
      action: auditActions.usersRoleChanged,
      actor: data.actor,
      targetType: "user",
      targetId: data.userId,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: {
        assignmentId: assignment.id,
        roleId: data.roleId,
        roleKey: assignment.role.key,
        workspaceId: WORKSPACE_ID,
      },
      after: null,
      client: tx,
      strict: true,
    });
  });
}

/** `active: false` maps to Better Auth's `banned` flag. */
export async function setUserActive(input: SetUserActiveInput): Promise<void> {
  const data = setUserActiveSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: data.userId },
      select: { id: true, banned: true },
    });
    if (!user) throw new Error("User not found");
    const wasActive = user.banned !== true;
    if (wasActive === data.active) return;

    if (!data.active) {
      const ownerRole = await tx.role.findUnique({
        where: { key: "owner" },
        select: { id: true },
      });
      if (ownerRole) {
        await assertNotLastOwnerRemoval({ userId: data.userId, roleId: ownerRole.id, client: tx });
      }
    }

    await tx.user.update({
      where: { id: data.userId },
      data: { banned: !data.active },
    });

    await audit.log({
      action: data.active ? auditActions.usersActivated : auditActions.usersDeactivated,
      actor: data.actor,
      targetType: "user",
      targetId: data.userId,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: { active: wasActive },
      after: { active: data.active },
      client: tx,
      strict: true,
    });
  });
}

export async function revokeSession(input: RevokeSessionInput): Promise<void> {
  const data = revokeSessionSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: data.sessionId },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });
    if (!session) throw new Error("Session not found");

    await tx.session.delete({ where: { id: session.id } });

    await audit.log({
      action: auditActions.usersSessionRevoked,
      actor: data.actor,
      targetType: "session",
      targetId: session.id,
      module: "core",
      workspaceId: WORKSPACE_ID,
      before: {
        sessionId: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
      after: null,
      client: tx,
      strict: true,
    });
  });
}

// Re-exported so callers can construct a typed client without importing Prisma directly.
export type RbacClient = PrismaClient;
