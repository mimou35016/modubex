import { LockKeyhole } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/core/auth/dal";
import { isCustomRolePermissionKey, permissionCatalog } from "@/core/rbac/permissions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreateRoleForm,
  DeleteRoleForm,
  EditRoleForm,
  type EditableRole,
} from "../_components/roles/role-form";
import { PermissionMatrix, type CatalogPermission } from "../_components/permission-matrix";
import { hasPermission } from "../_components/permissions";

export default async function RolesPage() {
  const { permissionKeys } = await requirePagePermission("roles.read");

  const t = await getTranslations("roles");
  const rbac = await getTranslations("rbac");
  const canManage = hasPermission(permissionKeys, "roles.manage");

  const catalog: CatalogPermission[] = permissionCatalog.map((permission) => ({
    key: permission.key,
    description: permission.description ?? "",
    module: permission.module,
  }));
  // The read-only matrices show the full catalog; editable forms cannot grant
  // the Owner-only permission.
  const editableCatalog = catalog.filter((permission) => isCustomRolePermissionKey(permission.key));

  const storedRoles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: {
        select: {
          permission: {
            select: { key: true, description: true, module: true },
          },
        },
      },
    },
  });
  const roles: EditableRole[] = storedRoles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? "",
    isSystem: role.isSystem,
    permissions: role.permissions.map((assignment) => assignment.permission.key),
  }));
  const systemRoles = roles.filter((role) => role.isSystem);
  const customRoles = roles.filter((role) => !role.isSystem);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{rbac("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{rbac("subtitle")}</p>
      </header>

      <section className="space-y-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{rbac("permissionsTitle")}</CardTitle>
            <p className="text-xs leading-5 text-muted">{rbac("permissionsSubtitle")}</p>
          </CardHeader>
          <CardContent className="pt-6">
            <PermissionMatrix permissions={catalog} idPrefix="catalog" />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("systemTitle")}</h2>
        {systemRoles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="border-b">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {role.name}
                <Badge tone="accent" className="inline-flex items-center gap-1">
                  <LockKeyhole className="size-3" aria-hidden="true" />
                  {rbac("locked")}
                </Badge>
              </CardTitle>
              <p className="font-mono text-[11px] text-muted" dir="ltr">
                {role.key}
              </p>
              {role.description ? <p className="text-xs text-muted">{role.description}</p> : null}
            </CardHeader>
            <CardContent className="pt-6">
              <PermissionMatrix
                permissions={catalog}
                selected={role.permissions}
                idPrefix={`system-${role.id}`}
              />
            </CardContent>
          </Card>
        ))}
        {systemRoles.length === 0 ? <p className="text-sm text-muted">{t("noSystem")}</p> : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        {customRoles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="border-b">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {role.name}
                <Badge>{rbac("customRole")}</Badge>
              </CardTitle>
              <p className="font-mono text-[11px] text-muted" dir="ltr">
                {role.key}
              </p>
              {role.description ? <p className="text-xs text-muted">{role.description}</p> : null}
            </CardHeader>
            <CardContent className="pt-6">
              <PermissionMatrix
                permissions={catalog}
                selected={role.permissions}
                idPrefix={`role-${role.id}`}
              />
              {canManage ? (
                <>
                  <div className="mt-5">
                    <EditRoleForm role={role} catalog={editableCatalog} />
                  </div>
                  <DeleteRoleForm role={role} />
                </>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {customRoles.length === 0 ? <p className="text-sm text-muted">{t("noCustom")}</p> : null}
      </section>

      {canManage ? <CreateRoleForm catalog={editableCatalog} /> : null}
    </div>
  );
}
