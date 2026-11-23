import { getSiteLogo, type FileAssetView } from "@/core/files/service";
import { logger } from "@/core/logging/logger";

/**
 * Resolved branding source. `url` is always derived from the current
 * `FileAsset.id`; storage keys never appear in rendered markup.
 */
export type BrandLogo = {
  url: string;
  asset: FileAssetView;
};

/** Pure resolver so shell, auth pages, and the icon route share one mapping. */
export function resolveSiteLogo(asset: FileAssetView | null): BrandLogo | null {
  if (!asset || asset.purpose !== "site-logo" || !asset.id) return null;
  return { url: `/api/files/${asset.id}`, asset };
}

/**
 * Request-time lookup. A failed lookup falls back to the monogram instead of
 * taking down public auth pages when the database is unavailable.
 */
export async function getBrandLogo(): Promise<BrandLogo | null> {
  try {
    return resolveSiteLogo(await getSiteLogo());
  } catch (error: unknown) {
    logger.warn("Site logo lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
