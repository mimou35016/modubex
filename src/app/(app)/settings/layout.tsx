import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/app/(app)/_components/settings/settings-nav";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/core/auth/dal";
import { hasPermission as hasKeyPermission } from "@/app/(app)/_components/permissions";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { permissionKeys } = await requirePagePermission("settings.read");
  const t = await getTranslations("settings");
  const canEdit = hasKeyPermission(permissionKeys, "settings.update");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          {!canEdit ? <Badge>{t("viewOnly")}</Badge> : null}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("subtitle")}</p>
      </header>

      <div className="mt-5">
        <SettingsNav />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
