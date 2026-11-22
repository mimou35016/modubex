"use client";

import { useTranslations } from "next-intl";
import { readActionState } from "@/app/(auth)/_components/form-utils";
import { Alert } from "@/components/ui/alert";

export type ActionState = { error?: string; ok?: boolean; message?: string };

/** Shared feedback for the M2 server actions, which all use the same ActionState shape. */
export function ActionResult({
  state,
  successMessage,
}: {
  state: ActionState;
  successMessage: string;
}) {
  const t = useTranslations("common");
  const info = readActionState(state);

  if (info.status === "error") {
    return <Alert tone="error">{info.message ?? t("actionError")}</Alert>;
  }
  if (info.status === "success") {
    return <Alert tone="success">{info.message ?? successMessage}</Alert>;
  }
  return null;
}
