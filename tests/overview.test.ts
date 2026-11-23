import { beforeEach, describe, expect, it, vi } from "vitest";

const { userCount, sessionCount, auditFindMany } = vi.hoisted(() => ({
  userCount: vi.fn(),
  sessionCount: vi.fn(),
  auditFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: userCount },
    session: { count: sessionCount },
    auditLog: { findMany: auditFindMany },
  },
}));

import { getOverviewData } from "@/core/dashboard/overview";

const createdAt = new Date("2026-11-23T10:00:00.000Z");

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit_1",
    email: "owner@example.com",
    userId: "user_1",
    action: "settings.updated",
    targetType: "setting",
    targetId: "site.name",
    createdAt,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userCount.mockResolvedValue(12);
  sessionCount.mockResolvedValue(4);
  auditFindMany.mockResolvedValue([auditRow()]);
});

describe("getOverviewData", () => {
  it("aggregates live users, non-expired sessions, and the five newest audit entries", async () => {
    const data = await getOverviewData(["users.read", "audit.read"]);

    expect(userCount).toHaveBeenCalledOnce();
    expect(sessionCount).toHaveBeenCalledWith({
      where: { expiresAt: { gt: expect.any(Date) } },
    });
    expect(auditFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        email: true,
        userId: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
    });
    expect(data).toEqual({
      users: { total: 12, activeSessions: 4 },
      audit: {
        entries: [
          {
            id: "audit_1",
            actor: "owner@example.com",
            userId: "user_1",
            action: "settings.updated",
            targetType: "setting",
            targetId: "site.name",
            createdAt,
          },
        ],
      },
    });
  });

  it("omits the user section without users.read and falls back to the audit user id", async () => {
    auditFindMany.mockResolvedValue([
      auditRow({ email: null, userId: "user_2", targetType: null, targetId: null }),
    ]);

    const data = await getOverviewData(["audit.read"]);

    expect(data).not.toHaveProperty("users");
    expect(data.audit?.entries[0]).toMatchObject({
      actor: "user_2",
      userId: "user_2",
      targetType: null,
      targetId: null,
    });
    expect(userCount).not.toHaveBeenCalled();
    expect(sessionCount).not.toHaveBeenCalled();
  });

  it("omits the audit section without audit.read", async () => {
    const data = await getOverviewData(["users.read"]);

    expect(data).toEqual({ users: { total: 12, activeSessions: 4 } });
    expect(data).not.toHaveProperty("audit");
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  it("omits both sections and issues no queries without permissions", async () => {
    const data = await getOverviewData([]);

    expect(data).toEqual({});
    expect(userCount).not.toHaveBeenCalled();
    expect(sessionCount).not.toHaveBeenCalled();
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  it("returns an empty audit list when no audit entries exist", async () => {
    auditFindMany.mockResolvedValue([]);

    const data = await getOverviewData(["audit.read"]);

    expect(data).toEqual({ audit: { entries: [] } });
  });
});
