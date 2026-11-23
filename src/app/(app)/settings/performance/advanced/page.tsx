import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { hasPermission } from "@/core/auth/dal";
import { requirePageEntitlement } from "@/core/entitlements/guards";
import { getAllSettings } from "@/core/settings/service";

export default async function AdvancedPerformanceSettingsPage() {
  const t = await getTranslations("settings");
  await requirePageEntitlement("settings.advancedPerformance");
  const [values, canEdit] = await Promise.all([getAllSettings(), hasPermission("settings.update")]);
  const fields = await buildSettingsFields(["performance.cacheReads"], values);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-muted">{t("performance.advancedHint")}</p>
      <SettingsSection
        title={t("performance.advancedTitle")}
        subtitle={t("fields.performance.cacheReadsDescription")}
        fields={fields}
        canEdit={canEdit}
      />
      <Link
        href="/settings/performance"
        className="text-xs font-medium text-accent hover:underline"
      >
        {t("tabs.performance")}
      </Link>
    </div>
  );
}
