import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/core/auth/dal";
import { getAuditRetention } from "@/core/audit/retention";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PurgeForm } from "../_components/audit/purge-form";
import {
  auditListParamsSchema,
  normalizeSearchParams,
  type RawSearchParams,
} from "../_components/list-params";
import { hasPermission } from "../_components/permissions";
import { Pagination } from "../_components/pagination";

const PAGE_SIZE = 25;

function prettyJson(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined) return emptyLabel;
  try {
    return JSON.stringify(value, null, 2) ?? emptyLabel;
  } catch {
    return String(value);
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { permissionKeys } = await requirePagePermission("audit.read");

  const t = await getTranslations("audit");
  const locale = await getLocale();
  const filters = auditListParamsSchema.parse(normalizeSearchParams(await searchParams));
  const canExport = hasPermission(permissionKeys, "audit.export");
  const canManage = hasPermission(permissionKeys, "audit.manage");

  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };
  if (filters.userId) where.userId = filters.userId;
  if (filters.module) where.module = { contains: filters.module, mode: "insensitive" };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        userId: true,
        email: true,
        module: true,
        targetType: true,
        targetId: true,
        before: true,
        after: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const retentionDays = getAuditRetention();
  const retentionLabel =
    retentionDays <= 0 ? t("retentionForever") : t("retentionDays", { days: retentionDays });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportQuery = new URLSearchParams();
  if (filters.action) exportQuery.set("action", filters.action);
  if (filters.userId) exportQuery.set("userId", filters.userId);
  if (filters.module) exportQuery.set("module", filters.module);
  if (filters.from) exportQuery.set("from", filters.from);
  if (filters.to) exportQuery.set("to", filters.to);
  const queryString = exportQuery.toString();
  const exportHref = queryString ? `/api/audit/export?${queryString}` : "/api/audit/export";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <Link href={exportHref} className={buttonVariants()}>
              {t("export")}
            </Link>
          ) : null}
          <Badge>{retentionLabel}</Badge>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/audit" method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="audit-action">{t("filterAction")}</Label>
              <Input
                id="audit-action"
                name="action"
                type="search"
                maxLength={191}
                defaultValue={filters.action}
                placeholder={t("filterActionPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-user">{t("filterUser")}</Label>
              <Input
                id="audit-user"
                name="userId"
                type="search"
                maxLength={191}
                dir="ltr"
                defaultValue={filters.userId}
                placeholder={t("filterUserPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-module">{t("filterModule")}</Label>
              <Input
                id="audit-module"
                name="module"
                type="search"
                maxLength={191}
                defaultValue={filters.module}
                placeholder={t("filterModulePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-from">{t("filterFrom")}</Label>
              <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to">{t("filterTo")}</Label>
              <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
            </div>
            <div className="flex flex-wrap items-end gap-2 pb-0.5">
              <Button type="submit">{t("filterSubmit")}</Button>
              <Link href="/audit" className={buttonVariants({ variant: "outline" })}>
                {t("filterReset")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs text-muted">
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.actor")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.action")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.target")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.module")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.changes")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const target = [entry.targetType, entry.targetId].filter(Boolean).join(" / ");
                return (
                  <tr key={entry.id} className="border-b align-top last:border-b-0">
                    <td className="px-6 py-4 text-xs" dir="ltr">
                      {entry.email ?? entry.userId ?? t("noActor")}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs" dir="ltr">
                      {entry.action}
                    </td>
                    <td className="px-6 py-4 text-xs" dir="ltr">
                      {target || t("noTarget")}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs" dir="ltr">
                      {entry.module ?? t("noValue")}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="space-y-1">
                        <details>
                          <summary className="cursor-pointer font-medium text-accent">
                            {t("before")}
                          </summary>
                          <pre
                            className="mt-1 max-h-40 max-w-72 overflow-auto whitespace-pre-wrap break-words rounded bg-accent-soft/50 p-2 font-mono text-[11px]"
                            dir="ltr"
                          >
                            {prettyJson(entry.before, t("noValue"))}
                          </pre>
                        </details>
                        <details>
                          <summary className="cursor-pointer font-medium text-accent">
                            {t("after")}
                          </summary>
                          <pre
                            className="mt-1 max-h-40 max-w-72 overflow-auto whitespace-pre-wrap break-words rounded bg-accent-soft/50 p-2 font-mono text-[11px]"
                            dir="ltr"
                          >
                            {prettyJson(entry.after, t("noValue"))}
                          </pre>
                        </details>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-muted">
                      {dateFormat.format(new Date(entry.createdAt))}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          pathname="/audit"
          params={{
            ...(filters.action ? { action: filters.action } : {}),
            ...(filters.userId ? { userId: filters.userId } : {}),
            ...(filters.module ? { module: filters.module } : {}),
            ...(filters.from ? { from: filters.from } : {}),
            ...(filters.to ? { to: filters.to } : {}),
          }}
          page={filters.page}
          totalPages={totalPages}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("retentionTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-sm leading-6 text-muted">{retentionLabel}</CardContent>
        </Card>
        {canManage ? <PurgeForm retentionDays={retentionDays} /> : null}
      </div>
    </div>
  );
}
