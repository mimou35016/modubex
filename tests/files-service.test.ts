import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAdapter, StorageGet, StoragePut } from "@/core/storage/types";

const {
  fileCreate,
  fileFindUnique,
  fileFindFirst,
  fileFindMany,
  fileDelete,
  auditLog,
  getStorageAdapter,
  loggerError,
} = vi.hoisted(() => ({
  fileCreate: vi.fn(),
  fileFindUnique: vi.fn(),
  fileFindFirst: vi.fn(),
  fileFindMany: vi.fn(),
  fileDelete: vi.fn(),
  auditLog: vi.fn(),
  getStorageAdapter: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fileAsset: {
      create: fileCreate,
      findUnique: fileFindUnique,
      findFirst: fileFindFirst,
      findMany: fileFindMany,
      delete: fileDelete,
    },
  },
}));

vi.mock("@/core/audit/audit", () => ({
  audit: { log: auditLog },
  auditActions: { filesUploaded: "files.uploaded", filesDeleted: "files.deleted" },
}));

vi.mock("@/core/storage", () => ({ getStorageAdapter }));

vi.mock("@/core/logging/logger", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { canManageOwnAvatar, canReadFileAsset } from "@/core/files/authorization";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  MAX_LOGO_BYTES,
  deleteFile,
  getFileAsset,
  getCurrentAvatar,
  getSiteLogo,
  uploadFile,
  uploadFileSchema,
} from "@/core/files/service";

const actor = { userId: "actor_1", email: "actor@example.com" };

type FakeAdapter = StorageAdapter & {
  objects: Map<string, StorageGet>;
};

function fakeAdapter(): FakeAdapter {
  const objects = new Map<string, StorageGet>();
  return {
    objects,
    put: vi.fn(async (input: StoragePut): Promise<{ key: string }> => {
      objects.set(input.key, {
        body: input.body,
        contentType: input.contentType,
        size: input.size,
      });
      return { key: input.key };
    }),
    get: vi.fn(async (key: string): Promise<StorageGet | null> => objects.get(key) ?? null),
    delete: vi.fn(async (key: string): Promise<void> => {
      objects.delete(key);
    }),
  };
}

function imageFile(name = "photo.png", type = "image/png", size = 8): File {
  return new File([Buffer.alloc(size, 1)], name, { type });
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset_1",
    storageKey: "avatars/user_1/old.png",
    ownerId: "user_1",
    purpose: "avatar",
    contentType: "image/png",
    size: 8,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileFindMany.mockResolvedValue([]);
  fileFindUnique.mockResolvedValue(null);
  fileFindFirst.mockResolvedValue(null);
  fileDelete.mockResolvedValue(undefined);
  fileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    assetRow({ id: "asset_new", ...data }),
  );
});

describe("upload file validation", () => {
  it.each(ALLOWED_IMAGE_TYPES)("accepts %s images", (contentType) => {
    const result = uploadFileSchema.safeParse({
      file: imageFile("photo.img", contentType),
      purpose: "site-logo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects SVG by MIME type, file name, and payload content", async () => {
    expect(
      uploadFileSchema.safeParse({
        file: imageFile("logo.svg", "image/svg+xml"),
        purpose: "site-logo",
      }).success,
    ).toBe(false);
    expect(
      uploadFileSchema.safeParse({
        file: imageFile("logo.svg", "image/png"),
        purpose: "site-logo",
      }).success,
    ).toBe(false);

    const adapter = fakeAdapter();
    const disguised = new File(
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
      "logo.png",
      { type: "image/png" },
    );
    await expect(
      uploadFile({ file: disguised, purpose: "site-logo", actor }, adapter),
    ).rejects.toThrow("SVG images are not allowed");
    expect(adapter.put).not.toHaveBeenCalled();
  });

  it("enforces per-purpose size limits and requires an avatar owner", () => {
    expect(
      uploadFileSchema.safeParse({
        file: imageFile("a.png", "image/png", MAX_AVATAR_BYTES),
        purpose: "avatar",
        ownerId: "user_1",
      }).success,
    ).toBe(true);
    expect(
      uploadFileSchema.safeParse({
        file: imageFile("a.png", "image/png", MAX_AVATAR_BYTES + 1),
        purpose: "avatar",
        ownerId: "user_1",
      }).success,
    ).toBe(false);
    expect(
      uploadFileSchema.safeParse({
        file: imageFile("logo.png", "image/png", MAX_LOGO_BYTES + 1),
        purpose: "site-logo",
      }).success,
    ).toBe(false);
    expect(uploadFileSchema.safeParse({ file: imageFile(), purpose: "avatar" }).success).toBe(
      false,
    );
  });
});

describe("uploadFile", () => {
  it("writes bytes, creates metadata, and audits metadata without keys or bytes", async () => {
    const adapter = fakeAdapter();

    const view = await uploadFile(
      { file: imageFile(), purpose: "avatar", ownerId: "user_1", actor },
      adapter,
    );

    expect(view).toMatchObject({
      id: "asset_new",
      purpose: "avatar",
      ownerId: "user_1",
      contentType: "image/png",
      size: 8,
    });
    expect(view.storageKey).toMatch(/^avatars\/user_1\/[0-9a-f-]{36}\.png$/);
    expect(adapter.put).toHaveBeenCalledWith({
      key: view.storageKey,
      contentType: "image/png",
      body: expect.any(Buffer),
      size: 8,
    });
    expect(fileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: view.storageKey,
          ownerId: "user_1",
          purpose: "avatar",
          workspaceId: "",
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "files.uploaded",
        after: expect.objectContaining({
          id: "asset_new",
          contentType: "image/png",
          size: 8,
          purpose: "avatar",
          ownerId: "user_1",
        }),
      }),
    );
    expect(JSON.stringify(auditLog.mock.calls[0]?.[0])).not.toContain("avatars/");
  });

  it("deletes the stored object when the database write fails", async () => {
    const adapter = fakeAdapter();
    fileCreate.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      uploadFile({ file: imageFile(), purpose: "avatar", ownerId: "user_1", actor }, adapter),
    ).rejects.toThrow("database unavailable");

    expect(adapter.objects.size).toBe(0);
    expect(adapter.delete).toHaveBeenCalledWith(expect.stringMatching(/^avatars\/user_1\//));
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("creates the replacement before removing the previous avatar and audits both", async () => {
    const adapter = fakeAdapter();
    const old = assetRow({ id: "old_1", storageKey: "avatars/user_1/previous.png" });
    fileFindMany.mockResolvedValueOnce([old]);

    const view = await uploadFile(
      { file: imageFile(), purpose: "avatar", ownerId: "user_1", actor },
      adapter,
    );

    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purpose: "avatar",
          ownerId: "user_1",
          id: { not: view.id },
        }),
      }),
    );
    expect(adapter.put).toHaveBeenCalledWith(expect.objectContaining({ key: view.storageKey }));
    expect(adapter.delete).toHaveBeenCalledWith(old.storageKey);
    expect(fileDelete).toHaveBeenCalledWith({ where: { id: "old_1" } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "files.deleted",
        targetId: "old_1",
        before: expect.objectContaining({ id: "old_1", ownerId: "user_1" }),
      }),
    );
  });

  it("keeps a single site logo with a null owner", async () => {
    const adapter = fakeAdapter();
    const old = assetRow({
      id: "old_logo",
      purpose: "site-logo",
      storageKey: "site/logo/previous.png",
      ownerId: null,
    });
    fileFindMany.mockResolvedValueOnce([old]);

    const view = await uploadFile(
      { file: imageFile(), purpose: "site-logo", ownerId: "user_1", actor },
      adapter,
    );

    expect(view.storageKey).toMatch(/^site\/logo\//);
    expect(view.ownerId).toBeNull();
    expect(fileCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: null }) }),
    );
    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: "site-logo", id: { not: view.id } }),
      }),
    );
    expect(adapter.delete).toHaveBeenCalledWith(old.storageKey);
  });
});

describe("deleteFile and lookups", () => {
  it("deletes storage then metadata and audits the removed snapshot", async () => {
    const adapter = fakeAdapter();
    const old = assetRow();
    fileFindUnique.mockResolvedValueOnce(old);

    await deleteFile({ assetId: "asset_1", actor }, adapter);

    expect(adapter.delete).toHaveBeenCalledWith(old.storageKey);
    expect(fileDelete).toHaveBeenCalledWith({ where: { id: "asset_1" } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "files.deleted",
        before: expect.objectContaining({ id: "asset_1", size: 8 }),
        after: null,
      }),
    );
  });

  it("does not touch storage when the asset does not exist", async () => {
    const adapter = fakeAdapter();
    await expect(deleteFile({ assetId: "missing", actor }, adapter)).rejects.toThrow(
      "File asset not found",
    );
    expect(adapter.delete).not.toHaveBeenCalled();
  });

  it("maps queried rows to views and filters latest avatar/site logo", async () => {
    const row = assetRow({ createdAt: new Date("2026-02-01T00:00:00.000Z") });
    fileFindUnique.mockResolvedValueOnce(row);
    expect(await getFileAsset("asset_1")).toEqual({
      id: "asset_1",
      storageKey: row.storageKey,
      purpose: "avatar",
      contentType: "image/png",
      size: 8,
      ownerId: "user_1",
      createdAt: row.createdAt,
    });

    fileFindFirst.mockResolvedValueOnce(row);
    await getCurrentAvatar("user_1");
    expect(fileFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: "avatar", ownerId: "user_1" }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );

    fileFindFirst.mockResolvedValueOnce(assetRow({ purpose: "site-logo", ownerId: null }));
    await getSiteLogo();
    expect(fileFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ purpose: "site-logo" }) }),
    );
  });
});

describe("file authorization helpers", () => {
  it("allows public logo reads and self-only avatar management", () => {
    expect(
      canReadFileAsset({ purpose: "site-logo", ownerId: null }, { id: "", permissionKeys: [] }),
    ).toBe(true);
    expect(canManageOwnAvatar("user_1", "user_1")).toBe(true);
    expect(canManageOwnAvatar("user_1", null)).toBe(false);
    expect(canManageOwnAvatar("user_1", "user_2")).toBe(false);
  });

  it("allows the avatar owner or users.read, and denies everyone else", () => {
    const avatar = { purpose: "avatar" as const, ownerId: "user_1" };
    expect(canReadFileAsset(avatar, { id: "user_1", permissionKeys: [] })).toBe(true);
    expect(canReadFileAsset(avatar, { id: "user_2", permissionKeys: ["users.read"] })).toBe(true);
    expect(canReadFileAsset(avatar, { id: "user_2", permissionKeys: [] })).toBe(false);
    expect(canReadFileAsset(avatar, { id: "", permissionKeys: ["users.read"] })).toBe(false);
  });
});
