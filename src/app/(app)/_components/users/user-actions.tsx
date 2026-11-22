"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { revokeSessionAction, setUserActiveAction } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { ActionResult, type ActionState } from "../action-result";

export function UserActiveForm({ userId, active }: { userId: string; active: boolean }) {
  const t = useTranslations("users.detail");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setUserActiveAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-muted">
        {active ? t("deactivateHint") : t("reactivateHint")}
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant={active ? "outline" : "default"} disabled={pending}>
          {active ? t("deactivate") : t("reactivate")}
        </Button>
      </form>
      <ActionResult state={state} successMessage={t("saved")} />
    </div>
  );
}

export function RevokeSessionForm({ userId, sessionId }: { userId: string; sessionId: string }) {
  const t = useTranslations("users.detail");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    revokeSessionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("revokeSession")}
      </Button>
      <ActionResult state={state} successMessage={t("saved")} />
    </form>
  );
}
