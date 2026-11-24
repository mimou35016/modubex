"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signInSchema } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { authErrorCode, getAuthError, needsTwoFactor } from "./form-utils";

type OAuthProvider = { id: "github" | "google"; label: string };

export function SignInForm({ providers }: { providers: OAuthProvider[] }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t(`errors.${authErrorCode("invalid credentials")}`));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: "/",
      });
      if (getAuthError(result)) {
        setError(t(`errors.${authErrorCode(getAuthError(result))}`));
        return;
      }
      if (needsTwoFactor(result)) {
        router.push("/two-factor");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  async function onSocial(id: "github" | "google") {
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.social({ provider: id, callbackURL: "/" });
      if (getAuthError(result)) {
        setError(t("signIn.oauthError"));
      }
    } catch {
      setError(t("signIn.oauthError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("signIn.title")}</h1>
        <p className="text-sm leading-6 text-muted">{t("signIn.subtitle")}</p>
      </div>

      {error ? (
        <Alert tone="error" className="mt-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sign-in-email">{t("common.email")}</Label>
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-in-password">{t("common.password")}</Label>
          <PasswordInput
            id="sign-in-password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {t("signIn.submit")}
        </Button>
      </form>

      {providers.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>{t("signIn.orDivider")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-4 grid gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => onSocial(provider.id)}
              >
                {provider.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-between gap-2 text-xs">
        <Link href="/sign-up" className="font-medium text-accent hover:underline">
          {t("signIn.noAccount")}
        </Link>
        <Link href="/forgot-password" className="font-medium text-accent hover:underline">
          {t("signIn.forgot")}
        </Link>
      </div>
    </>
  );
}
