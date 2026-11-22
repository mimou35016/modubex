import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/core/auth/dal";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { userIdParamSchema } from "../../_components/list-params";
import { hasPermission } from "../../_components/permissions";
import { RevokeSessionForm, UserActiveForm } from "../../_components/users/user-actions";
import { RoleAssignment, type AssignableRole } from "../../_components/users/role-assignment";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissionKeys } = await requirePagePermission("users.read");

  const t = await getTranslations("users.detail");
  const rbac = await getTranslations("rbac");
  const locale = await getLocale();
  const userId = userIdParamSchema.parse((await params).id);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, banned: true, createdAt: true },
  });
  if (!user) notFound();

  const canUpdateUser = hasPermission(permissionKeys, "users.update");
  const canManageRoles = hasPermission(permissionKeys, "roles.manage");
  const canAssignOwner = hasPermission(permissionKeys, "roles.assign_owner");
  const canReadSessions = hasPermission(permissionKeys, "users.sessions.read");

  const [roles, assignments, sessions] = await Promise.all([
    prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, isSystem: true },
    }),
    prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    }),
    canReadSessions
      ? prisma.session.findMany({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);

  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const assignedRoles: AssignableRole[] = assignments.flatMap((assignment) => {
    const role = rolesById.get(assignment.roleId);
    return role ? [role] : [];
  });
  const assignedIds = new Set(assignedRoles.map((role) => role.id));
  const availableRoles = roles.filter((role) => !assignedIds.has(role.id));
  const hasOwnerRole = assignedRoles.some((role) => role.key === "owner");
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.name}</h1>
          <p className="mt-1 text-sm text-muted" dir="ltr">
            {user.email}
          </p>
        </div>
        <Badge tone={user.banned ? "muted" : "accent"}>
          {user.banned ? t("deactivated") : t("active")}
        </Badge>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("accountTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">{t("createdAt")}</dt>
              <dd className="mt-0.5">{dateFormat.format(new Date(user.createdAt))}</dd>
            </div>
          </dl>
          {canUpdateUser ? <UserActiveForm userId={user.id} active={!user.banned} /> : null}
        </CardContent>
      </Card>

      {canManageRoles ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("rolesTitle")}</CardTitle>
            <p className="text-xs leading-5 text-muted">{t("rolesHint")}</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {hasOwnerRole ? (
              <p className="rounded-md border bg-accent-soft/50 px-3 py-2 text-xs leading-5 text-muted">
                {t("lastOwnerWarning")}
              </p>
            ) : null}
            <RoleAssignment
              userId={user.id}
              assigned={assignedRoles}
              available={availableRoles}
              canAssignOwner={canAssignOwner}
            />
            {!canAssignOwner ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <LockKeyhole className="size-3" aria-hidden="true" />
                {rbac("ownerAssignmentHint")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("rolesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            {assignedRoles.length > 0 ? (
              assignedRoles.map((role) => (
                <Badge key={role.id} className="inline-flex items-center gap-1">
                  {role.isSystem ? <LockKeyhole className="size-3" aria-hidden="true" /> : null}
                  {role.name}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted">{t("noRoles")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {canReadSessions ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("sessionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sessions.length > 0 ? (
              <ul className="divide-y">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0 space-y-1 text-xs text-muted">
                      <p>
                        {t("createdAt")}: {dateFormat.format(new Date(session.createdAt))}
                      </p>
                      <p dir="ltr">
                        {t("ipAddress")}: {session.ipAddress ?? t("noValue")}
                      </p>
                      <p className="break-words" dir="ltr">
                        {t("userAgent")}: {session.userAgent ?? t("noValue")}
                      </p>
                      <p>
                        {t("expiresAt")}: {dateFormat.format(new Date(session.expiresAt))}
                      </p>
                    </div>
                    <RevokeSessionForm userId={user.id} sessionId={session.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-8 text-sm text-muted">{t("noSessions")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
