"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, type ActionState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";

export function PasswordForm() {
  const t = useTranslations("profile");
  const tAuth = useTranslations("auth");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4" autoComplete="off">
      <input type="hidden" name="username" autoComplete="username" value="" />
      <div className="space-y-1.5">
        <Label htmlFor="profile-current-password">{tAuth("common.currentPassword")}</Label>
        <PasswordInput
          id="profile-current-password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-new-password">{tAuth("common.newPassword")}</Label>
        <PasswordInput
          id="profile-new-password"
          name="newPassword"
          autoComplete="new-password"
          required
        />
        <p className="text-xs leading-5 text-muted">{tAuth("reset.passwordHelp")}</p>
      </div>
      <Button type="submit" disabled={pending}>
        {t("passwordSubmit")}
      </Button>
      <ActionResult state={state} successMessage={t("passwordSaved")} />
    </form>
  );
}
