"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { audit, type AuditActor } from "@/core/audit";
import { PermissionDeniedError, requirePermission } from "@/core/auth/dal";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";
import type { FaqQuestion } from "@prisma/client";

/** Same shape as the core server actions; message values are module message keys. */
export type ActionState = { error?: string; ok?: boolean; message?: string };

const MODULE_ID = "faq";
const WORKSPACE_ID = "";
const DENIED = "modules.faq.errors.denied";
const INVALID_INPUT = "modules.faq.errors.invalidInput";

const questionText = z
  .string()
  .trim()
  .min(1, "modules.faq.errors.questionRequired")
  .max(300, "modules.faq.errors.questionTooLong");

const answerText = z
  .string()
  .trim()
  .min(1, "modules.faq.errors.answerRequired")
  .max(5000, "modules.faq.errors.answerTooLong");

const idField = z
  .string()
  .trim()
  .min(1, "modules.faq.errors.idInvalid")
  .max(64, "modules.faq.errors.idInvalid")
  .regex(/^[A-Za-z0-9_-]+$/, "modules.faq.errors.idInvalid");

const positionField = z
  .string()
  .regex(/^\d{1,5}$/, "modules.faq.errors.positionInvalid")
  .transform(Number)
  .refine((value) => value <= 10000, "modules.faq.errors.positionInvalid")
  .default(0);

const publishedField = z
  .string()
  .refine((value) => value === "true" || value === "false", "modules.faq.errors.publishedInvalid")
  .transform((value) => value === "true");

const createSchema = z.object({
  question: questionText,
  answer: answerText,
  position: positionField,
});

const updateSchema = createSchema.extend({ id: idField });

const publishSchema = z.object({ id: idField, published: publishedField });

const deleteSchema = z.object({ id: idField });

class QuestionNotFoundError extends Error {}

type GuardedSession = Awaited<ReturnType<typeof requirePermission>>["session"];

function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function guard(): Promise<{ session: GuardedSession } | { error: string }> {
  try {
    const { session } = await requirePermission("faq.manage");
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

function optionalField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parse<T extends z.ZodType>(schema: T, input: unknown): ParseResult<z.output<T>> {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? INVALID_INPUT };
  }
  return { ok: true, data: result.data };
}

/** Audit snapshots contain only scalar, non-secret question fields. */
function snapshot(row: FaqQuestion) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    question: row.question,
    answer: row.answer,
    published: row.published,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function revalidateFaqViews(): void {
  revalidatePath("/modules/run/faq");
  revalidatePath("/modules/run/faq/manage");
  revalidatePath("/modules");
}

function fail(message: string, error: unknown, fallback: string): ActionState {
  if (isRedirectError(error)) throw error;
  if (error instanceof QuestionNotFoundError) return { error: "modules.faq.errors.notFound" };
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
  return { error: fallback };
}

export async function createQuestionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const input = parse(createSchema, {
    question: field(formData, "question"),
    answer: field(formData, "answer"),
    position: optionalField(formData, "position"),
  });
  if (!input.ok) return { error: input.error };

  const actor = await actorFrom(guarded.session);
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.faqQuestion.create({
        data: {
          workspaceId: WORKSPACE_ID,
          question: input.data.question,
          answer: input.data.answer,
          position: input.data.position,
        },
      });
      await audit.log({
        action: "faq.question.created",
        actor,
        module: MODULE_ID,
        workspaceId: WORKSPACE_ID,
        targetType: "FaqQuestion",
        targetId: row.id,
        before: {},
        after: snapshot(row),
        client: tx,
        strict: true,
      });
    });
    revalidateFaqViews();
    return { ok: true, message: "modules.faq.status.created" };
  } catch (error: unknown) {
    return fail("FAQ question create failed", error, "modules.faq.errors.saveFailed");
  }
}

export async function updateQuestionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const input = parse(updateSchema, {
    id: field(formData, "id"),
    question: field(formData, "question"),
    answer: field(formData, "answer"),
    position: optionalField(formData, "position"),
  });
  if (!input.ok) return { error: input.error };

  const actor = await actorFrom(guarded.session);
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.faqQuestion.findFirst({
        where: { id: input.data.id, workspaceId: WORKSPACE_ID },
      });
      if (!before) throw new QuestionNotFoundError();

      const updated = await tx.faqQuestion.updateMany({
        where: { id: before.id, workspaceId: WORKSPACE_ID },
        data: {
          question: input.data.question,
          answer: input.data.answer,
          position: input.data.position,
        },
      });
      if (updated.count === 0) throw new QuestionNotFoundError();

      const after = await tx.faqQuestion.findFirst({
        where: { id: before.id, workspaceId: WORKSPACE_ID },
      });
      if (!after) throw new QuestionNotFoundError();

      await audit.log({
        action: "faq.question.updated",
        actor,
        module: MODULE_ID,
        workspaceId: WORKSPACE_ID,
        targetType: "FaqQuestion",
        targetId: before.id,
        before: snapshot(before),
        after: snapshot(after),
        client: tx,
        strict: true,
      });
    });
    revalidateFaqViews();
    return { ok: true, message: "modules.faq.status.updated" };
  } catch (error: unknown) {
    return fail("FAQ question update failed", error, "modules.faq.errors.saveFailed");
  }
}

export async function publishQuestionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const input = parse(publishSchema, {
    id: field(formData, "id"),
    published: field(formData, "published"),
  });
  if (!input.ok) return { error: input.error };

  const actor = await actorFrom(guarded.session);
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.faqQuestion.findFirst({
        where: { id: input.data.id, workspaceId: WORKSPACE_ID },
      });
      if (!before) throw new QuestionNotFoundError();

      const updated = await tx.faqQuestion.updateMany({
        where: { id: before.id, workspaceId: WORKSPACE_ID },
        data: { published: input.data.published },
      });
      if (updated.count === 0) throw new QuestionNotFoundError();

      const after = await tx.faqQuestion.findFirst({
        where: { id: before.id, workspaceId: WORKSPACE_ID },
      });
      if (!after) throw new QuestionNotFoundError();

      await audit.log({
        action: "faq.question.published",
        actor,
        module: MODULE_ID,
        workspaceId: WORKSPACE_ID,
        targetType: "FaqQuestion",
        targetId: before.id,
        before: snapshot(before),
        after: snapshot(after),
        metadata: { published: input.data.published },
        client: tx,
        strict: true,
      });
    });
    revalidateFaqViews();
    return {
      ok: true,
      message: input.data.published
        ? "modules.faq.status.published"
        : "modules.faq.status.unpublished",
    };
  } catch (error: unknown) {
    return fail("FAQ question publish update failed", error, "modules.faq.errors.publishFailed");
  }
}

export async function deleteQuestionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guarded = await guard();
  if ("error" in guarded) return guarded;

  const input = parse(deleteSchema, { id: field(formData, "id") });
  if (!input.ok) return { error: input.error };

  const actor = await actorFrom(guarded.session);
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.faqQuestion.findFirst({
        where: { id: input.data.id, workspaceId: WORKSPACE_ID },
      });
      if (!before) throw new QuestionNotFoundError();

      const removed = await tx.faqQuestion.deleteMany({
        where: { id: before.id, workspaceId: WORKSPACE_ID },
      });
      if (removed.count === 0) throw new QuestionNotFoundError();

      await audit.log({
        action: "faq.question.deleted",
        actor,
        module: MODULE_ID,
        workspaceId: WORKSPACE_ID,
        targetType: "FaqQuestion",
        targetId: before.id,
        before: snapshot(before),
        after: {},
        client: tx,
        strict: true,
      });
    });
    revalidateFaqViews();
    return { ok: true, message: "modules.faq.status.deleted" };
  } catch (error: unknown) {
    return fail("FAQ question delete failed", error, "modules.faq.errors.deleteFailed");
  }
}
