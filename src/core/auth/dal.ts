import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSecuritySettings } from "@/core/settings/service";
import {
  PermissionDeniedError,
  type PermissionKey,
  permissionKeySchema,
} from "@/core/rbac/permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const getSessionCached = cache(async () => auth.api.getSession({ headers: await headers() }));

const requireSessionCached = cache(async () => {
  const session = await getSessionCached();
  if (!session) redirect("/sign-in");

  const { requireTwoFactor } = await getSecuritySettings();
  if (requireTwoFactor && !session.user.twoFactorEnabled) {
    redirect("/two-factor/enroll");
  }

  return session;
});

export async function getSession() {
  return getSessionCached();
}

export async function requireSession() {
  return requireSessionCached();
}

export async function getCurrentUser() {
  const session = await requireSession();
  return session.user;
}

/**
 * Resolves the effective permission set for the current session. The single
 * workspace scope is represented by "" so multi-workspace can be added later
 * without rewriting the lookup.
 */
const getCurrentPermissionKeysCached = cache(async (): Promise<PermissionKey[]> => {
  const session = await getSessionCached();
  if (!session) return [];

  const record = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      banned: true,
      roles: {
        where: { workspaceId: "", role: { workspaceId: "" } },
        select: {
          role: {
            select: {
              permissions: {
                select: { permission: { select: { key: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!record || record.banned === true) return [];

  const keys = new Set<string>();
  for (const assignment of record.roles) {
    for (const rolePermission of assignment.role.permissions) {
      keys.add(rolePermission.permission.key);
    }
  }

  return [...keys].filter(
    (key): key is PermissionKey => permissionKeySchema.safeParse(key).success,
  );
});

export async function getCurrentPermissionKeys(): Promise<PermissionKey[]> {
  return getCurrentPermissionKeysCached();
}

export async function hasPermission(key: PermissionKey): Promise<boolean> {
  permissionKeySchema.parse(key);
  const keys = await getCurrentPermissionKeys();
  return keys.includes(key);
}

/** Guard for server actions and API handlers: throws on missing permission. */
export async function requirePermission(key: PermissionKey): Promise<{
  session: Awaited<ReturnType<typeof requireSession>>;
  permissionKeys: PermissionKey[];
}> {
  const session = await requireSession();
  const permissionKeys = await getCurrentPermissionKeys();
  if (!permissionKeys.includes(key)) throw new PermissionDeniedError(key);
  return { session, permissionKeys };
}

/** Guard for pages: redirects to /forbidden on missing permission. */
export async function requirePagePermission(key: PermissionKey): Promise<{
  session: Awaited<ReturnType<typeof requireSession>>;
  permissionKeys: PermissionKey[];
}> {
  const session = await requireSession();
  const permissionKeys = await getCurrentPermissionKeys();
  if (!permissionKeys.includes(key)) redirect("/forbidden");
  return { session, permissionKeys };
}

export { PermissionDeniedError };
export type { PermissionKey };
