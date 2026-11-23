import { logger } from "@/core/logging/logger";
import { entitlementsForPlan, normalizePlan, type EntitlementKey, type PlanKey } from "./plans";

/** Single-tenant sentinel shared with RBAC, settings, and audit writes. */
const WORKSPACE_ID = "";
const LICENSE_CACHE_TAG = "license";
const LICENSE_REVALIDATE_SECONDS = 300;

export type Entitlements = {
  plan: PlanKey;
  keys: readonly EntitlementKey[];
  has(key: EntitlementKey): boolean;
  hasAll(keys: readonly EntitlementKey[]): boolean;
};

/** Pure projection of a plan into the entitlement seam. */
export function entitlementsFromPlan(plan: PlanKey): Entitlements {
  const keys = entitlementsForPlan(plan);
  const keySet: ReadonlySet<string> = new Set<string>(keys);
  return {
    plan,
    keys,
    has: (key) => keySet.has(key),
    hasAll: (requested) => requested.every((key) => keySet.has(key)),
  };
}

type LicenseRow = {
  plan: string;
  // Persisted JSON is informational; the plan mapping is always authoritative.
  entitlements: unknown;
  validUntil: Date | string | null;
};

type LicenseDelegate = {
  findFirst(args: { where: { workspaceId: string } }): Promise<LicenseRow | null>;
};

function logFailure(message: string, error: unknown): void {
  logger.warn(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

/** The only Prisma access point for license state. Never throws. */
async function readLicenseRow(): Promise<LicenseRow | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const delegate = (prisma as unknown as { license?: LicenseDelegate }).license;
    if (!delegate || typeof delegate.findFirst !== "function") return null;
    return await delegate.findFirst({ where: { workspaceId: WORKSPACE_ID } });
  } catch (error: unknown) {
    logFailure("License lookup failed; using free entitlements", error);
    return null;
  }
}

async function readPlanFromDatabase(): Promise<PlanKey> {
  const row = await readLicenseRow();
  if (!row) return "free";

  if (row.validUntil) {
    const expiresAt =
      row.validUntil instanceof Date
        ? row.validUntil.getTime()
        : Date.parse(String(row.validUntil));
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "free";
  }

  return normalizePlan(row.plan);
}

let cachedPlanReader: (() => Promise<PlanKey>) | null = null;

async function getCachedPlanReader(): Promise<() => Promise<PlanKey>> {
  if (cachedPlanReader) return cachedPlanReader;
  const { unstable_cache } = await import("next/cache");
  // Only the plan is cached: the returned object carries methods that do not
  // survive cache serialization and is reconstructed on every call.
  cachedPlanReader = unstable_cache(readPlanFromDatabase, ["license", "plan"], {
    tags: [LICENSE_CACHE_TAG],
    revalidate: LICENSE_REVALIDATE_SECONDS,
  });
  return cachedPlanReader;
}

async function cacheReadsEnabled(): Promise<boolean> {
  try {
    const { getCacheReadsEnabled } = await import("@/core/settings/service");
    return await getCacheReadsEnabled();
  } catch (error: unknown) {
    logFailure("Cache setting read failed; reading entitlements directly", error);
    return false;
  }
}

/**
 * The single entitlement seam. All pages, actions, and API handlers must
 * consult this function instead of reading the License row directly.
 */
export async function getEntitlements(): Promise<Entitlements> {
  let plan: PlanKey = "free";
  try {
    const useCache = await cacheReadsEnabled();
    plan = useCache ? await (await getCachedPlanReader())() : await readPlanFromDatabase();
  } catch (error: unknown) {
    logFailure("Entitlement read failed; using free plan", error);
    plan = "free";
  }
  return entitlementsFromPlan(plan);
}

/** Invalidates the tagged plan snapshot after a license mutation. */
export async function invalidateEntitlements(): Promise<void> {
  try {
    const { revalidateTag } = await import("next/cache");
    const revalidate: unknown = revalidateTag;
    if (typeof revalidate !== "function") return;
    try {
      // Expire immediately so the very next request observes the new plan;
      // "max" would allow stale-while-revalidate reads of old entitlements.
      (revalidate as (tag: string, profile: { expire: number }) => void)(LICENSE_CACHE_TAG, {
        expire: 0,
      });
    } catch {
      // Compatibility with the older single-argument signature.
      (revalidate as (tag: string) => void)(LICENSE_CACHE_TAG);
    }
  } catch (error: unknown) {
    logFailure("Entitlement cache invalidation failed", error);
  }
}
