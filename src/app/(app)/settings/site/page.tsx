import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { hasPermission } from "@/core/auth/dal";
import { getAllSettings } from "@/core/settings/service";

export default async function SiteSettingsPage() {
  const t = await getTranslations("settings");
  const [values, canEdit] = await Promise.all([getAllSettings(), hasPermission("settings.update")]);
  const fields = await buildSettingsFields(["site.name", "site.tagline"], values);

  return (
    <SettingsSection
      title={t("site.title")}
      subtitle={t("site.subtitle")}
      fields={fields}
      canEdit={canEdit}
    />
  );
}
