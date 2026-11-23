import { beforeEach, describe, expect, it, vi } from "vitest";

const { fileFindFirst, storageGet, loggerWarn } = vi.hoisted(() => ({
  fileFindFirst: vi.fn(),
  storageGet: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { fileAsset: { findFirst: fileFindFirst } },
}));
vi.mock("@/core/storage", () => ({ getStorageAdapter: () => ({ get: storageGet }) }));
vi.mock("@/core/audit/audit", () => ({
  audit: { log: vi.fn() },
  auditActions: { filesUploaded: "files.uploaded", filesDeleted: "files.deleted" },
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn, error: vi.fn(), info: vi.fn() },
}));

import { getBrandLogo, resolveSiteLogo } from "@/core/branding/logo";
import type { FileAssetView } from "@/core/files/service";

const logo: FileAssetView = {
  id: "logo_1",
  storageKey: "site/logo/logo.png",
  purpose: "site-logo",
  contentType: "image/png",
  size: 4,
  ownerId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  fileFindFirst.mockResolvedValue(null);
  storageGet.mockResolvedValue(null);
});

describe("site logo resolver", () => {
  it("maps an uploaded logo to its public asset URL", () => {
    expect(resolveSiteLogo(logo)).toEqual({ url: "/api/files/logo_1", asset: logo });
  });

  it("uses the fallback when no logo exists", () => {
    expect(resolveSiteLogo(null)).toBeNull();
  });

  it("ignores assets that are not site logos", () => {
    expect(resolveSiteLogo({ ...logo, purpose: "avatar" })).toBeNull();
  });

  it("reads the latest logo through getSiteLogo", async () => {
    fileFindFirst.mockResolvedValueOnce(logo);

    const resolved = await getBrandLogo();

    expect(resolved).toEqual({ url: "/api/files/logo_1", asset: logo });
    expect(fileFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "", purpose: "site-logo" } }),
    );
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("falls back safely when the lookup fails", async () => {
    fileFindFirst.mockRejectedValueOnce(new Error("db down"));

    expect(await getBrandLogo()).toBeNull();
    expect(loggerWarn).toHaveBeenCalled();
  });
});
