import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSettingValue } = vi.hoisted(() => ({ getSettingValue: vi.fn() }));

vi.mock("@/core/settings/service", () => ({ getSettingValue }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getAuditRetention, getAuditRetentionCutoff } from "@/core/audit/retention";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audit retention", () => {
  it("reads the runtime setting and computes a cutoff", async () => {
    getSettingValue.mockResolvedValue(30);

    await expect(getAuditRetention()).resolves.toBe(30);
    expect(getSettingValue).toHaveBeenCalledWith("audit.retentionDays");

    const cutoff = await getAuditRetentionCutoff(new Date("2026-01-31T00:00:00.000Z"));
    expect(cutoff?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("disables purging when the setting is zero", async () => {
    getSettingValue.mockResolvedValue(0);
    await expect(getAuditRetentionCutoff()).resolves.toBeNull();
  });
});
