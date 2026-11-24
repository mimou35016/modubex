"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createQuestionAction,
  deleteQuestionAction,
  publishQuestionAction,
  updateQuestionAction,
  type ActionState,
} from "../actions";
import type { FaqQuestionView } from "../types";

const textareaClass =
  "w-full rounded-md border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50";

/** Module action results carry message keys; translate them before display. */
function Feedback({ state }: { state: ActionState }) {
  const t = useTranslations();
  const value = state.error ?? (state.ok ? state.message : undefined);
  if (!value) return null;

  return <Alert tone={state.error ? "error" : "success"}>{t.has(value) ? t(value) : value}</Alert>;
}

function QuestionFields({
  idPrefix,
  question,
  answer,
  position,
}: {
  idPrefix: string;
  question?: string;
  answer?: string;
  position?: number;
}) {
  const t = useTranslations("modules.faq.manage");

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-question`}>{t("fields.question")}</Label>
        <Input
          id={`${idPrefix}-question`}
          name="question"
          dir="auto"
          required
          maxLength={300}
          defaultValue={question ?? ""}
          placeholder={t("placeholders.question")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-answer`}>{t("fields.answer")}</Label>
        <textarea
          id={`${idPrefix}-answer`}
          name="answer"
          dir="auto"
          rows={4}
          required
          maxLength={5000}
          defaultValue={answer ?? ""}
          placeholder={t("placeholders.answer")}
          className={textareaClass}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-position`}>{t("fields.position")}</Label>
        <Input
          id={`${idPrefix}-position`}
          name="position"
          type="number"
          min={0}
          max={10000}
          step={1}
          dir="ltr"
          defaultValue={position ?? 0}
        />
        <p className="text-xs leading-5 text-muted">{t("hints.position")}</p>
      </div>
    </>
  );
}

export function CreateQuestionForm() {
  const t = useTranslations("modules.faq.manage");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createQuestionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("createTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <form ref={formRef} action={formAction} className="space-y-4">
          <QuestionFields idPrefix="faq-create" />
          <Button type="submit" disabled={pending}>
            {t("buttons.create")}
          </Button>
        </form>
        <Feedback state={state} />
      </CardContent>
    </Card>
  );
}

export function QuestionEditor({ question }: { question: FaqQuestionView }) {
  const t = useTranslations("modules.faq.manage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateQuestionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <details className="group border-t pt-3">
      <summary className="cursor-pointer text-xs font-medium text-accent">{t("edit")}</summary>
      <div className="mt-4 space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={question.id} />
          <QuestionFields
            idPrefix={`faq-edit-${question.id}`}
            question={question.question}
            answer={question.answer}
            position={question.position}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {t("buttons.save")}
          </Button>
        </form>
        <Feedback state={state} />
      </div>
    </details>
  );
}

export function PublishQuestionForm({ id, published }: { id: string; published: boolean }) {
  const t = useTranslations("modules.faq.manage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    publishQuestionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="published" value={published ? "false" : "true"} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {published ? t("unpublish") : t("publish")}
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

export function DeleteQuestionForm({ id, question }: { id: string; question: string }) {
  const t = useTranslations("modules.faq.manage");
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteQuestionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="size-4 shrink-0"
          />
          {t("deleteConfirm")}
        </label>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          aria-label={`${t("delete")}: ${question}`}
          disabled={pending || !confirmed}
        >
          {t("delete")}
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
