import { describe, expect, it } from "vitest";
import { env } from "@/core/config/env";
import {
  defaultSettingValues,
  getSettingDefault,
  infrastructureRegistry,
  isInfrastructureKey,
  isSettingKey,
  safeParseSettingValue,
  settingCategories,
  settingKeys,
  settingsRegistry,
} from "@/core/settings/registry";

describe("settings registry", () => {
  it("declares the editable keys, categories, and descriptor contract", () => {
    expect(settingCategories).toEqual([
      "site",
      "seo",
      "performance",
      "localization",
      "security",
      "audit",
      "workspace",
      "infrastructure",
    ]);
    expect(settingKeys).toEqual([
      "site.name",
      "site.tagline",
      "seo.description",
      "seo.titleSuffix",
      "performance.cacheReads",
      "localization.defaultLocale",
      "security.passwordMinLength",
      "security.passwordMaxLength",
      "security.requireNumber",
      "security.requireSymbol",
      "security.requireTwoFactor",
      "audit.retentionDays",
      "workspace.timeZone",
    ]);
    expect(settingsRegistry.map((descriptor) => descriptor.key)).toEqual(settingKeys);
    expect(
      settingsRegistry.every(
        (descriptor) =>
          typeof descriptor.label === "string" &&
          descriptor.schema !== undefined &&
          "default" in descriptor &&
          descriptor.infrastructure !== true,
      ),
    ).toBe(true);
    expect(
      settingsRegistry.find((item) => item.key === "performance.cacheReads")?.entitlement,
    ).toBe("settings.advancedPerformance");
  });

  it("keeps env-only infrastructure metadata separate and masked", () => {
    expect(infrastructureRegistry.map((descriptor) => descriptor.key)).toEqual([
      "infrastructure.databaseUrl",
      "infrastructure.authUrl",
      "infrastructure.authSecret",
      "infrastructure.passwordMinBootstrap",
      "infrastructure.auditRetentionBootstrap",
    ]);
    expect(infrastructureRegistry.every((descriptor) => descriptor.infrastructure)).toBe(true);
    expect(
      infrastructureRegistry.every((descriptor) => descriptor.category === "infrastructure"),
    ).toBe(true);
    expect(infrastructureRegistry.find((item) => item.sensitive)?.key).toBe(
      "infrastructure.databaseUrl",
    );
    expect(
      infrastructureRegistry.every(
        (descriptor) => !JSON.stringify(descriptor).includes("postgres"),
      ),
    ).toBe(true);
    expect(isInfrastructureKey("infrastructure.authSecret")).toBe(true);
    expect(isSettingKey("infrastructure.authSecret")).toBe(false);
  });

  it("uses the specified defaults", () => {
    expect(getSettingDefault("site.name")).toBe("Modubex");
    expect(getSettingDefault("site.tagline")).toBe("The foundation for your next product");
    expect(getSettingDefault("seo.description")).toBe("");
    expect(getSettingDefault("seo.titleSuffix")).toBe("Modubex");
    expect(getSettingDefault("performance.cacheReads")).toBe(true);
    expect(getSettingDefault("localization.defaultLocale")).toBe("en");
    expect(getSettingDefault("security.passwordMinLength")).toBe(
      Math.min(128, Math.max(8, env.AUTH_PASSWORD_MIN_LENGTH)),
    );
    expect(getSettingDefault("security.passwordMaxLength")).toBe(
      Math.min(
        256,
        Math.max(getSettingDefault("security.passwordMinLength"), env.AUTH_PASSWORD_MAX_LENGTH),
      ),
    );
    expect(getSettingDefault("security.requireNumber")).toBe(env.AUTH_PASSWORD_REQUIRE_NUMBER);
    expect(getSettingDefault("security.requireSymbol")).toBe(env.AUTH_PASSWORD_REQUIRE_SYMBOL);
    expect(getSettingDefault("security.requireTwoFactor")).toBe(env.AUTH_2FA_REQUIRED);
    expect(getSettingDefault("audit.retentionDays")).toBe(env.AUDIT_RETENTION_DAYS);
    expect(getSettingDefault("workspace.timeZone")).toBe("UTC");
    expect(Object.keys(defaultSettingValues())).toEqual(settingKeys);
  });

  it("validates values with zod descriptors", () => {
    expect(safeParseSettingValue("localization.defaultLocale", "ar").success).toBe(true);
    expect(safeParseSettingValue("localization.defaultLocale", "es").success).toBe(false);

    expect(safeParseSettingValue("security.passwordMinLength", 8).success).toBe(true);
    expect(safeParseSettingValue("security.passwordMinLength", 7).success).toBe(false);
    expect(safeParseSettingValue("security.passwordMinLength", 129).success).toBe(false);
    expect(safeParseSettingValue("security.passwordMaxLength", 256).success).toBe(true);
    expect(safeParseSettingValue("security.passwordMaxLength", 257).success).toBe(false);

    expect(safeParseSettingValue("audit.retentionDays", 0).success).toBe(true);
    expect(safeParseSettingValue("audit.retentionDays", 3650).success).toBe(true);
    expect(safeParseSettingValue("audit.retentionDays", 3651).success).toBe(false);

    expect(safeParseSettingValue("workspace.timeZone", "UTC").success).toBe(true);
    expect(safeParseSettingValue("workspace.timeZone", "America/New_York").success).toBe(true);
    expect(safeParseSettingValue("workspace.timeZone", "Mars/Olympus").success).toBe(false);

    expect(safeParseSettingValue("performance.cacheReads", "false").success).toBe(false);
  });

  it("does not expose an email verification runtime setting", () => {
    expect(settingKeys.some((key) => key.toLowerCase().includes("email"))).toBe(false);
  });
});
