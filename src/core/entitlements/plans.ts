import { z } from "zod";

/** Plan identifiers are stable strings persisted in the License row. */
export const planKeys = ["free", "pro", "enterprise"] as const;
export type PlanKey = (typeof planKeys)[number];
export const planSchema = z.enum(planKeys);

/** Stable entitlement vocabulary shared by guards, plans, and module manifests. */
export const entitlementKeys = [
  "core.access",
  "users.management",
  "roles.custom",
  "audit.viewer",
  "audit.export",
  "settings.basic",
  "settings.advancedPerformance",
  "modules.store",
  "modules.premium",
] as const;
export type EntitlementKey = (typeof entitlementKeys)[number];
export const entitlementSchema = z.enum(entitlementKeys);

const freePlanEntitlements = [
  "core.access",
  "users.management",
  "roles.custom",
  "audit.viewer",
  "settings.basic",
] as const satisfies readonly EntitlementKey[];

const proPlanEntitlements = [
  ...freePlanEntitlements,
  "audit.export",
  "settings.advancedPerformance",
  "modules.store",
] as const satisfies readonly EntitlementKey[];

const enterprisePlanEntitlements = [
  ...proPlanEntitlements,
  "modules.premium",
] as const satisfies readonly EntitlementKey[];

/**
 * Plan mapping is authoritative. A persisted JSON snapshot is informational
 * only and can never grant a key that the plan itself does not include.
 */
export const planEntitlements: Record<PlanKey, readonly EntitlementKey[]> = {
  free: freePlanEntitlements,
  pro: proPlanEntitlements,
  enterprise: enterprisePlanEntitlements,
};

const planKeySet: ReadonlySet<string> = new Set<string>(planKeys);
const entitlementKeySet: ReadonlySet<string> = new Set<string>(entitlementKeys);

export function entitlementsForPlan(plan: PlanKey): readonly EntitlementKey[] {
  return planEntitlements[plan] ?? freePlanEntitlements;
}

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === "string" && entitlementKeySet.has(value);
}

/** Unknown or malformed values always degrade to the restrictive Free plan. */
export function normalizePlan(value: unknown): PlanKey {
  if (typeof value !== "string") return "free";
  const candidate = value.trim().toLowerCase();
  return planKeySet.has(candidate) ? (candidate as PlanKey) : "free";
}
