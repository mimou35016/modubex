"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { acceptInvitationAction, type ActionState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { acceptInvitationSchema } from "@/core/auth/schemas";
import { readActionState } from "./form-utils";

export function AcceptInvitationForm({ token }: { token?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(acceptInvitationAction, {} as ActionState);
  const info = readActionState(state);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const hasToken = Boolean(token && token.trim());

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    setLocalError(null);
    if (!hasToken) {
      event.preventDefault();
      return;
    }
    const parsed = acceptInvitationSchema.safeParse({ token, name, password });
    if (!parsed.success) {
      event.preventDefault();
      const weak = parsed.error.issues.some((issue) => issue.path.includes("password"));
      setLocalError(t(`errors.${weak ? "weakPassword" : "generic"}`));
    }
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("invitation.acceptTitle")}</h1>
        <p className="text-sm leading-6 text-muted">{t("invitation.subtitle")}</p>
      </div>

      {!hasToken ? (
        <Alert tone="error" className="mt-5">
          {t("invitation.invalidToken")}
        </Alert>
      ) : null}
      {localError ? (
        <Alert tone="error" className="mt-5">
          {localError}
        </Alert>
      ) : null}
      {info.status === "error" ? (
        <Alert tone="error" className="mt-5">
          {info.message && /invitation|expired/i.test(info.message)
            ? t("invitation.invalidToken")
            : info.message && /password/i.test(info.message)
              ? t("errors.weakPassword")
              : t("errors.generic")}
        </Alert>
      ) : null}
      {info.status === "success" ? (
        <Alert tone="success" className="mt-5">
          {t("invitation.success")}
        </Alert>
      ) : null}

      {hasToken ? (
        <form action={formAction} onSubmit={onSubmit} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label htmlFor="accept-name">{t("common.name")}</Label>
            <Input
              id="accept-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accept-password">{t("common.password")}</Label>
            <PasswordInput
              id="accept-password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {t("invitation.acceptSubmit")}
          </Button>
        </form>
      ) : null}

      <div className="mt-6 text-xs">
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          {t("common.backToSignIn")}
        </Link>
      </div>
    </>
  );
}
