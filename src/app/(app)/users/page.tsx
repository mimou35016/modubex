import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/core/auth/dal";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasPermission } from "../_components/permissions";
import {
  normalizeSearchParams,
  usersListParamsSchema,
  type RawSearchParams,
} from "../_components/list-params";
import { Pagination } from "../_components/pagination";

const PAGE_SIZE = 20;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { permissionKeys } = await requirePagePermission("users.read");

  const t = await getTranslations("users");
  const locale = await getLocale();
  const filters = usersListParamsSchema.parse(normalizeSearchParams(await searchParams));
  const canInvite = hasPermission(permissionKeys, "users.invite");

  const where = filters.q
    ? {
        OR: [
          { name: { contains: filters.q, mode: "insensitive" as const } },
          { email: { contains: filters.q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, banned: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = users.map((user) => user.id);
  const assignments = userIds.length
    ? await prisma.userRole.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, roleId: true },
      })
    : [];
  const roleIds = [...new Set(assignments.map((assignment) => assignment.roleId))];
  const roles = roleIds.length
    ? await prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, key: true, name: true },
      })
    : [];
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const rolesByUser = new Map<string, typeof roles>();
  for (const assignment of assignments) {
    const role = rolesById.get(assignment.roleId);
    if (!role) continue;
    const list = rolesByUser.get(assignment.userId) ?? [];
    list.push(role);
    rolesByUser.set(assignment.userId, list);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t("subtitle")}</p>
        </div>
        {canInvite ? (
          <Link href="/invite" className={buttonVariants({ variant: "outline" })}>
            {t("invite")}
          </Link>
        ) : null}
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("searchTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/users" method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="users-search">{t("searchLabel")}</Label>
              <Input
                id="users-search"
                name="q"
                type="search"
                maxLength={120}
                defaultValue={filters.q}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <Button type="submit">{t("searchSubmit")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b text-start text-xs text-muted">
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.name")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.email")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.status")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.roles")}
                </th>
                <th scope="col" className="px-6 py-3 text-start font-medium">
                  {t("columns.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0">
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/users/${user.id}`} className="text-accent hover:underline">
                      {user.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4" dir="ltr">
                    <Link
                      href={`/users/${user.id}`}
                      className="text-muted hover:text-accent hover:underline"
                    >
                      {user.email}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={user.banned ? "muted" : "accent"}>
                      {user.banned ? t("states.deactivated") : t("states.active")}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(rolesByUser.get(user.id) ?? []).length > 0 ? (
                        (rolesByUser.get(user.id) ?? []).map((role) => (
                          <Badge key={role.id}>{role.name}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted">{t("noRoles")}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted">
                    {dateFormat.format(new Date(user.createdAt))}
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          pathname="/users"
          params={filters.q ? { q: filters.q } : {}}
          page={filters.page}
          totalPages={totalPages}
        />
      </Card>
    </div>
  );
}
