"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileNameAction, type ActionState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";

export function ProfileNameForm({ name }: { name: string }) {
  const t = useTranslations("profile");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfileNameAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">{t("nameLabel")}</Label>
        <Input
          id="profile-name"
          name="name"
          defaultValue={name}
          maxLength={120}
          autoComplete="name"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("nameSubmit")}
      </Button>
      <ActionResult state={state} successMessage={t("nameSaved")} />
    </form>
  );
}
