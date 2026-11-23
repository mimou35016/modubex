import { describe, expect, it } from "vitest";
import {
  assertEntitlement,
  EntitlementDeniedError,
  hasEntitlement,
} from "@/core/entitlements/guards";
import {
  entitlementsForPlan,
  entitlementKeys,
  isEntitlementKey,
  normalizePlan,
  planEntitlements,
  planKeys,
} from "@/core/entitlements/plans";
import { entitlementsFromPlan } from "@/core/entitlements/service";

describe("plan entitlement mapping", () => {
  it("uses cumulative plans in free -> pro -> enterprise order", () => {
    expect(planKeys).toEqual(["free", "pro", "enterprise"]);
    expect(planEntitlements.free).toEqual([
      "core.access",
      "users.management",
      "roles.custom",
      "audit.viewer",
      "settings.basic",
    ]);
    expect(planEntitlements.pro).toEqual([
      ...planEntitlements.free,
      "audit.export",
      "settings.advancedPerformance",
      "modules.store",
    ]);
    expect(planEntitlements.enterprise).toEqual([...planEntitlements.pro, "modules.premium"]);
  });

  it("keeps the entitlement vocabulary stable and recognized", () => {
    expect(entitlementKeys).toHaveLength(9);
    for (const plan of planKeys) {
      for (const key of entitlementsForPlan(plan)) {
        expect(isEntitlementKey(key)).toBe(true);
      }
    }
    expect(isEntitlementKey("modules.unknown")).toBe(false);
    expect(isEntitlementKey(undefined)).toBe(false);
  });

  it("defaults unknown plans to free", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("enterprise")).toBe("enterprise");
    expect(normalizePlan("unknown")).toBe("free");
    expect(normalizePlan("")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(42)).toBe("free");
  });
});

describe("entitlementsFromPlan", () => {
  it("exposes the plan keys and membership helpers", () => {
    const free = entitlementsFromPlan("free");
    expect(free.plan).toBe("free");
    expect(free.keys).toEqual(planEntitlements.free);
    expect(free.has("core.access")).toBe(true);
    expect(free.has("audit.export")).toBe(false);
    expect(free.hasAll(["core.access", "settings.basic"])).toBe(true);
    expect(free.hasAll(["core.access", "audit.export"])).toBe(false);
    expect(free.hasAll([])).toBe(true);
  });

  it("grants progressively more with paid plans", () => {
    const pro = entitlementsFromPlan("pro");
    const enterprise = entitlementsFromPlan("enterprise");
    expect(pro.hasAll(["audit.export", "modules.store"])).toBe(true);
    expect(pro.has("modules.premium")).toBe(false);
    expect(enterprise.hasAll([...planEntitlements.pro, "modules.premium"])).toBe(true);
  });
});

describe("entitlement guards", () => {
  it("returns hasEntitlement for the provided snapshot", () => {
    expect(hasEntitlement(entitlementsFromPlan("free"), "users.management")).toBe(true);
    expect(hasEntitlement(entitlementsFromPlan("free"), "modules.store")).toBe(false);
  });

  it("throws a typed error when an entitlement is missing", () => {
    const free = entitlementsFromPlan("free");
    expect(() => assertEntitlement(free, "modules.store")).toThrow(EntitlementDeniedError);
    try {
      assertEntitlement(free, "modules.store");
    } catch (error) {
      expect(error).toBeInstanceOf(EntitlementDeniedError);
      expect((error as EntitlementDeniedError).entitlement).toBe("modules.store");
    }
  });

  it("does not throw when the entitlement is present", () => {
    expect(() => assertEntitlement(entitlementsFromPlan("pro"), "modules.store")).not.toThrow();
  });
});
