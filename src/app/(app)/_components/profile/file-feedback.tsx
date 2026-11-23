"use client";

import { useTranslations } from "next-intl";
import { readActionState } from "@/app/(auth)/_components/form-utils";
import { Alert } from "@/components/ui/alert";

/** Feedback for the frozen file actions, whose state shape is owned elsewhere. */
export function FileFeedback({
  state,
  successMessage,
}: {
  state: unknown;
  successMessage: string;
}) {
  const t = useTranslations("files");
  const info = readActionState(state);

  if (info.status === "error") {
    return <Alert tone="error">{info.message ?? t("actionError")}</Alert>;
  }
  if (info.status === "success") {
    return <Alert tone="success">{info.message ?? successMessage}</Alert>;
  }
  return null;
}
