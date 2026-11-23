import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSession,
  requirePermission,
  hasPermission,
  getSession,
  getCurrentPermissionKeys,
  headersGet,
  revalidatePath,
  uploadFile,
  deleteFile,
  getCurrentAvatar,
  getSiteLogo,
  getFileAsset,
  getStorageAdapter,
  storageGet,
  loggerWarn,
  loggerError,
  PermissionDeniedError,
} = vi.hoisted(() => {
  class PermissionDeniedError extends Error {
    readonly permission: string;

    constructor(permission: string) {
      super(`Missing required permission: ${permission}`);
      this.name = "PermissionDeniedError";
      this.permission = permission;
    }
  }

  return {
    requireSession: vi.fn(),
    requirePermission: vi.fn(),
    hasPermission: vi.fn(),
    getSession: vi.fn(),
    getCurrentPermissionKeys: vi.fn(),
    headersGet: vi.fn(),
    revalidatePath: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getCurrentAvatar: vi.fn(),
    getSiteLogo: vi.fn(),
    getFileAsset: vi.fn(),
    getStorageAdapter: vi.fn(),
    storageGet: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    PermissionDeniedError,
  };
});

vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/dal", () => ({
  requireSession,
  requirePermission,
  hasPermission,
  getSession,
  getCurrentPermissionKeys,
  PermissionDeniedError,
}));
vi.mock("@/core/files/service", () => ({
  uploadFile,
  deleteFile,
  getCurrentAvatar,
  getSiteLogo,
  getFileAsset,
}));
vi.mock("@/core/storage", () => ({ getStorageAdapter }));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: loggerWarn, error: loggerError, info: vi.fn() },
}));

import { GET } from "@/app/api/files/[id]/route";
import {
  removeAvatarAction,
  removeSiteLogoAction,
  uploadAvatarAction,
  uploadSiteLogoAction,
} from "@/app/actions/files";

const session = { user: { id: "user_1", email: "user@example.com" } };
const avatar = {
  id: "avatar_1",
  storageKey: "avatars/user_1/avatar.png",
  purpose: "avatar" as const,
  contentType: "image/png",
  size: 4,
  ownerId: "user_1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const logo = {
  id: "logo_1",
  storageKey: "site/logo/logo.png",
  purpose: "site-logo" as const,
  contentType: "image/png",
  size: 4,
  ownerId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function form(field: string, value?: File): FormData {
  const formData = new FormData();
  if (value) formData.set(field, value);
  return formData;
}

function image(): File {
  return new File([Buffer.from([1, 2, 3, 4])], "image.png", { type: "image/png" });
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(session);
  requirePermission.mockResolvedValue({ session, permissionKeys: [] });
  hasPermission.mockResolvedValue(true);
  getSession.mockResolvedValue(session);
  getCurrentPermissionKeys.mockResolvedValue([]);
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
    if (name === "user-agent") return "test-agent";
    return null;
  });
  uploadFile.mockResolvedValue(avatar);
  deleteFile.mockResolvedValue(undefined);
  getCurrentAvatar.mockResolvedValue(avatar);
  getSiteLogo.mockResolvedValue(logo);
  getFileAsset.mockImplementation(async (id: string) => {
    if (id === avatar.id) return avatar;
    if (id === logo.id) return logo;
    return null;
  });
  storageGet.mockResolvedValue({
    body: Buffer.from([1, 2, 3, 4]),
    contentType: "image/png",
    size: 4,
  });
  getStorageAdapter.mockReturnValue({ put: vi.fn(), get: storageGet, delete: vi.fn() });
});

describe("file server actions", () => {
  it("uploads an avatar only for the signed-in owner and revalidates views", async () => {
    const file = image();
    const state = await uploadAvatarAction({}, form("avatar", file));

    expect(state).toEqual({ ok: true, message: "Avatar updated." });
    expect(requireSession).toHaveBeenCalled();
    expect(hasPermission).toHaveBeenCalledWith("app.access");
    expect(uploadFile).toHaveBeenCalledWith({
      file,
      purpose: "avatar",
      ownerId: "user_1",
      actor: {
        userId: "user_1",
        email: "user@example.com",
        ip: "203.0.113.7",
        userAgent: "test-agent",
      },
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/",
      "/profile",
      "/settings/site",
    ]);
  });

  it("denies avatar actions without app.access and ignores missing files", async () => {
    hasPermission.mockResolvedValueOnce(false);
    expect(await uploadAvatarAction({}, form("avatar", image()))).toEqual({
      error: "You do not have permission to perform this action.",
    });
    expect(uploadFile).not.toHaveBeenCalled();

    expect(await uploadAvatarAction({}, form("avatar"))).toEqual({
      error: "Choose an avatar image.",
    });
  });

  it("requires settings.update for site logo uploads", async () => {
    const file = image();
    const state = await uploadSiteLogoAction({}, form("logo", file));

    expect(state).toEqual({ ok: true, message: "Site logo updated." });
    expect(requirePermission).toHaveBeenCalledWith("settings.update");
    expect(uploadFile).toHaveBeenCalledWith({
      file,
      purpose: "site-logo",
      actor: expect.objectContaining({ userId: "user_1" }),
    });
    expect(uploadFile.mock.calls[0]?.[0]).not.toHaveProperty("ownerId");
  });

  it("removes the current avatar and site logo without reading form fields", async () => {
    expect(await removeAvatarAction({}, new FormData())).toEqual({
      ok: true,
      message: "Avatar removed.",
    });
    expect(deleteFile).toHaveBeenCalledWith({
      assetId: "avatar_1",
      actor: expect.objectContaining({ userId: "user_1" }),
    });

    expect(await removeSiteLogoAction({}, new FormData())).toEqual({
      ok: true,
      message: "Site logo removed.",
    });
    expect(deleteFile).toHaveBeenLastCalledWith({
      assetId: "logo_1",
      actor: expect.objectContaining({ userId: "user_1" }),
    });
    expect(revalidatePath).toHaveBeenCalledTimes(7);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns an action-state error when the settings permission is missing", async () => {
    requirePermission.mockRejectedValueOnce(new PermissionDeniedError("settings.update"));
    expect(await uploadSiteLogoAction({}, form("logo", image()))).toEqual({
      error: "You do not have permission to perform this action.",
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("surfaces service failures without revalidating", async () => {
    uploadFile.mockRejectedValueOnce(
      new Error("Only PNG, JPEG, WebP, or AVIF images are allowed."),
    );
    const state = await uploadAvatarAction({}, form("avatar", image()));

    expect(state).toEqual({ error: "Only PNG, JPEG, WebP, or AVIF images are allowed." });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });
});

describe("GET /api/files/[id]", () => {
  it("serves site logos publicly with inline, nosniff headers", async () => {
    const response = await GET(new Request("http://localhost/api/files/logo_1"), context("logo_1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(getSession).not.toHaveBeenCalled();
    expect(getFileAsset).toHaveBeenCalledWith("logo_1");
    expect(storageGet).toHaveBeenCalledWith(logo.storageKey);
  });

  it("never caches avatars in the HTTP cache but keeps site logos public", async () => {
    const avatarResponse = await GET(
      new Request("http://localhost/api/files/avatar_1"),
      context("avatar_1"),
    );

    expect(avatarResponse.status).toBe(200);
    expect(avatarResponse.headers.get("cache-control")).toContain("no-store");

    const logoResponse = await GET(
      new Request("http://localhost/api/files/logo_1"),
      context("logo_1"),
    );

    expect(logoResponse.status).toBe(200);
    expect(logoResponse.headers.get("cache-control")).toContain("public");
    expect(logoResponse.headers.get("cache-control")).not.toContain("no-store");
  });

  it("returns 404 for unknown ids, bad ids, and missing storage objects", async () => {
    expect(
      (await GET(new Request("http://localhost/api/files/nope"), context("nope"))).status,
    ).toBe(404);
    expect(
      (await GET(new Request("http://localhost/api/files/../secret"), context("../secret"))).status,
    ).toBe(404);
    expect(getFileAsset).not.toHaveBeenCalledWith("../secret");

    storageGet.mockResolvedValueOnce(null);
    expect(
      (await GET(new Request("http://localhost/api/files/logo_1"), context("logo_1"))).status,
    ).toBe(404);
  });

  it("requires a session to read avatars", async () => {
    getSession.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("http://localhost/api/files/avatar_1"),
      context("avatar_1"),
    );
    expect(response.status).toBe(401);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("allows the owner or users.read holders, and denies other users", async () => {
    const owner = await GET(
      new Request("http://localhost/api/files/avatar_1"),
      context("avatar_1"),
    );
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toContain("private");

    storageGet.mockClear();
    getSession.mockResolvedValueOnce({ user: { id: "other", email: "other@example.com" } });
    const denied = await GET(
      new Request("http://localhost/api/files/avatar_1"),
      context("avatar_1"),
    );
    expect(denied.status).toBe(403);
    expect(storageGet).not.toHaveBeenCalled();

    getSession.mockResolvedValueOnce({ user: { id: "other", email: "other@example.com" } });
    getCurrentPermissionKeys.mockResolvedValueOnce(["users.read"]);
    const allowed = await GET(
      new Request("http://localhost/api/files/avatar_1"),
      context("avatar_1"),
    );
    expect(allowed.status).toBe(200);
  });
});
