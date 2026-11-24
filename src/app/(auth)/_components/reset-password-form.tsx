"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { buildPasswordSchema, type PasswordRules } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { authErrorCode, getAuthError, passwordRuleHints } from "./form-utils";

export function ResetPasswordForm({ token, rules }: { token?: string; rules: PasswordRules }) {
  const t = useTranslations("auth");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    token: z.string().min(1),
    newPassword: buildPasswordSchema(rules),
  });

  const hints = passwordRuleHints(rules, (key) => {
    if (key === "signUp.rules.minLength") {
      return t("signUp.rules.minLength", { min: rules.minLength });
    }
    if (key === "signUp.rules.maxLength") {
      return t("signUp.rules.maxLength", { max: rules.maxLength });
    }
    return t(key);
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(t("reset.missingToken"));
      return;
    }

    const parsed = schema.safeParse({ newPassword, token });
    if (!parsed.success) {
      const weak = parsed.error.issues.some((issue) => issue.path.includes("newPassword"));
      setError(t(`errors.${weak ? "weakPassword" : "generic"}`));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: parsed.data.newPassword,
        token,
      });
      if (getAuthError(result)) {
        setError(t(`errors.${authErrorCode(getAuthError(result))}`));
        return;
      }
      setDone(true);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <Alert tone="error">{t("reset.missingToken")}</Alert>;
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("reset.title")}</h1>
      </div>

      {error ? (
        <Alert tone="error" className="mt-5">
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" className="mt-5">
          {t("reset.success")}
        </Alert>
      ) : null}

      {!done ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input type="hidden" name="username" autoComplete="username" value="" />
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">{t("common.newPassword")}</Label>
            <PasswordInput
              id="reset-password"
              name="newPassword"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-muted">{t("reset.passwordHelp")}</p>
            {hints.length > 0 ? (
              <ul className="space-y-0.5 ps-4 text-xs text-muted">
                {hints.map((hint) => (
                  <li key={hint} className="list-disc">
                    {hint}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {t("reset.submit")}
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
