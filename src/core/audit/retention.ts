import { env } from "@/core/config/env";
import { prisma } from "@/lib/prisma";
import { audit, auditActions, type AuditActor } from "./audit";

const MS_PER_DAY = 86_400_000;

/** Configured retention window in days; 0 means entries are kept forever. */
export function getAuditRetention(): number {
  return env.AUDIT_RETENTION_DAYS;
}

/** Cutoff timestamp for the configured retention window, or null when disabled. */
export function getAuditRetentionCutoff(now: Date = new Date()): Date | null {
  const days = getAuditRetention();
  if (days <= 0) return null;
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Deletes expired audit rows and records the purge itself in the same
 * transaction. Authorization must be enforced by the caller.
 */
export async function purgeExpiredAuditLogs(
  actor: AuditActor,
): Promise<{ deleted: number; cutoff: Date | null }> {
  const cutoff = getAuditRetentionCutoff();
  if (!cutoff) return { deleted: 0, cutoff: null };

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    await audit.log({
      action: auditActions.auditPurged,
      actor,
      targetType: "auditLog",
      module: "audit",
      metadata: {
        cutoff: cutoff.toISOString(),
        deletedCount: result.count,
      },
      client: tx,
      strict: true,
    });

    return result.count;
  });

  return { deleted, cutoff };
}
