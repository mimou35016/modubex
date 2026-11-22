"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/app/actions/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResult, type ActionState } from "../action-result";
import { PermissionMatrix, type CatalogPermission } from "../permission-matrix";

export type EditableRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
};

const roleInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  permissions: z.array(z.string().min(1)).max(250),
});

function readForm(event: FormEvent<HTMLFormElement>) {
  const data = new FormData(event.currentTarget);
  return {
    key: String(data.get("key") ?? ""),
    name: String(data.get("name") ?? ""),
    description: String(data.get("description") ?? ""),
    permissions: data.getAll("permissions").map(String),
  };
}

function RoleFields({
  catalog,
  role,
  idPrefix,
}: {
  catalog: CatalogPermission[];
  role?: EditableRole;
  idPrefix: string;
}) {
  const t = useTranslations("rbac.fields");
  const p = useTranslations("roles");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-key`}>{t("key")}</Label>
          <Input
            id={`${idPrefix}-key`}
            name="key"
            dir="ltr"
            required
            maxLength={64}
            defaultValue={role?.key ?? ""}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>{t("name")}</Label>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={role?.name ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>{t("description")}</Label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={role?.description ?? ""}
          className="w-full rounded-md border bg-surface px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{p("permissionLabel")}</p>
        <PermissionMatrix
          permissions={catalog}
          selected={role?.permissions ?? []}
          name="permissions"
          idPrefix={`${idPrefix}-permissions`}
        />
      </div>
    </div>
  );
}

export function CreateRoleForm({ catalog }: { catalog: CatalogPermission[] }) {
  const t = useTranslations("roles");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createRoleAction, {});
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invalid ? (
          <p className="text-xs text-red-600 dark:text-red-400">{t("invalidInput")}</p>
        ) : null}
        <form
          action={formAction}
          onSubmit={(event) => {
            setInvalid(false);
            if (!roleInputSchema.safeParse(readForm(event)).success) {
              event.preventDefault();
              setInvalid(true);
            }
          }}
          className="space-y-5"
        >
          <RoleFields catalog={catalog} idPrefix="create-role" />
          <Button type="submit" disabled={pending}>
            {t("createSubmit")}
          </Button>
        </form>
        <ActionResult state={state} successMessage={t("created")} />
      </CardContent>
    </Card>
  );
}

export function EditRoleForm({
  role,
  catalog,
}: {
  role: EditableRole;
  catalog: CatalogPermission[];
}) {
  const t = useTranslations("roles");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateRoleAction, {});
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <details className="group border-t pt-3">
      <summary className="cursor-pointer text-xs font-medium text-accent">{t("edit")}</summary>
      <div className="mt-4 space-y-4">
        {invalid ? (
          <p className="text-xs text-red-600 dark:text-red-400">{t("invalidInput")}</p>
        ) : null}
        <form
          action={formAction}
          onSubmit={(event) => {
            setInvalid(false);
            if (!roleInputSchema.safeParse(readForm(event)).success) {
              event.preventDefault();
              setInvalid(true);
            }
          }}
          className="space-y-5"
        >
          <input type="hidden" name="roleId" value={role.id} />
          <RoleFields role={role} catalog={catalog} idPrefix={`edit-role-${role.id}`} />
          <Button type="submit" variant="outline" disabled={pending}>
            {t("save")}
          </Button>
        </form>
        <ActionResult state={state} successMessage={t("updated")} />
      </div>
    </details>
  );
}

export function DeleteRoleForm({ role }: { role: EditableRole }) {
  const t = useTranslations("roles");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteRoleAction, {});
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="mt-3 border-t pt-3">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="roleId" value={role.id} />
        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4 shrink-0"
          />
          {t("deleteConfirmLabel")}
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={pending || !confirmed}>
          {t("deleteSubmit")}
        </Button>
      </form>
      <ActionResult state={state} successMessage={t("deleted")} />
    </div>
  );
}
