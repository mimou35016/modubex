import { logger } from "@/core/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe: only verifies that the database is reachable. */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    logger.error("Health check database probe failed");
    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", database: "ok", timestamp: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
