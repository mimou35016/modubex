"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { runAuditPurgeAction } from "@/app/actions/audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionResult, type ActionState } from "../action-result";

export function PurgeForm({ retentionDays }: { retentionDays: number }) {
  const t = useTranslations("audit");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    runAuditPurgeAction,
    {},
  );
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const forever = retentionDays <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("purgeTitle")}</CardTitle>
        <p className="text-xs leading-5 text-muted">{t("purgeHint")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {forever ? (
          <p className="text-xs leading-5 text-muted">{t("purgeDisabledHint")}</p>
        ) : (
          <form action={formAction} className="space-y-3">
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              {t("purgeConfirmLabel")}
            </label>
            <Button type="submit" variant="outline" size="sm" disabled={pending || !confirmed}>
              {t("purgeSubmit")}
            </Button>
          </form>
        )}
        <ActionResult state={state} successMessage={t("purgeSuccess")} />
      </CardContent>
    </Card>
  );
}
