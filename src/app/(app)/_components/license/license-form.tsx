"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateLicenseAction } from "@/app/actions/license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";

export function LicenseForm({
  plans,
  currentPlan,
  keySet,
  validUntil,
}: {
  plans: readonly string[];
  currentPlan: string;
  keySet: boolean;
  validUntil: string | null;
}) {
  const t = useTranslations("license");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateLicenseAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="license-plan">{t("planLabel")}</Label>
        <select
          id="license-plan"
          name="plan"
          defaultValue={currentPlan}
          className="h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground"
        >
          {plans.map((plan) => (
            <option key={plan} value={plan}>
              {t(`plans.${plan}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="license-key">{t("licenseKeyLabel")}</Label>
        <Input
          id="license-key"
          name="licenseKey"
          type="password"
          autoComplete="off"
          dir="ltr"
          maxLength={120}
          placeholder={keySet ? t("statusSet") : t("statusNotSet")}
          className="font-mono text-xs"
        />
        <p className="text-xs leading-5 text-muted">{t("licenseKeyHintBlank")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="license-valid-until">{t("validUntilLabel")}</Label>
        <Input
          id="license-valid-until"
          name="validUntil"
          type="date"
          dir="ltr"
          defaultValue={validUntil ?? ""}
          className="font-mono text-xs"
        />
        <p className="text-xs leading-5 text-muted">{t("validUntilHint")}</p>
      </div>

      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      <ActionResult state={state} successMessage={t("saved")} />
    </form>
  );
}
