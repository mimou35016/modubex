"use client";

import { useCallback, useMemo, useState } from "react";
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

type MatrixCell = {
  key: string;
  label: string;
};

/**
 * A permission key maps to one cell: everything before the final dot is the
 * row (joined with " / " for nested resources), the final segment is the
 * action column. e.g. `users.sessions.read` -> row `users / sessions`,
 * column `read`; `roles.assign_owner` -> row `roles`, column `assign_owner`.
 */
function splitKey(key: string): { row: string; action: string } {
  const segments = key.split(".").filter(Boolean);
  const action = segments.length > 0 ? (segments[segments.length - 1] ?? key) : key;
  const row = segments.length > 1 ? segments.slice(0, -1).join(" / ") : key;
  return { row, action };
}

export function PermissionMatrix({ permissions, selected = [], name, idPrefix }: Props) {
  const t = useTranslations("rbac");
  const selectedKeys = useMemo(() => new Set(selected), [selected]);

  // A stable signature avoids resetting local edits when a parent re-renders
  // with a fresh (but equivalent) `selected` array. Prop changes that really
  // do change the selection are synchronized during render (no effect needed).
  const selectedSignature = useMemo(() => [...selected].sort().join("\u0000"), [selected]);
  const [selection, setSelection] = useState<{ signature: string; keys: Set<string> }>(() => ({
    signature: selectedSignature,
    keys: new Set(selected),
  }));

  if (selection.signature !== selectedSignature) {
    setSelection({
      signature: selectedSignature,
      keys: new Set(selectedSignature ? selectedSignature.split("\u0000") : []),
    });
  }

  const checkedKeys = selection.keys;

  const toggle = useCallback((key: string) => {
    setSelection((current) => {
      const next = new Set(current.keys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { signature: current.signature, keys: next };
    });
  }, []);

  const { rows, actions } = useMemo(() => {
    const rowMap = new Map<string, Map<string, MatrixCell>>();
    const actionSet = new Set<string>();

    for (const permission of permissions) {
      const { row, action } = splitKey(permission.key);
      actionSet.add(action);
      const cells = rowMap.get(row) ?? new Map<string, MatrixCell>();
      cells.set(action, {
        key: permission.key,
        label: permission.description
          ? `${permission.key} — ${permission.description}`
          : permission.key,
      });
      rowMap.set(row, cells);
    }

    return {
      actions: [...actionSet].sort((left, right) => left.localeCompare(right)),
      rows: [...rowMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, cells]) => ({ label, cells })),
    };
  }, [permissions]);

  if (permissions.length === 0) {
    return <Alert tone="info">{t("noPermissions")}</Alert>;
  }

  const readOnly = name === undefined;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table
        className="w-full min-w-[48rem] border-collapse text-xs"
        aria-label={t("permissionsTitle")}
      >
        <thead>
          <tr className="border-b border-border bg-surface text-muted">
            <th scope="col" className="px-3 py-2 text-start font-medium">
              {t("matrix.resource")}
            </th>
            {actions.map((action) => (
              <th
                key={action}
                scope="col"
                className="px-2 py-2 text-center font-mono text-[11px] font-medium"
                dir="ltr"
              >
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-b-0">
              <th
                scope="row"
                className="whitespace-nowrap px-3 py-2 text-start font-mono text-[11px] font-normal"
                dir="ltr"
              >
                {row.label}
              </th>
              {actions.map((action) => {
                const cell = row.cells.get(action);
                if (!cell) {
                  return <td key={action} className="px-2 py-2" />;
                }
                const id = `${idPrefix}-${cell.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <td key={action} className="px-2 py-2 text-center">
                    <label
                      htmlFor={id}
                      title={cell.label}
                      className="inline-flex cursor-pointer items-center justify-center"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        name={name}
                        value={cell.key}
                        {...(readOnly
                          ? {
                              checked: selectedKeys.has(cell.key),
                              readOnly: true,
                              disabled: true,
                            }
                          : {
                              checked: checkedKeys.has(cell.key),
                              onChange: () => toggle(cell.key),
                            })}
                        aria-label={cell.label}
                        className="size-4"
                      />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
