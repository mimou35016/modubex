import { requirePagePermission } from "@/core/auth/dal";
import { prisma } from "@/lib/prisma";
import { InviteForm, type InviteRole } from "../_components/invite-form";
import { hasPermission } from "../_components/permissions";

export default async function InvitePage() {
  const { permissionKeys } = await requirePagePermission("users.invite");

  const storedRoles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      isSystem: true,
      description: true,
    },
  });
  const roles: InviteRole[] = storedRoles;
  const canAssignOwner = hasPermission([...permissionKeys], "roles.assign_owner");

  return <InviteForm roles={roles} canAssignOwner={canAssignOwner} />;
}
