import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  settingFindUnique,
  settingFindMany,
  settingCreateMany,
  transaction,
  tx,
  txSettingFindUnique,
  txSettingUpsert,
  auditLog,
  revalidateTag,
  revalidatePath,
  loggerWarn,
} = vi.hoisted(() => {
  const tx = {
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    settingFindUnique: vi.fn(),
    settingFindMany: vi.fn(),
    settingCreateMany: vi.fn(),
    transaction: vi.fn(),
    tx,
    txSettingFindUnique: tx.setting.findUnique,
    txSettingUpsert: tx.setting.upsert,
    auditLog: vi.fn(),
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag,
  revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: settingFindUnique,
      findMany: settingFindMany,
      createMany: settingCreateMany,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/core/audit/audit", () => ({
  audit: { log: auditLog },
  auditActions: { settingsUpdated: "settings.updated" },
}));

vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn },
}));

import { env } from "@/core/config/env";
import { settingKeys } from "@/core/settings/registry";
import {
  ensureDefaultSettings,
  getAllSettings,
  getCacheReadsEnabled,
  getSettingValue,
  updateSettings,
} from "@/core/settings/service";

const actor = { userId: "user_1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  settingFindMany.mockResolvedValue([]);
  settingFindUnique.mockResolvedValue(null);
  settingCreateMany.mockResolvedValue({ count: settingKeys.length });
  txSettingFindUnique.mockResolvedValue(null);
  txSettingUpsert.mockResolvedValue({});
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
});

describe("settings service", () => {
  it("returns the registry default when no row exists", async () => {
    await expect(getSettingValue("site.name")).resolves.toBe("Modubex");
    await expect(getCacheReadsEnabled()).resolves.toBe(true);
  });

  it("reads Prisma directly when cacheReads is disabled", async () => {
    settingFindMany.mockResolvedValue([
      { key: "performance.cacheReads", value: false },
      { key: "site.name", value: "Cached name" },
    ]);
    settingFindUnique.mockResolvedValue({ value: "Direct name" });

    await expect(getSettingValue("site.name")).resolves.toBe("Direct name");
    expect(settingFindUnique).toHaveBeenCalledWith({
      where: { key: "site.name" },
      select: { value: true },
    });
  });

  it("returns defaults when the database is unavailable", async () => {
    settingFindMany.mockRejectedValue(new Error("offline"));
    settingFindUnique.mockRejectedValue(new Error("offline"));

    await expect(getSettingValue("audit.retentionDays")).resolves.toBe(env.AUDIT_RETENTION_DAYS);
    expect(loggerWarn).toHaveBeenCalled();
  });

  it("merges stored rows with defaults for a full snapshot", async () => {
    settingFindMany.mockResolvedValue([{ key: "site.name", value: "Acme" }]);

    const values = await getAllSettings();
    expect(Object.keys(values)).toEqual(settingKeys);
    expect(values["site.name"]).toBe("Acme");
    expect(values["seo.titleSuffix"]).toBe("Modubex");
  });

  it("seeds defaults with create-only upserts", async () => {
    await expect(ensureDefaultSettings()).resolves.toBe(settingKeys.length);
    expect(settingCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({ key: "site.name", value: "Modubex", workspaceId: "" }),
        ]),
      }),
    );
  });

  it("validates, audits, and revalidates an update", async () => {
    txSettingFindUnique.mockResolvedValue({ value: "Modubex" });

    await updateSettings({ "site.name": "Acme" }, actor);

    expect(txSettingUpsert).toHaveBeenCalledWith({
      where: { key: "site.name" },
      create: {
        key: "site.name",
        value: "Acme",
        workspaceId: "",
        updatedById: "user_1",
      },
      update: { value: "Acme", updatedById: "user_1" },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.updated",
        before: { "site.name": "Modubex" },
        after: { "site.name": "Acme" },
        strict: true,
        client: tx,
      }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("settings", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/audit");
  });

  it("rejects invalid values and read-only infrastructure keys", async () => {
    await expect(updateSettings({ "audit.retentionDays": -1 }, actor)).rejects.toThrow();
    await expect(
      updateSettings({ "infrastructure.authSecret": "secret" } as never, actor),
    ).rejects.toThrow(/read-only/);
    await expect(updateSettings({ "not.a.key": "x" } as never, actor)).rejects.toThrow(
      /Unknown setting key/,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
