import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEntitlements } from "@/core/entitlements/service";
import { getFoundationReadiness } from "@/core/foundation/readiness";
import { getSettingValue } from "@/core/settings/service";
import { cn } from "@/lib/utils";

export default async function Home() {
  const t = await getTranslations("overview");
  const tLicense = await getTranslations("license");
  const { checks, milestones, currentMilestone, version } = getFoundationReadiness();
  const [entitlements, siteName, defaultLocale, retentionDays] = await Promise.all([
    getEntitlements(),
    getSettingValue("site.name"),
    getSettingValue("localization.defaultLocale"),
    getSettingValue("audit.retentionDays"),
  ]);
  const summary = [
    { label: t("plan"), value: tLicense(`plans.${entitlements.plan}`) },
    { label: t("siteName"), value: siteName },
    { label: t("defaultLocale"), value: t(`locales.${defaultLocale}`) },
    {
      label: t("auditRetention"),
      value: retentionDays === 0 ? t("forever") : t("days", { days: retentionDays }),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <section className="border-b pb-8">
        <div
          className="flex items-center gap-1.5"
          aria-label={`Milestone ${currentMilestone} of ${milestones.length - 1}`}
        >
          {milestones.map((milestone) => (
            <span
              key={milestone}
              title={milestone}
              className={cn(
                "h-1.5 w-8 rounded-full",
                milestone === currentMilestone ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{t("subtitle")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{currentMilestone}</Badge>
          <Badge>
            {t("version")} {version}
          </Badge>
          <Badge>
            {t("environment")} {process.env.NODE_ENV}
          </Badge>
        </div>
      </section>

      <Card className="mt-10 overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>{t("readinessTitle")}</CardTitle>
          <p className="text-xs text-muted">{t("readinessHint")}</p>
        </CardHeader>
        <CardContent className="p-0">
          <ul>
            {checks.map((check) => (
              <li
                key={check.id}
                className="flex items-center justify-between gap-4 border-b px-6 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`checks.${check.id}`)}</p>
                  <p className="truncate font-mono text-[11px] text-muted">{check.detail}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px]",
                    check.ready ? "bg-accent-soft text-accent" : "bg-accent-soft/60 text-muted",
                  )}
                >
                  {check.ready ? t("states.ready") : t("states.pending")}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader className="border-b">
          <CardTitle>{t("summaryTitle")}</CardTitle>
          <p className="text-xs text-muted">{t("summarySubtitle")}</p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {summary.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
