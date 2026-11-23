import { ImageResponse } from "next/og";
import { getBrandLogo } from "@/core/branding/logo";
import { logger } from "@/core/logging/logger";
import { getStorageAdapter } from "@/core/storage";

export const runtime = "nodejs";
// Read the current FileAsset on every request; never bake the favicon at build.
export const dynamic = "force-dynamic";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Browsers revalidate immediately; shared caches hold a short copy. Uploads
// also call revalidatePath("/", "layout") for instant replacement.
const cacheControl = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export default async function Icon(): Promise<Response> {
  try {
    const logo = await getBrandLogo();
    if (logo) {
      const stored = await getStorageAdapter().get(logo.asset.storageKey);
      if (stored) {
        return new Response(new Uint8Array(stored.body), {
          status: 200,
          headers: {
            "Content-Type": stored.contentType,
            "Content-Length": String(stored.body.length),
            "Cache-Control": cacheControl,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
  } catch (error: unknown) {
    logger.warn("Dynamic favicon lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1f6a55",
        color: "#ffffff",
        fontFamily: "monospace",
        fontSize: 26,
        fontWeight: 700,
        borderRadius: 8,
      }}
    >
      MB
    </div>,
    { ...size, headers: { "Cache-Control": cacheControl } },
  );
}
