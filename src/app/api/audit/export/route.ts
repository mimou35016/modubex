import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DENIED = "You do not have permission to perform this action.";
const MAX_EXPORT_ROWS = 10_000;

/** Matches the dashboard audit filter contract in `_components/list-params.ts`. */
const exportFilterSchema = z.object({
  action: z.string().trim().max(191).optional(),
  actor: z.string().trim().max(191).optional(),
  module: z.string().trim().max(191).optional(),
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid date.")
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid date.")
    .optional(),
});

type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];

type Authorization = { session: GuardedSession } | { errorResponse: Response };

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function authorize(): Promise<Authorization> {
  try {
    const { session } = await requirePermission("audit.export");
    return { session };
  } catch (error: unknown) {
    if (isRedirectError(error)) {
      return {
        errorResponse: Response.json({ error: "Authentication required." }, { status: 401 }),
      };
    }
    if (error instanceof PermissionDeniedError) {
      return { errorResponse: Response.json({ error: DENIED }, { status: 403 }) };
    }
    logger.error("Audit export authorization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      errorResponse: Response.json({ error: "Unable to authorize this request." }, { status: 500 }),
    };
  }
}

function param(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value === "" ? undefined : value;
}

function actorFrom(request: Request, session: GuardedSession): AuditActor {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    userId: session.user.id,
    email: session.user.email,
    ip: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

/**
 * CSV values are always quoted when they contain delimiters/newlines, and any
 * value beginning with a spreadsheet formula character is neutralized.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = String(value);
    }
  }

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines = rows.map((row) => row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function GET(request: Request): Promise<Response> {
  const authorization = await authorize();
  if ("errorResponse" in authorization) return authorization.errorResponse;

  const params = new URL(request.url).searchParams;
  const parsed = exportFilterSchema.safeParse({
    action: param(params, "action"),
    actor: param(params, "actor") ?? param(params, "userId"),
    module: param(params, "module"),
    from: param(params, "from"),
    to: param(params, "to"),
  });
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid filter." },
      { status: 400 },
    );
  }

  const from = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00.000Z`) : undefined;
  // Inclusive end-of-day when a YYYY-MM-DD `to` value is supplied.
  const to = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999Z`) : undefined;

  try {
    const where: Prisma.AuditLogWhereInput = {
      ...(parsed.data.action ? { action: parsed.data.action } : {}),
      ...(parsed.data.actor
        ? {
            OR: [
              { userId: { contains: parsed.data.actor, mode: "insensitive" } },
              { email: { contains: parsed.data.actor, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(parsed.data.module ? { module: parsed.data.module } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
      select: {
        id: true,
        createdAt: true,
        action: true,
        userId: true,
        email: true,
        module: true,
        targetType: true,
        targetId: true,
        before: true,
        after: true,
        metadata: true,
      },
    });

    const filters = {
      action: parsed.data.action ?? null,
      actor: parsed.data.actor ?? null,
      module: parsed.data.module ?? null,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };

    await audit.log({
      action: auditActions.auditExported,
      actor: actorFrom(request, authorization.session),
      strict: true,
      targetType: "audit_export",
      metadata: { filters, rowCount: rows.length },
    });

    const header = [
      "createdAt",
      "action",
      "userId",
      "email",
      "module",
      "targetType",
      "targetId",
      "before",
      "after",
      "metadata",
    ];
    const csv = toCsv([
      header,
      ...rows.map((row) => [
        row.createdAt,
        row.action,
        row.userId,
        row.email,
        row.module,
        row.targetType,
        row.targetId,
        row.before,
        row.after,
        row.metadata,
      ]),
    ]);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-log.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    logger.error("Audit CSV export failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Unable to export the audit log." }, { status: 500 });
  }
}
