import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { Alert } from "@/components/ui/alert";
import { hasPermission } from "@/core/auth/dal";
import { getAllSettings } from "@/core/settings/service";

export default async function LocalizationSettingsPage() {
  const t = await getTranslations("settings");
  const [values, canEdit] = await Promise.all([getAllSettings(), hasPermission("settings.update")]);
  const fields = await buildSettingsFields(["localization.defaultLocale"], values);

  return (
    <SettingsSection title={t("localization.title")} fields={fields} canEdit={canEdit}>
      <Alert tone="info">{t("localization.defaultLocaleHint")}</Alert>
    </SettingsSection>
  );
}
