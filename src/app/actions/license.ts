"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { audit, auditActions, type AuditActor } from "@/core/audit";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { entitlementsForPlan } from "@/core/entitlements/plans";
import { licenseUpdateSchema } from "@/core/entitlements/schema";
import { invalidateEntitlements } from "@/core/entitlements/service";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";
const UPDATE_FAILED = "Unable to update the license.";
const WORKSPACE_ID = "";
/**
 * Stable id used for the first write. An existing row is located by workspace
 * first, so a pre-seeded row is updated in place instead of being duplicated.
 */
const SINGLE_LICENSE_ID = "workspace-license";

type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function guard(): Promise<{ session: GuardedSession } | { error: string }> {
  try {
    const { session } = await requirePermission("license.manage");
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

function firstIssue(error: { issues: Array<{ message?: string }> }): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function logFailure(error: unknown): void {
  logger.warn("License update failed", {
    error: error instanceof Error ? error.message : String(error),
  });
}

type LicenseSnapshot = { id: string; plan: string; licenseKey: string | null };
type LicenseWrite = {
  plan: string;
  entitlements: string[];
  licenseKey: string | null;
  validUntil: Date | null;
  updatedById: string;
};

/** Structural seam for the License delegate until Prisma client is regenerated. */
type LicenseTxClient = {
  license: {
    findFirst(args: {
      where: { workspaceId: string };
      select: { id: true; plan: true; licenseKey: true };
    }): Promise<LicenseSnapshot | null>;
    upsert(args: {
      where: { id: string };
      create: LicenseWrite & { id: string; workspaceId: string };
      update: LicenseWrite;
    }): Promise<unknown>;
  };
};

export async function updateLicenseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const parsed = licenseUpdateSchema.safeParse({
    plan: field(formData, "plan"),
    licenseKey: field(formData, "licenseKey"),
    validUntil: field(formData, "validUntil"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { plan, licenseKey, validUntil } = parsed.data;
  const actor = await actorFrom(guarded.session);

  try {
    await prisma.$transaction(async (tx) => {
      const client = tx as unknown as LicenseTxClient;
      const previous = await client.license.findFirst({
        where: { workspaceId: WORKSPACE_ID },
        select: { id: true, plan: true, licenseKey: true },
      });
      const licenseId = previous?.id ?? SINGLE_LICENSE_ID;
      const write: LicenseWrite = {
        plan,
        entitlements: [...entitlementsForPlan(plan)],
        licenseKey,
        validUntil,
        updatedById: actor.userId,
      };

      await client.license.upsert({
        where: { id: licenseId },
        create: { id: licenseId, workspaceId: WORKSPACE_ID, ...write },
        update: write,
      });

      if (!previous || previous.plan !== plan) {
        await audit.log({
          action: auditActions.licensePlanChanged,
          actor,
          targetType: "license",
          targetId: licenseId,
          module: "core",
          workspaceId: WORKSPACE_ID,
          before: { plan: previous?.plan ?? null },
          after: { plan },
          client: tx,
          strict: true,
        });
      }

      const previousKeySet = Boolean(previous?.licenseKey);
      const nextKeySet = licenseKey !== null;
      if (previousKeySet !== nextKeySet) {
        // Never write the raw key into the append-only log.
        await audit.log({
          action: auditActions.licenseKeyUpdated,
          actor,
          targetType: "license",
          targetId: licenseId,
          module: "core",
          workspaceId: WORKSPACE_ID,
          before: { licenseKeySet: previousKeySet },
          after: { licenseKeySet: nextKeySet },
          client: tx,
          strict: true,
        });
      }
    });
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    logFailure(error);
    return { error: UPDATE_FAILED };
  }

  try {
    await invalidateEntitlements();
    revalidatePath("/license");
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    logFailure(error);
  }

  return { ok: true, message: "License updated." };
}
