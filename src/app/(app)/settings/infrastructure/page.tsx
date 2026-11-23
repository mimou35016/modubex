import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/core/config/env";
import { infrastructureRegistry, type InfrastructureKey } from "@/core/settings/registry";

/** Safe, non-secret values. Database URLs and auth secrets are never rendered. */
const envDetails: Partial<Record<InfrastructureKey, string>> = {
  "infrastructure.passwordMinBootstrap": String(env.AUTH_PASSWORD_MIN_LENGTH),
  "infrastructure.auditRetentionBootstrap": String(env.AUDIT_RETENTION_DAYS),
};

export default async function InfrastructureSettingsPage() {
  const t = await getTranslations("settings");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("infrastructure.title")}</CardTitle>
        <p className="text-xs leading-5 text-muted">{t("infrastructure.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert tone="info">{t("infrastructure.noValues")}</Alert>
        <ul className="divide-y">
          {infrastructureRegistry.map((descriptor) => {
            const detail = envDetails[descriptor.key];
            // Descriptor labels are global i18n keys; this translator is scoped to `settings`.
            const labelKey = descriptor.label.startsWith("settings.")
              ? descriptor.label.slice("settings.".length)
              : descriptor.label;
            return (
              <li
                key={descriptor.key}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(labelKey)}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {descriptor.sensitive ? <Badge>{t("sensitive")}</Badge> : null}
                    {descriptor.restartRequired ? <Badge>{t("restartRequired")}</Badge> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {detail ? (
                    <Badge tone="accent" className="font-mono" dir="ltr">
                      {detail}
                    </Badge>
                  ) : null}
                  <Badge tone={descriptor.configured ? "accent" : "muted"}>
                    {descriptor.configured ? t("configured") : t("notConfigured")}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
