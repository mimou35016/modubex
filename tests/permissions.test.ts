import { describe, expect, it } from "vitest";
import {
  corePermissionKeys,
  isPermissionKey,
  permissionCatalog,
  permissionKeySchema,
  systemRolePermissions,
} from "@/core/rbac/permissions";
import { systemRolePermissionDiff } from "@/core/rbac/service";

describe("core permission catalog", () => {
  it("has unique, well-formed keys", () => {
    expect(new Set(corePermissionKeys).size).toBe(corePermissionKeys.length);
    for (const key of corePermissionKeys) {
      expect(key).toMatch(/^[a-z][a-z0-9_.-]*$/);
      expect(permissionKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("matches the catalog to the key list with real descriptions", () => {
    expect(permissionCatalog.map((item) => item.key)).toEqual([...corePermissionKeys]);
    for (const item of permissionCatalog) {
      expect(item.module).toBe("core");
      expect(item.description.trim().length).toBeGreaterThan(10);
    }
  });

  it("exposes a working key guard", () => {
    expect(isPermissionKey("roles.manage")).toBe(true);
    expect(isPermissionKey("roles.assign_owner")).toBe(true);
    expect(isPermissionKey("roles.delete")).toBe(false);
  });
});

describe("system role permission bundles", () => {
  it("gives Owner every core permission", () => {
    expect(systemRolePermissions("owner")).toEqual([...corePermissionKeys]);
  });

  it("gives Admin everything except Owner assignment", () => {
    expect(systemRolePermissions("admin")).toEqual(
      corePermissionKeys.filter((key) => key !== "roles.assign_owner"),
    );
  });

  it("gives Member only application access", () => {
    expect(systemRolePermissions("member")).toEqual(["app.access"]);
  });

  it("removes an over-granted Owner permission from Admin but keeps it on Owner", () => {
    const overGranted = [...corePermissionKeys];
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
