import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  moduleIdSchema,
  moduleManifestSchema,
  modulePermissionKeySchema,
  modulePermissionKeySchemaFor,
  moduleRoutePathSchema,
} from "@/core/modules/manifest";

function baseManifest() {
  return {
    id: "demo",
    name: "Demo module",
    description: "A test module used by the manifest contract tests.",
    version: "1.0.0",
    author: "Modubex tests",
    icon: "puzzle",
    dependencies: [],
    permissions: [{ key: "demo.read", description: "Read demo records." }],
    routes: [
      {
        key: "overview",
        path: "",
        labelKey: "modules.demo.overview",
        sidebar: { labelKey: "modules.demo.nav", icon: "home", order: 1 },
      },
      {
        key: "details",
        path: "details",
        labelKey: "modules.demo.routes.details.label",
        permission: "demo.read",
      },
    ],
    settingsSchema: z.object({ enabled: z.boolean() }),
    ownedModels: ["demoRecord"],
    migrations: ["20261123030000_demo/migration.sql"],
  };
}

describe("module id and permission key schemas", () => {
  it("accepts lowercase hyphenated ids within the length limit", () => {
    expect(moduleIdSchema.safeParse("demo").success).toBe(true);
    expect(moduleIdSchema.safeParse("demo-module-two").success).toBe(true);
    expect(moduleIdSchema.safeParse("a".repeat(60)).success).toBe(true);
  });

  it("rejects malformed ids", () => {
    for (const value of ["", "Demo", "-demo", "demo-", "demo--two", "a".repeat(61)]) {
      expect(moduleIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it("validates dotted permission keys and per-module prefixes", () => {
    expect(modulePermissionKeySchema.safeParse("demo.read").success).toBe(true);
    expect(modulePermissionKeySchema.safeParse("read").success).toBe(false);
    expect(modulePermissionKeySchemaFor("demo").safeParse("other.read").success).toBe(false);
    expect(modulePermissionKeySchemaFor("demo").safeParse("demo.read").success).toBe(true);
  });
});

describe("module route paths", () => {
  it("allows the root path and relative nested paths", () => {
    expect(moduleRoutePathSchema.safeParse("").success).toBe(true);
    expect(moduleRoutePathSchema.safeParse("overview").success).toBe(true);
    expect(moduleRoutePathSchema.safeParse("settings/general").success).toBe(true);
  });

  it("rejects leading or trailing slashes and uppercase segments", () => {
    for (const value of ["/demo", "demo/", "Demo", "//", "a/./b"]) {
      expect(moduleRoutePathSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("module manifest schema", () => {
  it("accepts a complete manifest", () => {
    const result = moduleManifestSchema.safeParse(baseManifest());
    expect(result.success).toBe(true);
  });

  it("accepts optional plan, entitlement, and namespace metadata", () => {
    const result = moduleManifestSchema.safeParse({
      ...baseManifest(),
      requiredPlan: "pro",
      requiredEntitlement: "modules.premium",
      messageNamespace: "demo-space",
    });
    expect(result.success).toBe(true);
  });

  it("rejects permission keys without the module id prefix", () => {
    const manifest = baseManifest();
    manifest.permissions = [{ key: "other.read", description: "Wrong prefix." }];
    expect(moduleManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects invalid versions and non-Zod settings schemas", () => {
    expect(moduleManifestSchema.safeParse({ ...baseManifest(), version: "v1" }).success).toBe(
      false,
    );
    expect(moduleManifestSchema.safeParse({ ...baseManifest(), settingsSchema: {} }).success).toBe(
      false,
    );
  });
});
