import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

/** Caller-supplied identity for an audited event. */
export type AuditActor = {
  userId: string;
  email?: string;
  ip?: string;
  userAgent?: string;
};

/** Auditing can participate in an existing transaction or use the shared client. */
export type AuditClient = PrismaClient | Prisma.TransactionClient;

/** Stable action vocabulary shared by core and modules. */
export const auditActions = {
  signInSuccess: "auth.sign_in.success",
  signInFailed: "auth.sign_in.failed",
  signOut: "auth.sign_out",
  invitationCreated: "auth.invitation.created",
  invitationAccepted: "auth.invitation.accepted",
  usersInvited: "users.invited",
  usersActivated: "users.activated",
  usersDeactivated: "users.deactivated",
  usersRoleChanged: "users.role.changed",
  usersSessionRevoked: "users.session.revoked",
  rolesCreated: "roles.created",
  rolesUpdated: "roles.updated",
  rolesDeleted: "roles.deleted",
  auditExported: "audit.exported",
  auditPurged: "audit.purged",
  settingsUpdated: "settings.updated",
  licensePlanChanged: "license.plan.changed",
  licenseKeyUpdated: "license.key.updated",
  modulesInstalled: "modules.installed",
  modulesEnabled: "modules.enabled",
  modulesDisabled: "modules.disabled",
  modulesSettingsUpdated: "modules.settings.updated",
  modulesUninstalled: "modules.uninstalled",
} as const;

export type CoreAuditAction = (typeof auditActions)[keyof typeof auditActions];
/** Core actions are typed; prefixed module actions remain valid strings. */
export type AuditAction = CoreAuditAction | (string & {});

const coreActionValues = Object.values(auditActions) as [CoreAuditAction, ...CoreAuditAction[]];
const coreActionSet: ReadonlySet<string> = new Set<string>(coreActionValues);

const coreActionSchema = z.enum(coreActionValues);

const moduleActionSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+){1,4}$/i,
    "Use a dotted module action such as modules.installed",
  )
  .refine((value) => !coreActionSet.has(value), {
    message: "Use the typed core audit action constant",
  });

export const auditActionSchema = z.union([coreActionSchema, moduleActionSchema]);

const auditActorSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export const auditEntrySchema = z.object({
  action: auditActionSchema,
  actor: auditActorSchema.optional(),
  // Legacy top-level identity fields remain supported for M1 call sites.
  userId: z.string().optional(),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  targetType: z.string().max(120).optional(),
  targetId: z.string().max(200).optional(),
  module: z.string().min(1).max(120).optional(),
  workspaceId: z.string().max(200).optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.date().optional(),
  client: z.custom<AuditClient>().optional(),
  strict: z.boolean().optional(),
});

export type AuditEntry = {
  action: AuditAction;
  actor?: AuditActor;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  targetType?: string;
  targetId?: string;
  module?: string;
  workspaceId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt?: Date;
  client?: AuditClient;
  strict?: boolean;
};

const sensitiveKeyPattern =
  /pass(word|phrase)?|token|secret|credential|authorization|api[_-]?key|private[_-]?key|backup[_-]?codes?|totp|otp|cookie|session[_-]?id/i;

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPattern.test(key);
}

/**
 * Recursively removes credential-like keys from structured audit values.
 * Redaction is key-based so nested snapshots stay useful without leaking
 * password hashes, reset tokens, or TOTP secrets.
 */
export function sanitizeAuditValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => {
      const sanitized = sanitizeAuditValue(item, seen);
      return sanitized === undefined ? null : sanitized;
    });
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeAuditValue(nested, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const sanitized = sanitizeAuditValue(value);
  if (sanitized === undefined) return undefined;
  return sanitized as Prisma.InputJsonValue;
}

/**
 * Append-only audit writes. Fail-open is the default so M1 sign-in hooks can
 * never break authentication; `strict: true` makes validation/write errors
 * propagate (and roll back a caller's transaction when `client` is supplied).
 */
async function log(entry: AuditEntry): Promise<void> {
  let action = "unknown";
  try {
    const data = auditEntrySchema.parse(entry);
    action = data.action;
    const db: AuditClient = data.client ?? prisma;

    await db.auditLog.create({
      data: {
        action: data.action,
        userId: data.actor?.userId ?? data.userId,
        email: data.actor?.email ?? data.email,
        ip: data.actor?.ip ?? data.ip,
        userAgent: data.actor?.userAgent ?? data.userAgent,
        targetType: data.targetType,
        targetId: data.targetId,
        module: data.module ?? "core",
        workspaceId: data.workspaceId ?? "",
        before: toJson(data.before),
        after: toJson(data.after),
        metadata: toJson(data.metadata),
        createdAt: data.createdAt,
      },
    });
  } catch (error: unknown) {
    logger.error("Audit write failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    if (entry.strict) throw error;
  }
}

export const audit = { log };

// Kept as a type-only reference so the audit seam is explicit about its store.
export type AuditStore = Pick<PrismaClient["auditLog"], "create">;
