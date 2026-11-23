import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buildSettingsFields } from "@/app/(app)/_components/settings/settings-fields";
import { SettingsSection } from "@/app/(app)/_components/settings/settings-section";
import { Alert } from "@/components/ui/alert";
import { hasPermission } from "@/core/auth/dal";
import { getAllSettings } from "@/core/settings/service";

export default async function AuditSettingsPage() {
  const t = await getTranslations("settings");
  const [values, canEdit, canViewAudit] = await Promise.all([
    getAllSettings(),
    hasPermission("settings.update"),
    hasPermission("audit.read"),
  ]);
  const fields = await buildSettingsFields(["audit.retentionDays"], values);

  return (
    <SettingsSection title={t("audit.title")} fields={fields} canEdit={canEdit}>
      <Alert tone="info">
        {t("audit.hint")}
        {canViewAudit ? (
          <>
            {" "}
            <Link href="/audit" className="font-medium text-accent hover:underline">
              {t("audit.viewerLink")}
            </Link>
          </>
        ) : null}
      </Alert>
    </SettingsSection>
  );
}
