import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ModuleStateValue } from "@/app/(app)/_components/modules/module-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentPermissionKeys, requireSession } from "@/core/auth/dal";
import { getOverviewData } from "@/core/dashboard/overview";
import { getEntitlements } from "@/core/entitlements/service";
import { getFoundationReadiness } from "@/core/foundation/readiness";
import { getModuleViews } from "@/core/modules/state";
import { getSettingValue } from "@/core/settings/service";
import { cn } from "@/lib/utils";
import { hasPermission } from "./_components/permissions";

export default async function Home() {
  await requireSession();
  const permissionKeys = await getCurrentPermissionKeys();
  const t = await getTranslations("overview");
  const tLicense = await getTranslations("license");
  const locale = await getLocale();
  const { checks, milestones, currentMilestone, version } = getFoundationReadiness();
  const [entitlements, siteName, defaultLocale, retentionDays, moduleViews, overview] =
    await Promise.all([
      getEntitlements(),
      getSettingValue("site.name"),
      getSettingValue("localization.defaultLocale"),
      getSettingValue("audit.retentionDays"),
      getModuleViews(),
      getOverviewData(permissionKeys),
    ]);
  const countModules = (state: ModuleStateValue) =>
    moduleViews.filter((view) => view.state === state).length;
  const summary = [
    { label: t("plan"), value: tLicense(`plans.${entitlements.plan}`) },
    { label: t("siteName"), value: siteName },
    { label: t("defaultLocale"), value: t(`locales.${defaultLocale}`) },
    {
      label: t("auditRetention"),
      value: retentionDays === 0 ? t("forever") : t("days", { days: retentionDays }),
    },
    { label: t("modulesInstalled"), value: String(countModules("installed")) },
    { label: t("modulesEnabled"), value: String(countModules("enabled")) },
    { label: t("modulesAvailable"), value: String(countModules("available")) },
  ];
  const canReadUsers = hasPermission(permissionKeys, "users.read");
  const canReadAudit = hasPermission(permissionKeys, "audit.read");
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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

      {overview.users || overview.audit ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {overview.users ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  {canReadUsers ? (
                    <Link href="/users" className="text-accent hover:underline">
                      {t("users")}
                    </Link>
                  ) : (
                    t("users")
                  )}
                </CardTitle>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{overview.users.total}</p>
              </CardHeader>
              <CardContent className="pt-6">
                <dl>
                  <dt className="text-xs text-muted">{t("activeSessions")}</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums">
                    {overview.users.activeSessions}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {overview.audit ? (
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{t("recentAudit")}</CardTitle>
                  {canReadAudit ? (
                    <Link href="/audit" className="text-xs font-medium text-accent hover:underline">
                      {t("viewAudit")}
                    </Link>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {overview.audit.entries.length > 0 ? (
                  <ul>
                    {overview.audit.entries.map((entry) => {
                      const target = [entry.targetType, entry.targetId]
                        .filter((value): value is string => Boolean(value))
                        .join(" / ");
                      const details = [entry.actor, target].filter((value): value is string =>
                        Boolean(value),
                      );
                      return (
                        <li
                          key={entry.id}
                          className="flex flex-col gap-1 border-b px-6 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs" dir="ltr">
                              {entry.action}
                            </p>
                            {details.length > 0 ? (
                              <p className="mt-1 truncate text-[11px] text-muted" dir="ltr">
                                {details.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <time
                            dateTime={entry.createdAt.toISOString()}
                            className="shrink-0 text-[11px] text-muted"
                          >
                            {dateFormat.format(entry.createdAt)}
                          </time>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-6 py-10 text-center text-sm text-muted">{t("noAudit")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

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
