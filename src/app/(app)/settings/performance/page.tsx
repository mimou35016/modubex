import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasEntitlement } from "@/core/entitlements/guards";
import { getEntitlements } from "@/core/entitlements/service";
import { getCacheReadsEnabled, getSettingValue } from "@/core/settings/service";

export default async function PerformanceSettingsPage() {
  const t = await getTranslations("settings");
  const [configured, effective, entitlements] = await Promise.all([
    getSettingValue("performance.cacheReads"),
    getCacheReadsEnabled(),
    getEntitlements(),
  ]);
  const enabled = configured && effective;
  const canTune = hasEntitlement(entitlements, "settings.advancedPerformance");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("performance.title")}</CardTitle>
        <p className="text-xs leading-5 text-muted">{t("performance.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("performance.statusTitle")}</p>
            <p className="text-xs text-muted">
              {enabled ? t("performance.statusEnabled") : t("performance.statusDisabled")}
            </p>
          </div>
          <Badge tone={enabled ? "accent" : "muted"}>
            {enabled ? t("enabled") : t("disabled")}
          </Badge>
        </div>

        <Alert tone="info">{t("performance.explanation", { tag: "settings", seconds: 300 })}</Alert>

        {canTune ? (
          <Link
            href="/settings/performance/advanced"
            className="text-sm font-medium text-accent hover:underline"
          >
            {t("performance.advancedLink")}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
