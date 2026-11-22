"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetRequestSchema } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { authErrorCode, getAuthError } from "./form-utils";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(t("errors.generic"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: "/reset-password",
      });
      if (getAuthError(result)) {
        setError(t(`errors.${authErrorCode(getAuthError(result))}`));
        return;
      }
      setSent(true);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("forgot.title")}</h1>
        <p className="text-sm leading-6 text-muted">{t("forgot.subtitle")}</p>
      </div>

      {error ? <Alert tone="error" className="mt-5">{error}</Alert> : null}
      {sent ? <Alert tone="success" className="mt-5">{t("forgot.success")}</Alert> : null}

      {!sent ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">{t("common.email")}</Label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {t("forgot.submit")}
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
