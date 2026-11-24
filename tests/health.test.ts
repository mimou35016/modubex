import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, loggerError } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw },
}));

vi.mock("@/core/logging/logger", () => ({
  logger: { error: loggerError },
}));

import { dynamic, GET, runtime } from "@/app/api/health/route";

const SECRET_DSN = "postgresql://health_user:supersecret@db.internal:5432/modubex";

beforeEach(() => {
  queryRaw.mockReset();
  loggerError.mockReset();
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

describe("/api/health", () => {
  it("is a dynamic nodejs route handler", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns ok with a timestamp and no-store when the database responds", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      database: "ok",
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(String(queryRaw.mock.calls[0][0])).toContain("SELECT 1");
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("returns 503 with no-store when the database probe fails", async () => {
    queryRaw.mockRejectedValueOnce(new Error("database offline"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "error", database: "unavailable" });
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("never echoes DSNs, secrets, or raw errors", async () => {
    const error = new Error(`connect ECONNREFUSED to ${SECRET_DSN}`);
    error.stack = `Error: ${SECRET_DSN}\n at probe (/srv/app/health.js:1:1)`;
    queryRaw.mockRejectedValueOnce(error);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "error", database: "unavailable" });
    for (const needle of [
      "supersecret",
      "postgresql://",
      "ECONNREFUSED",
      "at probe",
      "DATABASE_URL",
    ]) {
      expect(body).not.toContain(needle);
    }
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith("Health check database probe failed");
  });
});
