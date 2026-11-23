import type { PermissionKey } from "@/core/rbac/permissions";
import { prisma } from "@/lib/prisma";

/** A single recent audit row, projected for the overview feed. */
export type OverviewAuditEntry = {
  id: string;
  actor: string | null;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
};

export type OverviewUsers = { total: number; activeSessions: number };
export type OverviewAudit = { entries: OverviewAuditEntry[] };

/**
 * Sections are optional: when the viewer lacks the matching permission the
 * section is absent from the result, so the page can omit it entirely rather
 * than rendering empty or placeholder metrics.
 */
export type OverviewData = {
  users?: OverviewUsers;
  audit?: OverviewAudit;
};

const RECENT_AUDIT_LIMIT = 5;

async function readUsers(): Promise<OverviewUsers> {
  const [total, activeSessions] = await Promise.all([
    prisma.user.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);
  return { total, activeSessions };
}

async function readAudit(): Promise<OverviewAudit> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: RECENT_AUDIT_LIMIT,
    select: {
      id: true,
      email: true,
      userId: true,
      action: true,
      targetType: true,
      targetId: true,
      createdAt: true,
    },
  });

  return {
    entries: rows.map((row) => ({
      id: row.id,
      actor: row.email ?? row.userId,
      userId: row.userId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
    })),
  };
}

/**
 * Aggregates the live overview data from Prisma. Independent reads run in
 * parallel, and each section is gated by its permission before any query.
 */
export async function getOverviewData(
  permissionKeys: readonly PermissionKey[],
): Promise<OverviewData> {
  const [users, audit] = await Promise.all([
    permissionKeys.includes("users.read") ? readUsers() : Promise.resolve(undefined),
    permissionKeys.includes("audit.read") ? readAudit() : Promise.resolve(undefined),
  ]);

  const data: OverviewData = {};
  if (users) data.users = users;
  if (audit) data.audit = audit;
  return data;
}
