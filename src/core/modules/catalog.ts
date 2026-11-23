import type { PermissionDescriptor } from "@/core/rbac/permissions";
import { getModuleManifests } from "./registry";

/** Module permission descriptors in the same shape as the core catalog. */
export const modulePermissionDescriptors: ReadonlyArray<PermissionDescriptor> =
  getModuleManifests().flatMap((manifest) =>
    manifest.permissions.map((permission) => ({
      key: permission.key,
      description: permission.description,
      module: manifest.id,
    })),
  );
