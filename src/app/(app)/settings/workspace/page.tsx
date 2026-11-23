import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/core/auth/dal";
import { getAllSettings, getTimeZone } from "@/core/settings/service";

export default async function WorkspaceSettingsPage() {
  const t = await getTranslations("settings");
  const [values, canEdit, timeZone] = await Promise.all([
    getAllSettings(),
    hasPermission("settings.update"),
    getTimeZone(),
  ]);
  const fields = await buildSettingsFields(["workspace.timeZone"], values);

  return (
    <SettingsSection title={t("workspace.title")} fields={fields} canEdit={canEdit}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t("workspace.resolvedTitle")}:</span>
        <Badge tone="accent" className="font-mono" dir="ltr">
          {timeZone}
        </Badge>
      </div>
      <Alert tone="info">{t("workspace.resolved", { zone: timeZone })}</Alert>
      <p className="text-xs text-muted">{t("workspace.hint")}</p>
    </SettingsSection>
  );
}
