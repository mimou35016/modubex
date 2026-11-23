import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/core/auth/dal";
import { getAllSettings, getPasswordRules, getSecuritySettings } from "@/core/settings/service";

export default async function SecuritySettingsPage() {
  const t = await getTranslations("settings");
  const [values, canEdit, rules, security] = await Promise.all([
    getAllSettings(),
    hasPermission("settings.update"),
    getPasswordRules(),
    getSecuritySettings(),
  ]);
  const fields = await buildSettingsFields(
    [
      "security.passwordMinLength",
      "security.passwordMaxLength",
      "security.requireNumber",
      "security.requireSymbol",
      "security.requireTwoFactor",
    ],
    values,
  );
  const stateLabel = (enabled: boolean) => t(enabled ? "enabled" : "disabled");

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("security.liveTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted">
            {t("security.liveNote", {
              min: rules.minLength,
              max: rules.maxLength,
              number: stateLabel(rules.requireNumber),
              symbol: stateLabel(rules.requireSymbol),
              twoFactor: stateLabel(security.requireTwoFactor),
            })}
          </p>
        </CardContent>
      </Card>

      <SettingsSection title={t("security.title")} fields={fields} canEdit={canEdit} />
    </div>
  );
}
