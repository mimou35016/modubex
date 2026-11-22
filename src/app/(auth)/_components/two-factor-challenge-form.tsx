"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { twoFactorSchema } from "@/core/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { authErrorCode, getAuthError } from "./form-utils";

type BackupVerifier = (input: { code: string }) => Promise<unknown>;

const backupVerifier = (
  authClient.twoFactor as unknown as { verifyBackupCode?: BackupVerifier }
).verifyBackupCode;

export function TwoFactorChallengeForm({ required = false }: { required?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = code.trim();
    const parsed = mode === "backup" ? null : twoFactorSchema.safeParse({ code: trimmed });
    if (mode === "totp" && (!parsed?.success || !parsed.data.code)) {
      setError(t("twoFactor.invalidCode"));
      return;
    }
    if (mode === "backup" && !trimmed) {
      setError(t("twoFactor.invalidCode"));
      return;
    }

    setPending(true);
    try {
      const result =
        mode === "backup" && backupVerifier
          ? await backupVerifier({ code: trimmed })
          : await authClient.twoFactor.verifyTotp({ code: trimmed });

      const message = getAuthError(result);
      if (message) {
        setError(
          /invalid|incorrect|wrong|expired|code|otp|token/i.test(message)
            ? t("twoFactor.invalidCode")
            : t(`errors.${authErrorCode(message)}`),
        );
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
        <h1 className="text-2xl font-semibold tracking-tight">
          {required ? t("twoFactor.requiredTitle") : t("twoFactor.challengeTitle")}
        </h1>
        <p className="text-sm leading-6 text-muted">
          {required ? t("twoFactor.requiredBody") : t("twoFactor.challengeSubtitle")}
        </p>
      </div>

      {error ? <Alert tone="error" className="mt-5">{error}</Alert> : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="two-factor-code">
            {mode === "backup" ? t("twoFactor.backupCode") : t("twoFactor.code")}
          </Label>
          <Input
            id="two-factor-code"
            name="code"
            inputMode={mode === "backup" ? "text" : "numeric"}
            autoComplete={mode === "backup" ? "off" : "one-time-code"}
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

      {typeof backupVerifier === "function" ? (
        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-medium text-accent hover:underline"
          onClick={() => {
            setMode((current) => (current === "totp" ? "backup" : "totp"));
            setError(null);
          }}
        >
          {mode === "totp" ? t("twoFactor.useBackupCode") : t("twoFactor.useAuthenticator")}
        </button>
      ) : null}
    </>
  );
}
