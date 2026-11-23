import { z } from "zod";
import { getCurrentPermissionKeys, getSession } from "@/core/auth/dal";
import { canReadFileAsset } from "@/core/files/authorization";
import { getFileAsset, type FileAssetView } from "@/core/files/service";
import { logger } from "@/core/logging/logger";
import { getStorageAdapter } from "@/core/storage";

export const runtime = "nodejs";

// Explicit props: CI typechecks before Next generates RouteContext types.
type RouteContext = { params: Promise<{ id: string }> };

// Ids are opaque cuid/uuid-like tokens; rejecting separators and dots keeps
// path-shaped input out of the lookup entirely.
const assetIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid asset id");

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Serves stored bytes by opaque asset id only. Raw storage keys never appear
 * in URLs, so path traversal and key guessing are not possible here.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const parsedId = assetIdSchema.safeParse(id);
  if (!parsedId.success) return notFound();

  let asset: FileAssetView | null;
  try {
    asset = await getFileAsset(parsedId.data);
  } catch (error: unknown) {
    logger.error("File asset lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Unable to load this file.", 500);
  }
  if (!asset) return notFound();

  if (asset.purpose === "avatar") {
    let session: Awaited<ReturnType<typeof getSession>>;
    let permissionKeys: readonly string[];
    try {
      session = await getSession();
      if (!session) return errorResponse("Authentication required.", 401);
      permissionKeys = await getCurrentPermissionKeys();
    } catch (error: unknown) {
      logger.error("File authorization failed", {
        assetId: asset.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResponse("Unable to authorize this request.", 500);
    }

    if (!canReadFileAsset(asset, { id: session.user.id, permissionKeys })) {
      return errorResponse("You do not have permission to view this file.", 403);
    }
  }

  // Site logos are public branding; every other purpose is gated above.
  try {
    const stored = await getStorageAdapter().get(asset.storageKey);
    if (!stored) return notFound();

    return new Response(new Uint8Array(stored.body), {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(stored.body.length),
        "Content-Disposition": "inline",
        "Cache-Control": asset.purpose === "avatar" ? "private, no-store" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    logger.error("File serving failed", {
      assetId: asset.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Unable to load this file.", 500);
  }
}
