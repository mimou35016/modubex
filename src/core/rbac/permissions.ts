import { z } from "zod";

/**
 * Core permission keys. Module manifests add their own prefixed keys in M4;
 * this catalog stays the authoritative source for the built-in permission set.
 */
export const corePermissionKeys = [
  "app.access",
  "users.read",
  "users.invite",
  "users.update",
  "users.sessions.read",
  "roles.read",
  "roles.manage",
  "roles.assign_owner",
  "audit.read",
  "audit.export",
  "audit.manage",
  "settings.read",
  "settings.update",
  "license.read",
  "license.manage",
  "modules.read",
  "modules.manage",
] as const;

export type PermissionKey = (typeof corePermissionKeys)[number];

/** Reserved for the Owner bundle; custom role definitions must never include it. */
export const ownerAssignmentPermissionKey: PermissionKey = "roles.assign_owner";

export function isCustomRolePermissionKey(key: string): boolean {
  return key !== ownerAssignmentPermissionKey;
}

export const permissionKeySchema = z.enum(corePermissionKeys);

export type PermissionDescriptor = {
  key: PermissionKey;
  description: string;
  module: string;
};

export const permissionCatalog: ReadonlyArray<PermissionDescriptor> = [
  { key: "app.access", description: "Sign in and use the application shell.", module: "core" },
  { key: "users.read", description: "View users and their account details.", module: "core" },
  { key: "users.invite", description: "Invite new users to the workspace.", module: "core" },
  { key: "users.update", description: "Edit user profiles and activation state.", module: "core" },
  {
    key: "users.sessions.read",
    description: "View active sessions belonging to users.",
    module: "core",
  },
  {
    key: "roles.read",
    description: "View roles and their permission assignments.",
    module: "core",
  },
  { key: "roles.manage", description: "Create, update, and delete custom roles.", module: "core" },
  {
    key: "roles.assign_owner",
    description: "Assign or remove the Owner system role.",
    module: "core",
  },
  { key: "audit.read", description: "View audit log entries.", module: "core" },
  { key: "audit.export", description: "Export audit log entries to CSV.", module: "core" },
  {
    key: "audit.manage",
    description: "Configure audit retention and run retention purges.",
    module: "core",
  },
  { key: "settings.read", description: "View runtime application settings.", module: "core" },
  { key: "settings.update", description: "Change runtime application settings.", module: "core" },
  { key: "license.read", description: "View the current plan and entitlements.", module: "core" },
  { key: "license.manage", description: "Change the plan or license key.", module: "core" },
  { key: "modules.read", description: "Browse available and installed modules.", module: "core" },
  {
    key: "modules.manage",
    description: "Install, configure, enable, and disable modules.",
    module: "core",
  },
] as const;

const permissionKeySet: ReadonlySet<string> = new Set<string>(corePermissionKeys);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeySet.has(value);
}

export const systemRoleKeys = ["owner", "admin", "member"] as const;
export type SystemRoleKey = (typeof systemRoleKeys)[number];

const ownerPermissions: readonly PermissionKey[] = corePermissionKeys;
const adminPermissions: readonly PermissionKey[] = corePermissionKeys.filter(
  (key): key is PermissionKey => isCustomRolePermissionKey(key),
);
const memberPermissions: readonly PermissionKey[] = ["app.access"];

/**
 * Default permission bundles for the locked system roles. These are applied by
 * the seed and migration, but the database remains authoritative at runtime.
 */
export function systemRolePermissions(role: SystemRoleKey): readonly PermissionKey[] {
  switch (role) {
    case "owner":
      return ownerPermissions;
    case "admin":
      return adminPermissions;
    case "member":
      return memberPermissions;
  }
}

export function isSystemRoleKey(value: string): value is SystemRoleKey {
  return (systemRoleKeys as readonly string[]).includes(value);
}

/** Metadata used when a permission row has to be created on demand. */
export function permissionDescriptor(key: string): PermissionDescriptor | undefined {
  return permissionCatalog.find((item) => item.key === key);
}

/** Raised by authorization guards when a session lacks a required permission. */
export class PermissionDeniedError extends Error {
  readonly permission: string;

  constructor(permission: string) {
    super(`Missing required permission: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}
