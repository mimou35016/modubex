import { describe, expect, it } from "vitest";
import {
  corePermissionKeys,
  isPermissionKey,
  permissionCatalog,
  permissionKeySchema,
  permissionKeys,
  systemRolePermissions,
} from "@/core/rbac/permissions";
import { systemRolePermissionDiff } from "@/core/rbac/service";

describe("permission catalog", () => {
  it("has unique, well-formed core keys", () => {
    expect(new Set(corePermissionKeys).size).toBe(corePermissionKeys.length);
    for (const key of corePermissionKeys) {
      expect(key).toMatch(/^[a-z][a-z0-9_.-]*$/);
      expect(permissionKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("matches the aggregated catalog to the aggregated key list", () => {
    expect(permissionCatalog.map((item) => item.key)).toEqual([...permissionKeys]);
    expect(new Set(permissionKeys).size).toBe(permissionKeys.length);
    for (const item of permissionCatalog) {
      expect(item.module.length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(10);
      const isCore = (corePermissionKeys as readonly string[]).includes(item.key);
      if (isCore) {
        expect(item.module).toBe("core");
      } else {
        expect(item.key.startsWith(`${item.module}.`)).toBe(true);
      }
    }
  });

  it("exposes a working key guard for the aggregate catalog", () => {
    expect(isPermissionKey("roles.manage")).toBe(true);
    expect(isPermissionKey("roles.assign_owner")).toBe(true);
    expect(isPermissionKey("roles.delete")).toBe(false);
    for (const key of permissionKeys) expect(isPermissionKey(key)).toBe(true);
  });

  it("aggregates module descriptors into the catalog and system role bundles", () => {
    const moduleDescriptors = permissionCatalog.filter((item) => item.module !== "core");
    for (const descriptor of moduleDescriptors) {
      expect(permissionKeySchema.safeParse(descriptor.key).success).toBe(true);
      expect(systemRolePermissions("owner")).toContain(descriptor.key);
      expect(systemRolePermissions("admin")).toContain(descriptor.key);
      expect(systemRolePermissions("member")).not.toContain(descriptor.key);
    }
  });
});

describe("system role permission bundles", () => {
  it("gives Owner every aggregated permission", () => {
    expect(systemRolePermissions("owner")).toEqual([...permissionKeys]);
  });

  it("gives Admin everything except Owner assignment", () => {
    expect(systemRolePermissions("admin")).toEqual(
      permissionKeys.filter((key) => key !== "roles.assign_owner"),
    );
  });

  it("gives Member only application access", () => {
    expect(systemRolePermissions("member")).toEqual(["app.access"]);
  });

  it("removes an over-granted Owner permission from Admin but keeps it on Owner", () => {
    const overGranted = [...permissionKeys];
    const adminDiff = systemRolePermissionDiff("admin", overGranted);
    expect(adminDiff.toAdd).toEqual([]);
    expect(adminDiff.toRemove).toEqual(["roles.assign_owner"]);

    const ownerDiff = systemRolePermissionDiff("owner", overGranted);
    expect(ownerDiff.toAdd).toEqual([]);
    expect(ownerDiff.toRemove).toEqual([]);
  });

  it("reports no changes when system role grants already match their bundles", () => {
    for (const role of ["owner", "admin", "member"] as const) {
      expect(systemRolePermissionDiff(role, systemRolePermissions(role))).toEqual({
        toAdd: [],
        toRemove: [],
      });
    }
  });
});
