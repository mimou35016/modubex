import { env } from "../src/core/config/env";
import { logger } from "../src/core/logging/logger";
import {
  isSystemRoleKey,
  permissionDescriptor,
  permissionKeys,
  type SystemRoleKey,
} from "../src/core/rbac/permissions";
import { syncSystemRolePermissions } from "../src/core/rbac/service";
import { ensureDefaultSettings } from "../src/core/settings/service";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const WORKSPACE_ID = "";

const systemRoles: ReadonlyArray<{ key: SystemRoleKey; name: string; description: string }> = [
  {
    key: "owner",
    name: "Owner",
    description: "Full control of the workspace, including Owner assignment.",
  },
  {
    key: "admin",
    name: "Admin",
    description: "Manages users, roles, settings, modules, and audit logs.",
  },
  {
    key: "member",
    name: "Member",
    description: "Can sign in and use the application shell.",
  },
];

async function ensureOwnerUser(email: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { emailVerified: true, role: "owner" },
    });
    logger.info("Owner already present", { milestone: "M1", email });
    return existing.id;
  }

  // signUpEmail hashes the credential through Better Auth's password helper.
  await auth.api.signUpEmail({
    body: {
      email,
      name: "Modubex Owner",
      password: env.SEED_OWNER_PASSWORD,
    },
  });

  const created = await prisma.user.findUnique({ where: { email } });
  if (!created) throw new Error("Owner sign-up did not create a user.");

  await prisma.user.update({
    where: { id: created.id },
    data: { emailVerified: true, role: "owner" },
  });

  logger.info("Owner seeded", { milestone: "M1", email, userId: created.id });
  return created.id;
}

/** Idempotent catalog, system-role, and assignment synchronization. */
async function syncRbac(ownerUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Aggregated catalog: core keys plus every bundled module's prefixed keys.
    for (const key of permissionKeys) {
      const descriptor = permissionDescriptor(key);
      if (!descriptor) continue;
      await tx.permission.upsert({
        where: { key },
        update: { description: descriptor.description, module: descriptor.module },
        create: {
          key,
          description: descriptor.description,
          module: descriptor.module,
        },
      });
    }

    for (const role of systemRoles) {
      await tx.role.upsert({
        where: { key: role.key },
        update: {
          name: role.name,
          description: role.description,
          isSystem: true,
          workspaceId: WORKSPACE_ID,
        },
        create: {
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: true,
          workspaceId: WORKSPACE_ID,
        },
      });
    }

    // Exact sync: stale grants are deleted and missing grants added, but only
    // for locked system roles. Custom roles are left untouched.
    await syncSystemRolePermissions(tx);

    // Keep legacy Better Auth `role` strings mirrored into the authoritative
    // UserRole table. Existing assignments are never duplicated.
    const users = await tx.user.findMany({
      where: { role: { in: ["owner", "admin", "member"] } },
      select: { id: true, role: true },
    });
    for (const user of users) {
      if (!user.role) continue;
      const key = user.role.toLowerCase();
      if (!isSystemRoleKey(key)) continue;
      const roleRecord = await tx.role.findUnique({ where: { key }, select: { id: true } });
      if (!roleRecord) continue;
      await tx.userRole.upsert({
        where: {
          userId_roleId_workspaceId: {
            userId: user.id,
            roleId: roleRecord.id,
            workspaceId: WORKSPACE_ID,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: roleRecord.id,
          workspaceId: WORKSPACE_ID,
          assignedById: ownerUserId,
        },
      });
    }

    const ownerRole = await tx.role.findUnique({ where: { key: "owner" }, select: { id: true } });
    if (!ownerRole) throw new Error("Owner role was not seeded.");
    await tx.userRole.upsert({
      where: {
        userId_roleId_workspaceId: {
          userId: ownerUserId,
          roleId: ownerRole.id,
          workspaceId: WORKSPACE_ID,
        },
      },
      update: {},
      create: {
        userId: ownerUserId,
        roleId: ownerRole.id,
        workspaceId: WORKSPACE_ID,
        assignedById: ownerUserId,
      },
    });
  });

  logger.info("RBAC catalog and system roles synced", {
    milestone: "M4",
    permissionCount: permissionKeys.length,
  });
}

/** Seeds the single license snapshot once; existing rows are never changed. */
async function ensureLicense(): Promise<void> {
  const existing = await prisma.license.findFirst({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true },
  });
  if (existing) return;

  await prisma.license.create({
    data: {
      plan: "pro",
      entitlements: [],
      workspaceId: WORKSPACE_ID,
    },
  });
  logger.info("License seeded", { milestone: "M3", plan: "pro" });
}

async function main(): Promise<void> {
  await prisma.$connect();
  const email = env.SEED_OWNER_EMAIL.toLowerCase();
  const ownerUserId = await ensureOwnerUser(email);
  await syncRbac(ownerUserId);
  await ensureDefaultSettings();
  await ensureLicense();
}

main()
  .catch((error: unknown) => {
    logger.error("Seed failed", {
      milestone: "M2",
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
