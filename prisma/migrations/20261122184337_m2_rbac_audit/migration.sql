-- AlterTable
ALTER TABLE "auditLog" ADD COLUMN     "module" TEXT NOT NULL DEFAULT 'core',
ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" TEXT,
ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'core',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "rolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "permission_module_idx" ON "permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "role_workspaceId_idx" ON "role"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "rolePermission_roleId_permissionId_key" ON "rolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "userRole_workspaceId_idx" ON "userRole"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "userRole_userId_roleId_workspaceId_key" ON "userRole"("userId", "roleId", "workspaceId");

-- CreateIndex
CREATE INDEX "auditLog_module_idx" ON "auditLog"("module");

-- CreateIndex
CREATE INDEX "auditLog_workspaceId_createdAt_idx" ON "auditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "rolePermission" ADD CONSTRAINT "rolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolePermission" ADD CONSTRAINT "rolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userRole" ADD CONSTRAINT "userRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userRole" ADD CONSTRAINT "userRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M2 data backfill. All statements are safe to rerun and do not overwrite
-- rows that the idempotent seed or an operator already created.

-- Permission catalog (matches src/core/rbac/permissions.ts).
INSERT INTO "permission" ("id", "key", "description", "module", "createdAt", "updatedAt")
SELECT 'm2_perm_' || regexp_replace(v."key", '[^a-zA-Z0-9]', '_', 'g'), v."key", v."description", v."module", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('app.access', 'Sign in and use the application shell.', 'core'),
  ('users.read', 'View users and their account details.', 'core'),
  ('users.invite', 'Invite new users to the workspace.', 'core'),
  ('users.update', 'Edit user profiles and activation state.', 'core'),
  ('users.sessions.read', 'View active sessions belonging to users.', 'core'),
  ('roles.read', 'View roles and their permission assignments.', 'core'),
  ('roles.manage', 'Create, update, and delete custom roles.', 'core'),
  ('roles.assign_owner', 'Assign or remove the Owner system role.', 'core'),
  ('audit.read', 'View audit log entries.', 'core'),
  ('audit.export', 'Export audit log entries to CSV.', 'core'),
  ('audit.manage', 'Configure audit retention and run retention purges.', 'core'),
  ('settings.read', 'View runtime application settings.', 'core'),
  ('settings.update', 'Change runtime application settings.', 'core'),
  ('license.read', 'View the current plan and entitlements.', 'core'),
  ('license.manage', 'Change the plan or license key.', 'core'),
  ('modules.read', 'Browse available and installed modules.', 'core'),
  ('modules.manage', 'Install, configure, enable, and disable modules.', 'core')
) AS v("key", "description", "module")
ON CONFLICT ("key") DO NOTHING;

-- Locked system roles.
INSERT INTO "role" ("id", "key", "name", "description", "isSystem", "workspaceId", "createdAt", "updatedAt")
VALUES
  ('m2_role_owner', 'owner', 'Owner', 'Full control of the workspace, including Owner assignment.', true, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m2_role_admin', 'admin', 'Admin', 'Manages users, roles, settings, modules, and audit logs.', true, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m2_role_member', 'member', 'Member', 'Can sign in and use the application shell.', true, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- System role permission bundles.
INSERT INTO "rolePermission" ("id", "roleId", "permissionId")
SELECT 'm2_rp_owner_' || regexp_replace(p."key", '[^a-zA-Z0-9]', '_', 'g'), r."id", p."id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."key" = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "rolePermission" ("id", "roleId", "permissionId")
SELECT 'm2_rp_admin_' || regexp_replace(p."key", '[^a-zA-Z0-9]', '_', 'g'), r."id", p."id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."key" = 'admin' AND p."key" <> 'roles.assign_owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "rolePermission" ("id", "roleId", "permissionId")
SELECT 'm2_rp_member_' || regexp_replace(p."key", '[^a-zA-Z0-9]', '_', 'g'), r."id", p."id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."key" = 'member' AND p."key" = 'app.access'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Backfill existing Better Auth users from their legacy `role` string.
INSERT INTO "userRole" ("id", "userId", "roleId", "workspaceId", "createdAt")
SELECT 'm2_ur_' || u."id" || '_' || r."key", u."id", r."id", '', CURRENT_TIMESTAMP
FROM "user" u
JOIN "role" r ON r."key" = lower(u."role")
WHERE lower(u."role") IN ('owner', 'admin', 'member')
ON CONFLICT ("userId", "roleId", "workspaceId") DO NOTHING;
