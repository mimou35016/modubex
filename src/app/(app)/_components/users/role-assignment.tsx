"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { assignRoleAction, unassignRoleAction } from "@/app/actions/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ActionResult, type ActionState } from "../action-result";

export type AssignableRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

function UnassignRoleForm({
  userId,
  role,
  canAssignOwner,
}: {
  userId: string;
  role: AssignableRole;
  canAssignOwner: boolean;
}) {
  const t = useTranslations("users.detail");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    unassignRoleAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const canRemove = role.key !== "owner" || canAssignOwner;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate">{role.name}</span>
        <span className="font-mono text-[11px] text-muted" dir="ltr">
          {role.key}
        </span>
        {role.isSystem ? (
          <Badge tone="accent" className="inline-flex items-center gap-1">
            <LockKeyhole className="size-3" aria-hidden="true" />
            {t("roleLocked")}
          </Badge>
        ) : null}
      </span>
      {canRemove ? (
        <form action={formAction} className="flex flex-col items-start gap-1">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="roleId" value={role.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {t("unassignRole")}
          </Button>
          <ActionResult state={state} successMessage={t("saved")} />
        </form>
      ) : null}
    </li>
  );
}

export function RoleAssignment({
  userId,
  assigned,
  available,
  canAssignOwner,
}: {
  userId: string;
  assigned: AssignableRole[];
  available: AssignableRole[];
  canAssignOwner: boolean;
}) {
  const t = useTranslations("users.detail");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(assignRoleAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const selectable = available.filter((role) => role.key !== "owner" || canAssignOwner);

  return (
    <div className="space-y-4">
      {assigned.length > 0 ? (
        <ul className="space-y-2">
          {assigned.map((role) => (
            <UnassignRoleForm
              key={role.id}
              userId={userId}
              role={role}
              canAssignOwner={canAssignOwner}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noRoles")}</p>
      )}

      {selectable.length > 0 ? (
        <form action={formAction} className="space-y-2">
          <Label htmlFor={`assign-role-${userId}`}>{t("assignRoleLabel")}</Label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`assign-role-${userId}`}
              name="roleId"
              defaultValue=""
              required
              className="h-10 min-w-48 flex-1 rounded-md border bg-surface px-3 text-sm text-foreground"
            >
              <option value="" disabled>
                {t("assignRolePlaceholder")}
              </option>
              {selectable.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" disabled={pending}>
              {t("assignRoleSubmit")}
            </Button>
          </div>
          <ActionResult state={state} successMessage={t("saved")} />
        </form>
      ) : null}
    </div>
  );
}
