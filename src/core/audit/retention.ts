import { getSettingValue } from "@/core/settings/service";
import { prisma } from "@/lib/prisma";
import { audit, auditActions, type AuditActor } from "./audit";

const MS_PER_DAY = 86_400_000;

/** Configured runtime retention window in days; 0 keeps entries forever. */
export async function getAuditRetention(): Promise<number> {
  return getSettingValue("audit.retentionDays");
}

/** Cutoff timestamp for the configured retention window, or null when disabled. */
export async function getAuditRetentionCutoff(now: Date = new Date()): Promise<Date | null> {
  const days = await getAuditRetention();
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
  const cutoff = await getAuditRetentionCutoff();
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
