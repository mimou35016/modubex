"use client";

import { useActionState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/files";
import { readActionState } from "@/app/(auth)/_components/form-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileFeedback } from "./file-feedback";

type FileState = Parameters<typeof uploadAvatarAction>[0];

export function AvatarForm({ avatarId, name }: { avatarId: string | null; name: string }) {
  const t = useTranslations("files");
  const router = useRouter();
  const uploadRef = useRef<HTMLFormElement>(null);
  const [uploadState, uploadAction, uploadPending] = useActionState<FileState, FormData>(
    uploadAvatarAction,
    {} as FileState,
  );
  const [removeState, removeAction, removePending] = useActionState<FileState, FormData>(
    removeAvatarAction,
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
    <div className="space-y-5">
      {avatarId ? (
        <div className="flex items-center gap-3">
          <Image
            src={`/api/files/${avatarId}`}
            alt={t("current")}
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded-full object-cover"
          />
          <p className="text-xs text-muted">{t("current")}</p>
        </div>
      ) : null}

      <form ref={uploadRef} action={uploadAction} className="space-y-2">
        <Label htmlFor="avatar-upload">{t("avatar")}</Label>
        <Input
          id="avatar-upload"
          name="avatar"
          type="file"
          accept="image/*"
          aria-label={`${t("avatar")} — ${name}`}
          className="h-auto py-2"
          required
        />
        <p className="text-xs leading-5 text-muted">{t("avatarHelp")}</p>
        <Button type="submit" disabled={uploadPending}>
          {t("uploadAvatar")}
        </Button>
        <FileFeedback state={uploadState} successMessage={t("uploaded")} />
      </form>

      {avatarId ? (
        <form action={removeAction} className="space-y-2">
          <Button type="submit" variant="outline" disabled={removePending}>
            {t("removeAvatar")}
          </Button>
          <FileFeedback state={removeState} successMessage={t("removed")} />
        </form>
      ) : null}
    </div>
  );
}
