"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  disableModuleAction,
  enableModuleAction,
  installModuleAction,
  uninstallModuleAction,
} from "@/app/actions/modules";
import type { ActionState } from "@/app/(app)/_components/action-result";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult } from "../action-result";
import type { ModuleStateValue } from "./module-view";

type LifecycleAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function ModuleActionForm({
  action,
  moduleId,
  label,
  successMessage,
  mode,
  variant = "outline",
  disabled = false,
}: {
  action: LifecycleAction;
  moduleId: string;
  label: string;
  successMessage: string;
  mode?: "keep-data" | "delete-data";
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="moduleId" value={moduleId} />
      {mode ? <input type="hidden" name="mode" value={mode} /> : null}
      <Button type="submit" size="sm" variant={variant} disabled={disabled || pending}>
        {label}
      </Button>
      <ActionResult state={state} successMessage={successMessage} />
    </form>
  );
}

function DeleteDataForm({ moduleId, disabled }: { moduleId: string; disabled: boolean }) {
  const t = useTranslations("modules");
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uninstallModuleAction,
    {},
  );
  const matches = confirmation === moduleId;
  const mismatched = confirmation.length > 0 && !matches;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-md border border-dashed p-3">
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="mode" value="delete-data" />
      <input type="hidden" name="confirmation" value={matches ? confirmation : ""} />
      <Label htmlFor={`delete-confirm-${moduleId}`}>{t("typedConfirmLabel")}</Label>
      <Input
        id={`delete-confirm-${moduleId}`}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder={moduleId}
        dir="ltr"
        autoComplete="off"
        disabled={disabled}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted">{t("confirm.typedHint", { moduleId })}</p>
      {mismatched ? <Alert tone="error">{t("confirm.mismatch")}</Alert> : null}
      <Button type="submit" size="sm" variant="outline" disabled={disabled || pending || !matches}>
        {t("lifecycle.deleteData")}
      </Button>
      <ActionResult state={state} successMessage={t("uninstalled")} />
    </form>
  );
}

export function ModuleLifecycleControls({
  moduleId,
  state,
  canManage,
  blocked,
}: {
  moduleId: string;
  state: ModuleStateValue;
  canManage: boolean;
  blocked: boolean;
}) {
  const t = useTranslations("modules");

  if (!canManage) return null;

  if (state === "available") {
    return (
      <ModuleActionForm
        action={installModuleAction}
        moduleId={moduleId}
        label={t("lifecycle.install")}
        successMessage={t("installed")}
        variant="default"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {state === "enabled" ? (
          <ModuleActionForm
            action={disableModuleAction}
            moduleId={moduleId}
            label={t("lifecycle.disable")}
            successMessage={t("disabled")}
            disabled={blocked}
          />
        ) : (
          <ModuleActionForm
            action={enableModuleAction}
            moduleId={moduleId}
            label={t("lifecycle.enable")}
            successMessage={t("enabled")}
            variant="default"
          />
        )}
        <Link
          href={`/modules/${encodeURIComponent(moduleId)}/settings`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("lifecycle.configure")}
        </Link>
        {blocked ? <span className="text-xs text-muted">{t("dependentsBlocked")}</span> : null}
      </div>
      {!blocked ? (
        <>
          <ModuleActionForm
            action={uninstallModuleAction}
            moduleId={moduleId}
            mode="keep-data"
            label={t("lifecycle.keepData")}
            successMessage={t("uninstalled")}
          />
          <DeleteDataForm moduleId={moduleId} disabled={false} />
        </>
      ) : null}
    </div>
  );
}
