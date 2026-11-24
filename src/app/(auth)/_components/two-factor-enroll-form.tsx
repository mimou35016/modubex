"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { passwordSchema, twoFactorSchema } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { authErrorCode, getAuthError, readTotpEnrollment, type TotpEnrollment } from "./form-utils";

export function TwoFactorEnrollForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [disablePending, setDisablePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!passwordSchema.safeParse(password).success) {
      setError(t("errors.weakPassword"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.enable({ password, method: "totp" });
      const message = getAuthError(result);
      if (message) {
        setError(t(`errors.${authErrorCode(message)}`));
        return;
      }
      const next = readTotpEnrollment(result);
      if (!next) {
        setError(t("errors.generic"));
        return;
      }
      setEnrollment(next);
      setDisabled(false);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = twoFactorSchema.safeParse({ code });
    if (!parsed.success || !parsed.data.code) {
      setError(t("twoFactor.invalidCode"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: parsed.data.code });
      const message = getAuthError(result);
      if (message) {
        setError(
          /invalid|incorrect|wrong|expired|code|otp|token/i.test(message)
            ? t("twoFactor.invalidCode")
            : t(`errors.${authErrorCode(message)}`),
        );
        return;
      }
      setEnabled(true);
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  async function onDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!passwordSchema.safeParse(disablePassword).success) {
      setError(t("errors.weakPassword"));
      return;
    }

    setDisablePending(true);
    try {
      const result = await authClient.twoFactor.disable({ password: disablePassword });
      const message = getAuthError(result);
      if (message) {
        setError(t(`errors.${authErrorCode(message)}`));
        return;
      }
      setEnrollment(null);
      setEnabled(false);
      setDisabled(true);
      setDisablePassword("");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setDisablePending(false);
    }
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("twoFactor.enrollTitle")}</h1>
        <p className="text-sm leading-6 text-muted">{t("twoFactor.enrollSubtitle")}</p>
      </div>

      {error ? (
        <Alert tone="error" className="mt-5">
          {error}
        </Alert>
      ) : null}
      {enabled ? (
        <Alert tone="success" className="mt-5">
          {t("twoFactor.success")}
        </Alert>
      ) : null}
      {disabled ? (
        <Alert tone="success" className="mt-5">
          {t("twoFactor.disabled")}
        </Alert>
      ) : null}

      {!enrollment ? (
        <form onSubmit={onEnable} className="mt-6 space-y-4">
          <input type="hidden" name="username" autoComplete="username" value="" />
          <div className="space-y-1.5">
            <Label htmlFor="enroll-password">{t("common.currentPassword")}</Label>
            <PasswordInput
              id="enroll-password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {t("twoFactor.enable")}
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label>{t("twoFactor.secretLabel")}</Label>
            <p
              className="rounded-md border bg-background p-3 font-mono text-xs break-all"
              dir="ltr"
            >
              {enrollment.totpURI}
            </p>
          </div>
          {enrollment.backupCodes.length > 0 ? (
            <div className="space-y-1.5">
              <Label>{t("twoFactor.backupCodes")}</Label>
              <ul className="grid grid-cols-2 gap-1 rounded-md border bg-background p-3 font-mono text-xs">
                {enrollment.backupCodes.map((backupCode) => (
                  <li key={backupCode} dir="ltr">
                    {backupCode}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{t("twoFactor.saveCodes")}</p>
            </div>
          ) : null}

          {!enabled ? (
            <form onSubmit={onVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="enroll-code">{t("twoFactor.code")}</Label>
                <Input
                  id="enroll-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {t("twoFactor.verify")}
              </Button>
            </form>
          ) : null}
        </div>
      )}

      <div className="mt-8 border-t pt-5">
        <p className="text-sm font-medium">{t("twoFactor.disableTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("twoFactor.disableSubtitle")}</p>
        <form onSubmit={onDisable} className="mt-3 space-y-3">
          <input type="hidden" name="username" autoComplete="username" value="" />
          <PasswordInput
            aria-label={t("common.currentPassword")}
            name="disablePassword"
            autoComplete="current-password"
            placeholder={t("common.currentPassword")}
            dir="ltr"
            required
            value={disablePassword}
            onChange={(event) => setDisablePassword(event.target.value)}
          />
          <Button type="submit" variant="outline" className="w-full" disabled={disablePending}>
            {t("twoFactor.disable")}
          </Button>
        </form>
      </div>
    </>
  );
}
