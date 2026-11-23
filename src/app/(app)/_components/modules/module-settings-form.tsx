"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateModuleSettingsAction } from "@/app/actions/modules";
import type { ActionState } from "@/app/(app)/_components/action-result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";
import type { ModuleSettingField } from "./module-field-types";

const selectClass =
  "h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function ModuleSettingsForm({
  moduleId,
  fields,
  canEdit,
}: {
  moduleId: string;
  fields: ModuleSettingField[];
  canEdit: boolean;
}) {
  const t = useTranslations("modules");
  const tSettings = useTranslations("settings");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateModuleSettingsAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="moduleId" value={moduleId} />
        {fields.map((field) => {
          const id = `module-setting-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
                  name={field.name}
                  defaultValue={field.value ? "true" : "false"}
                  disabled={disabled}
                  className={selectClass}
                >
                  <option value="true">{tSettings("enabled")}</option>
                  <option value="false">{tSettings("disabled")}</option>
                </select>
              ) : field.type === "enum" && field.options && field.options.length > 0 ? (
                <select
                  id={id}
                  name={field.name}
                  defaultValue={String(field.value)}
                  disabled={disabled}
                  className={selectClass}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={id}
                  name={field.name}
                  type={field.type === "number" ? "number" : "text"}
                  dir={field.type === "number" ? "ltr" : undefined}
                  defaultValue={String(field.value)}
                  disabled={disabled}
                  required={field.required && canEdit}
                />
              )}
            </div>
          );
        })}

        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {t("settingsSave")}
          </Button>
        ) : null}
      </form>

      {!canEdit ? <Alert tone="info">{t("settingsReadOnly")}</Alert> : null}
      <ActionResult state={state} successMessage={t("settingsSaved")} />
    </div>
  );
}
