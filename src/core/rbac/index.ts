export {
  PermissionDeniedError,
  corePermissionKeys,
  isPermissionKey,
  isCustomRolePermissionKey,
  isSystemRoleKey,
  ownerAssignmentPermissionKey,
  permissionCatalog,
  permissionDescriptor,
  permissionKeySchema,
  permissionKeys,
  systemRoleKeys,
  systemRolePermissions,
} from "./permissions";
export type {
  CorePermissionKey,
  PermissionDescriptor,
  PermissionKey,
  SystemRoleKey,
} from "./permissions";
export {
  assertNotLastOwnerRemoval,
  assignRole,
  createRole,
  deleteRole,
  revokeSession,
  setUserActive,
  syncSystemRolePermissions,
  systemRolePermissionDiff,
  unassignRole,
  updateRole,
  wouldRemoveLastActiveOwner,
} from "./service";
export type {
  AssignmentInput,
  CreateRoleInput,
  RevokeSessionInput,
  RoleIdInput,
  SetUserActiveInput,
  UpdateRoleInput,
} from "./service";
