"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { revokeOwnSessionAction, type ActionState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { ActionResult } from "../action-result";

export function SessionRevokeForm({ sessionId }: { sessionId: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    revokeOwnSessionAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("revokeSession")}
      </Button>
      <ActionResult state={state} successMessage={t("sessionRevoked")} />
    </form>
  );
}
