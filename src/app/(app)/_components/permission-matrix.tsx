"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

export type CatalogPermission = {
  key: string;
  description: string;
  module: string;
};

type Props = {
  permissions: readonly CatalogPermission[];
  selected?: readonly string[];
  /** Omit for a read-only matrix; provide a form field name to make the checkboxes submit. */
  name?: string;
  idPrefix: string;
};

export function PermissionMatrix({ permissions, selected = [], name, idPrefix }: Props) {
  const t = useTranslations("rbac");
  const selectedKeys = useMemo(() => new Set(selected), [selected]);
  const groups = useMemo(() => {
    const grouped = new Map<string, CatalogPermission[]>();
    for (const permission of permissions) {
      const list = grouped.get(permission.module) ?? [];
      list.push(permission);
      grouped.set(permission.module, list);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [permissions]);

  if (permissions.length === 0) {
    return <Alert tone="info">{t("noPermissions")}</Alert>;
  }

  const readOnly = name === undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([module, entries]) => (
        <fieldset key={module} className="rounded-md border px-4 py-3">
          <legend className="px-1 font-mono text-[11px] text-muted" dir="ltr">
            {module}
          </legend>
          <ul className="space-y-3">
            {entries.map((permission) => {
              const id = `${idPrefix}-${permission.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              return (
                <li key={permission.key} className="flex items-start gap-2.5">
                  <input
                    id={id}
                    type="checkbox"
                    name={name}
                    value={permission.key}
                    {...(readOnly
                      ? {
                          checked: selectedKeys.has(permission.key),
                          readOnly: true,
                          disabled: true,
                        }
                      : { defaultChecked: selectedKeys.has(permission.key) })}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <label htmlFor={id} className="min-w-0 cursor-pointer text-xs leading-5">
                    <span className="font-mono" dir="ltr">
                      {permission.key}
                    </span>
                    <span className="block text-muted">{permission.description}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
