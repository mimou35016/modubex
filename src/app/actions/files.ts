"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { AuditActor } from "@/core/audit";
import {
  hasPermission,
  PermissionDeniedError,
  requirePermission,
  requireSession,
} from "@/core/auth/dal";
import { canManageOwnAvatar } from "@/core/files/authorization";
import { deleteFile, getCurrentAvatar, getSiteLogo, uploadFile } from "@/core/files/service";
import { logger } from "@/core/logging/logger";

export type ActionState = { error?: string; ok?: boolean; message?: string };

const DENIED = "You do not have permission to perform this action.";
const INVALID_INPUT = "Invalid file input.";
const UPLOAD_FAILED = "Unable to upload the image.";
const REMOVE_FAILED = "Unable to remove the image.";

type Session = Awaited<ReturnType<typeof requireSession>>;
type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function actorFrom(session: Session | GuardedSession): Promise<AuditActor> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return {
    userId: session.user.id,
    email: session.user.email,
    ip: forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

async function guardAvatar(): Promise<{ session: Session } | { error: string }> {
  try {
    const session = await requireSession();
    if (!(await hasPermission("app.access"))) return { error: DENIED };
    return { session };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof PermissionDeniedError) return { error: DENIED };
    throw error;
  }
}

async function guardSiteLogo(): Promise<{ session: GuardedSession } | { error: string }> {
  try {
    const { session } = await requirePermission("settings.update");
    return { session };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    if (error instanceof PermissionDeniedError) return { error: DENIED };
    throw error;
  }
}

function uploadedFile(formData: FormData, field: string): File | null {
  const value = formData.get(field);
  if (typeof File === "undefined" || !(value instanceof File)) return null;
  return value.size > 0 ? value : null;
}

function failure(error: unknown, fallback: string): ActionState {
  if (isRedirectError(error)) throw error;
  if (error instanceof PermissionDeniedError) return { error: DENIED };
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? INVALID_INPUT };
  }
  logger.warn("File action failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return { error: error instanceof Error && error.message ? error.message : fallback };
}

function revalidateFileViews(): void {
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/settings/site");
}

/** Site logos render in the root shell, auth layout, and generated icon route. */
function revalidateSiteLogoViews(): void {
  revalidateFileViews();
  revalidatePath("/", "layout");
}

export async function uploadAvatarAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guardAvatar();
  if ("error" in guarded) return guarded;

  const ownerId = guarded.session.user.id;
  if (!canManageOwnAvatar(ownerId, ownerId)) return { error: DENIED };

  const file = uploadedFile(formData, "avatar");
  if (!file) return { error: "Choose an avatar image." };

  try {
    await uploadFile({ file, purpose: "avatar", ownerId, actor: await actorFrom(guarded.session) });
    revalidateFileViews();
    return { ok: true, message: "Avatar updated." };
  } catch (error: unknown) {
    return failure(error, UPLOAD_FAILED);
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars -- useActionState requires the (state, formData) signature; removals are derived from the session and ignore both. */
export async function removeAvatarAction(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const guarded = await guardAvatar();
  if ("error" in guarded) return guarded;

  const userId = guarded.session.user.id;
  try {
    const current = await getCurrentAvatar(userId);
    if (!current) return { error: "No avatar to remove." };
    if (!canManageOwnAvatar(userId, current.ownerId)) return { error: DENIED };

    await deleteFile({ assetId: current.id, actor: await actorFrom(guarded.session) });
    revalidateFileViews();
    return { ok: true, message: "Avatar removed." };
  } catch (error: unknown) {
    return failure(error, REMOVE_FAILED);
  }
}

export async function uploadSiteLogoAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guardSiteLogo();
  if ("error" in guarded) return guarded;

  const file = uploadedFile(formData, "logo");
  if (!file) return { error: "Choose a logo image." };

  try {
    await uploadFile({
      file,
      purpose: "site-logo",
      actor: await actorFrom(guarded.session),
    });
    revalidateSiteLogoViews();
    return { ok: true, message: "Site logo updated." };
  } catch (error: unknown) {
    return failure(error, UPLOAD_FAILED);
  }
}

export async function removeSiteLogoAction(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const guarded = await guardSiteLogo();
  if ("error" in guarded) return guarded;

  try {
    const current = await getSiteLogo();
    if (!current) return { error: "No site logo to remove." };

    await deleteFile({ assetId: current.id, actor: await actorFrom(guarded.session) });
    revalidateSiteLogoViews();
    return { ok: true, message: "Site logo removed." };
  } catch (error: unknown) {
    return failure(error, REMOVE_FAILED);
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
