import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LicenseForm } from "@/app/(app)/_components/license/license-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/core/auth/dal";
import { hasEntitlement } from "@/core/entitlements/guards";
import { planEntitlements, planKeys } from "@/core/entitlements/plans";
import { getEntitlements } from "@/core/entitlements/service";
import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

type LicenseStatus = { keySet: boolean; validUntil: string | null };
type LicenseRow = { licenseKey: string | null; validUntil: Date | string | null };
type LicenseDelegate = {
  findFirst(args: {
    where: { workspaceId: string };
    select: { licenseKey: true; validUntil: true };
  }): Promise<LicenseRow | null>;
};

function toDateInput(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Only reads key presence and expiry; the raw license key is never selected. */
async function readLicenseStatus(): Promise<LicenseStatus> {
  const fallback: LicenseStatus = { keySet: false, validUntil: null };
  try {
    const delegate = (prisma as unknown as { license?: LicenseDelegate }).license;
    if (!delegate) return fallback;
    const row = await delegate.findFirst({
      where: { workspaceId: "" },
      select: { licenseKey: true, validUntil: true },
    });
    return { keySet: Boolean(row?.licenseKey), validUntil: toDateInput(row?.validUntil) };
  } catch (error: unknown) {
    logger.warn("License status lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export default async function LicensePage() {
  const t = await getTranslations("license");
  const [entitlements, canManage, status] = await Promise.all([
    getEntitlements(),
    hasPermission("license.manage"),
    readLicenseStatus(),
  ]);

  const allKeys = [...new Set(planKeys.flatMap((plan) => planEntitlements[plan]))];
  const missingKeys = allKeys.filter((key) => !entitlements.has(key));
  const canTune = hasEntitlement(entitlements, "settings.advancedPerformance");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <Badge tone="accent">{t(`plans.${entitlements.plan}`)}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("featuresTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t("activeTitle")}</p>
              <ul className="flex flex-wrap gap-2">
                {entitlements.keys.map((key) => (
                  <li key={key}>
                    <Badge tone="accent">{t(`entitlements.${key}`)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t("missingTitle")}</p>
              {missingKeys.length === 0 ? (
                <p className="text-sm text-muted">{t("noMissing")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {missingKeys.map((key) => (
                    <li key={key}>
                      <Badge>{t(`entitlements.${key}`)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-4 border-t pt-4 text-xs text-muted">
              <span>
                {t("currentPlan")}: <Badge tone="accent">{t(`plans.${entitlements.plan}`)}</Badge>
              </span>
              <span>
                {t("keyStatus")}:{" "}
                <Badge>{status.keySet ? t("statusSet") : t("statusNotSet")}</Badge>
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Alert tone="info">
            <p className="font-medium">{t("restrictionTitle")}</p>
            <p>{t("restrictionBody")}</p>
            {canTune ? (
              <Link
                href="/settings/performance/advanced"
                className="mt-2 inline-block font-medium text-accent hover:underline"
              >
                {t("advancedLink")}
              </Link>
            ) : null}
          </Alert>

          {canManage ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>{t("manageTitle")}</CardTitle>
                <p className="text-xs leading-5 text-muted">{t("manageSubtitle")}</p>
              </CardHeader>
              <CardContent>
                <LicenseForm
                  plans={planKeys}
                  currentPlan={entitlements.plan}
                  keySet={status.keySet}
                  validUntil={status.validUntil}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
