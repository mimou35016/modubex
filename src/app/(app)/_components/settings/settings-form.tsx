"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateSettingsAction } from "@/app/actions/settings";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";

export type SettingFieldType = "string" | "number" | "boolean" | "locale" | "timeZone";

/** Plain, serializable metadata; zod schemas and functions stay on the server. */
export type SettingFieldMetadata = {
  key: string;
  label: string;
  description?: string;
  value: string | number | boolean;
  type: SettingFieldType;
  sensitive?: boolean;
  restartRequired?: boolean;
};

const selectClass =
  "h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function SettingsForm({
  fields,
  canEdit,
}: {
  fields: SettingFieldMetadata[];
  canEdit: boolean;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateSettingsAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-5">
        {fields.map((field) => {
          const id = `setting-${field.key.replace(/\./g, "-")}`;
          const disabled = !canEdit;

          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              {field.description ? (
                <p className="text-xs leading-5 text-muted">{field.description}</p>
              ) : null}

              {field.type === "boolean" ? (
                <select
                  id={id}
                  name={field.key}
                  defaultValue={field.value ? "true" : "false"}
                  disabled={disabled}
                  className={selectClass}
                >
                  <option value="true">{t("enabled")}</option>
                  <option value="false">{t("disabled")}</option>
                </select>
              ) : field.type === "locale" ? (
                <select
                  id={id}
                  name={field.key}
                  defaultValue={String(field.value)}
                  disabled={disabled}
                  className={selectClass}
                >
                  <option value="en">{t("localization.locales.en")}</option>
                  <option value="fr">{t("localization.locales.fr")}</option>
                  <option value="ar">{t("localization.locales.ar")}</option>
                </select>
              ) : (
                <Input
                  id={id}
                  name={field.key}
                  type={field.type === "number" ? "number" : "text"}
                  dir={field.type === "timeZone" ? "ltr" : undefined}
                  defaultValue={String(field.value)}
                  disabled={disabled}
                  required
                />
              )}

              <div className="flex flex-wrap gap-2">
                {field.sensitive ? <Badge>{t("sensitive")}</Badge> : null}
                {field.restartRequired ? <Badge>{t("restartRequired")}</Badge> : null}
              </div>
            </div>
          );
        })}

        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        ) : null}
      </form>

      {!canEdit ? <Alert tone="info">{t("readOnly")}</Alert> : null}
      <ActionResult state={state} successMessage={t("saved")} />
    </div>
  );
}
