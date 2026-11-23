import type { EntitlementKey } from "./plans";
import type { Entitlements } from "./service";

export class EntitlementDeniedError extends Error {
  readonly entitlement: EntitlementKey;

  constructor(entitlement: EntitlementKey) {
    super(`Missing entitlement: ${entitlement}`);
    this.name = "EntitlementDeniedError";
    this.entitlement = entitlement;
  }
}

export function hasEntitlement(entitlements: Entitlements, key: EntitlementKey): boolean {
  return entitlements.has(key);
}

export function assertEntitlement(entitlements: Entitlements, key: EntitlementKey): void {
  if (!hasEntitlement(entitlements, key)) throw new EntitlementDeniedError(key);
}

/** Guard for server actions and API handlers. */
export async function requireEntitlement(key: EntitlementKey): Promise<Entitlements> {
  const { getEntitlements } = await import("./service");
  const entitlements = await getEntitlements();
  assertEntitlement(entitlements, key);
  return entitlements;
}

/** Guard for pages: redirects to /forbidden when the entitlement is missing. */
export async function requirePageEntitlement(key: EntitlementKey): Promise<Entitlements> {
  const { getEntitlements } = await import("./service");
  const entitlements = await getEntitlements();
  if (!hasEntitlement(entitlements, key)) {
    // `redirect` throws its NEXT_REDIRECT error; let it propagate unchanged.
    const { redirect } = await import("next/navigation");
    redirect("/forbidden");
  }
  return entitlements;
}

/**
 * M3 has no module store yet; M4 must call this seam before any module
 * install or enable action so entitlement checks stay centralized.
 */
export async function requireModuleInstallEntitlement(): Promise<Entitlements> {
  return requireEntitlement("modules.store");
}
