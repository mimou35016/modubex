import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePath,
  headersGet,
  requireSession,
  requirePermission,
  hasPermission,
  uploadFile,
  deleteFile,
  getCurrentAvatar,
  getSiteLogo,
} = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  headersGet: vi.fn(),
  requireSession: vi.fn(),
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  getCurrentAvatar: vi.fn(),
  getSiteLogo: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("@/core/auth/dal", () => ({
  requireSession,
  requirePermission,
  hasPermission,
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));
vi.mock("@/core/files/service", () => ({
  uploadFile,
  deleteFile,
  getCurrentAvatar,
  getSiteLogo,
  getFileAsset: vi.fn(),
}));
vi.mock("@/core/storage", () => ({ getStorageAdapter: () => ({ get: vi.fn() }) }));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  removeAvatarAction,
  removeSiteLogoAction,
  uploadAvatarAction,
  uploadSiteLogoAction,
} from "@/app/actions/files";

const session = { user: { id: "user_1", email: "user@example.com" } };
const logo = {
  id: "logo_1",
  storageKey: "site/logo/logo.png",
  purpose: "site-logo" as const,
  contentType: "image/png",
  size: 4,
  ownerId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const avatar = { ...logo, id: "avatar_1", purpose: "avatar" as const, ownerId: "user_1" };

function form(field: string): FormData {
  const formData = new FormData();
  formData.set(field, new File([Buffer.from([1, 2, 3, 4])], "image.png", { type: "image/png" }));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(session);
  requirePermission.mockResolvedValue({ session, permissionKeys: [] });
  hasPermission.mockResolvedValue(true);
  headersGet.mockReturnValue(null);
  uploadFile.mockResolvedValue(logo);
  deleteFile.mockResolvedValue(undefined);
  getCurrentAvatar.mockResolvedValue(avatar);
  getSiteLogo.mockResolvedValue(logo);
});

describe("site logo revalidation", () => {
  it("revalidates the root layout when a logo is uploaded", async () => {
    expect(await uploadSiteLogoAction({}, form("logo"))).toEqual({
      ok: true,
      message: "Site logo updated.",
    });

    expect(revalidatePath.mock.calls).toEqual([
      ["/"],
      ["/profile"],
      ["/settings/site"],
      ["/", "layout"],
    ]);
  });

  it("revalidates the root layout when a logo is removed", async () => {
    expect(await removeSiteLogoAction({}, new FormData())).toEqual({
      ok: true,
      message: "Site logo removed.",
    });

    expect(revalidatePath.mock.calls).toEqual([
      ["/"],
      ["/profile"],
      ["/settings/site"],
      ["/", "layout"],
    ]);
  });

  it("leaves avatar revalidation unchanged", async () => {
    await uploadAvatarAction({}, form("avatar"));
    await removeAvatarAction({}, new FormData());

    expect(revalidatePath.mock.calls).toEqual([
      ["/"],
      ["/profile"],
      ["/settings/site"],
      ["/"],
      ["/profile"],
      ["/settings/site"],
    ]);
  });
});
