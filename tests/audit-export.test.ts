import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, auditLog, findMany, PermissionDeniedErrorMock } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  auditLog: vi.fn(),
  findMany: vi.fn(),
  PermissionDeniedErrorMock: class PermissionDeniedError extends Error {
    readonly permission: string;

    constructor(permission: string) {
      super(`Missing required permission: ${permission}`);
      this.name = "PermissionDeniedError";
      this.permission = permission;
    }
  },
}));

vi.mock("@/core/auth/dal", () => ({
  requirePermission,
  PermissionDeniedError: PermissionDeniedErrorMock,
}));

vi.mock("@/core/audit", () => ({
  audit: { log: auditLog },
  auditActions: { auditExported: "audit.exported" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { findMany } },
}));

import { GET } from "@/app/api/audit/export/route";

const session = { user: { id: "user-1", email: "owner@example.com" } };

beforeEach(() => {
  requirePermission.mockReset();
  auditLog.mockReset();
  findMany.mockReset();
  requirePermission.mockResolvedValue({ session, permissionKeys: ["audit.export"] });
  auditLog.mockResolvedValue(undefined);
  findMany.mockResolvedValue([]);
});

describe("audit CSV export", () => {
  it("returns 403 JSON when the permission is denied", async () => {
    requirePermission.mockRejectedValueOnce(new PermissionDeniedErrorMock("audit.export"));

    const response = await GET(new Request("http://localhost/api/audit/export"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You do not have permission to perform this action.",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid date filters with 400", async () => {
    const response = await GET(new Request("http://localhost/api/audit/export?from=not-a-date"));

    expect(response.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("exports quoted CSV, neutralizes formulas, and writes a strict audit entry", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "log-1",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        action: "=SUM(A1)",
        userId: "user-1",
        email: "owner@example.com",
        module: "core",
        targetType: "role",
        targetId: "role-1",
        before: null,
        after: { note: 'a,b"c' },
        metadata: { rowCount: 1 },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/audit/export?action=roles.created&from=2026-01-01"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="audit-log.csv"',
    );
    expect(response.headers.get("content-type")).toContain("text/csv");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('""note""');
    expect(csv).toContain('""note"":""a,b\\""c""');
    expect(csv).toContain("\r\n");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 10_000,
        where: expect.objectContaining({
          action: "roles.created",
          createdAt: expect.objectContaining({ gte: new Date("2026-01-01T00:00:00.000Z") }),
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.exported",
        strict: true,
        targetType: "audit_export",
        metadata: expect.objectContaining({ rowCount: 1 }),
      }),
    );
  });
});
