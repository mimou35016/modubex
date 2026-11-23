"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildPasswordSchema, type PasswordRules } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { authErrorCode, getAuthError, passwordRuleHints } from "./form-utils";

export function SignUpForm({ rules }: { rules: PasswordRules }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    name: z.string().trim().min(1),
    email: z.email(),
    password: buildPasswordSchema(rules),
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

    const parsed = schema.safeParse({ name, email, password });
    if (!parsed.success) {
      const weak = parsed.error.issues.some((issue) => issue.path.includes("password"));
      setError(t(`errors.${weak ? "weakPassword" : "generic"}`));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signUp.email({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: "/",
      });
      if (getAuthError(result)) {
        setError(t(`errors.${authErrorCode(getAuthError(result))}`));
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

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("signUp.title")}</h1>
        <p className="text-sm leading-6 text-muted">{t("signUp.subtitle")}</p>
      </div>

      {error ? (
        <Alert tone="error" className="mt-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sign-up-name">{t("common.name")}</Label>
          <Input
            id="sign-up-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-up-email">{t("common.email")}</Label>
          <Input
            id="sign-up-email"
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
          <Label htmlFor="sign-up-password">{t("common.password")}</Label>
          <Input
            id="sign-up-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted">{t("signUp.passwordHelp")}</p>
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
          {t("signUp.submit")}
        </Button>
      </form>

      <div className="mt-6 text-xs">
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          {t("signUp.haveAccount")}
        </Link>
      </div>
    </>
  );
}
