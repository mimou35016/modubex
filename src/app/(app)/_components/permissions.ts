import type { PermissionKey } from "@/core/rbac/permissions";

export type PermissionKeys = readonly PermissionKey[];

export function hasPermission(keys: PermissionKeys, key: PermissionKey): boolean {
  return keys.includes(key);
}
