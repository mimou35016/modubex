"use client";

import { useActionState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeSiteLogoAction, uploadSiteLogoAction } from "@/app/actions/files";
import { readActionState } from "@/app/(auth)/_components/form-utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileFeedback } from "./file-feedback";

type FileState = Parameters<typeof uploadSiteLogoAction>[0];

export function SiteLogoForm({ logoId, canEdit }: { logoId: string | null; canEdit: boolean }) {
  const t = useTranslations("files");
  const tSettings = useTranslations("settings");
  const router = useRouter();
  const uploadRef = useRef<HTMLFormElement>(null);
  const [uploadState, uploadAction, uploadPending] = useActionState<FileState, FormData>(
    uploadSiteLogoAction,
    {} as FileState,
  );
  const [removeState, removeAction, removePending] = useActionState<FileState, FormData>(
    removeSiteLogoAction,
    {} as FileState,
  );

  useEffect(() => {
    if (readActionState(uploadState).status === "success") {
      uploadRef.current?.reset();
      router.refresh();
    }
  }, [uploadState, router]);

  useEffect(() => {
    if (readActionState(removeState).status === "success") router.refresh();
  }, [removeState, router]);

  return (
    <div className="space-y-5 rounded-md border p-4">
      {logoId ? (
        <div className="flex items-center gap-3">
          <Image
            src={`/api/files/${logoId}`}
            alt={t("current")}
            width={48}
            height={48}
            unoptimized
            className="size-12 rounded-md object-contain"
          />
          <p className="text-xs text-muted">{t("current")}</p>
        </div>
      ) : null}

      <form ref={uploadRef} action={uploadAction} className="space-y-2">
        <Label htmlFor="site-logo-upload">{t("logo")}</Label>
        <Input
          id="site-logo-upload"
          name="logo"
          type="file"
          accept="image/*"
          className="h-auto py-2"
          disabled={!canEdit}
          required
        />
        <p className="text-xs leading-5 text-muted">{t("logoHelp")}</p>
        <Button type="submit" disabled={!canEdit || uploadPending}>
          {t("uploadLogo")}
        </Button>
        {canEdit ? <FileFeedback state={uploadState} successMessage={t("uploaded")} /> : null}
      </form>

      {logoId && canEdit ? (
        <form action={removeAction} className="space-y-2">
          <Button type="submit" variant="outline" disabled={removePending}>
            {t("removeLogo")}
          </Button>
          <FileFeedback state={removeState} successMessage={t("removed")} />
        </form>
      ) : null}

      {!canEdit ? <Alert tone="info">{tSettings("readOnly")}</Alert> : null}
    </div>
  );
}
