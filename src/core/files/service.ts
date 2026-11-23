import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit, auditActions, type AuditActor } from "@/core/audit/audit";
import { logger } from "@/core/logging/logger";
import { getStorageAdapter } from "@/core/storage";
import { storageKeySchema, type StorageAdapter } from "@/core/storage/types";
import { prisma } from "@/lib/prisma";

export type FilePurpose = "avatar" | "site-logo";

export type FileAssetView = {
  id: string;
  storageKey: string;
  purpose: FilePurpose;
  contentType: string;
  size: number;
  ownerId: string | null;
  createdAt: Date;
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_BYTES = 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const WORKSPACE_ID = "";
const ALLOWED_TYPE_SET: ReadonlySet<string> = new Set<string>(ALLOWED_IMAGE_TYPES);

const EXTENSION_BY_TYPE: Readonly<Record<AllowedImageType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

const SVG_FILE_NAME = /\.svgz?$/i;
const SVG_CONTENT = /^\s*(?:<\?xml\b|<svg\b|<!doctype\s+svg\b)/i;

const purposeSchema = z.enum(["avatar", "site-logo"]);
const actorSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});
// User ids are cuids/UUIDs; constraining them here also keeps generated keys
// unambiguous even if the storage adapter were later pointed at a loose root.
const ownerIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, "Owner id contains unsupported characters");
const fileSchema = z.custom<File>((value) => typeof File !== "undefined" && value instanceof File, {
  message: "Choose an image file.",
});

/** Validates metadata; byte-level SVG detection happens after reading the file. */
export const uploadFileSchema = z
  .object({
    file: fileSchema,
    purpose: purposeSchema,
    ownerId: ownerIdSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.purpose === "avatar" && !input.ownerId) {
      context.addIssue({
        code: "custom",
        path: ["ownerId"],
        message: "An owner is required for an avatar.",
      });
    }

    const contentType = input.file.type.trim().toLowerCase();
    if (
      !ALLOWED_TYPE_SET.has(contentType) ||
      contentType === "image/svg+xml" ||
      SVG_FILE_NAME.test(input.file.name)
    ) {
      context.addIssue({
        code: "custom",
        path: ["file"],
        message: "Only PNG, JPEG, WebP, or AVIF images are allowed.",
      });
      return;
    }

    if (input.file.size <= 0) {
      context.addIssue({ code: "custom", path: ["file"], message: "The image is empty." });
      return;
    }

    const limit = input.purpose === "avatar" ? MAX_AVATAR_BYTES : MAX_LOGO_BYTES;
    if (input.file.size > limit) {
      context.addIssue({
        code: "custom",
        path: ["file"],
        message:
          input.purpose === "avatar"
            ? "Avatar images must be 2 MB or smaller."
            : "Site logo images must be 1 MB or smaller.",
      });
    }
  });

type FileAssetRow = {
  id: string;
  storageKey: string;
  ownerId: string | null;
  purpose: string;
  contentType: string;
  size: number;
  createdAt: Date;
};

const assetSelect = {
  id: true,
  storageKey: true,
  ownerId: true,
  purpose: true,
  contentType: true,
  size: true,
  createdAt: true,
} as const;

function toPurpose(value: string): FilePurpose {
  const parsed = purposeSchema.safeParse(value);
  if (!parsed.success) throw new Error("Stored file asset has an unknown purpose");
  return parsed.data;
}

function toView(row: FileAssetRow): FileAssetView {
  return {
    id: row.id,
    storageKey: row.storageKey,
    purpose: toPurpose(row.purpose),
    contentType: row.contentType,
    size: row.size,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
  };
}

/** Audit snapshots carry metadata only: never file bytes or storage keys. */
function auditSnapshot(asset: FileAssetView) {
  return {
    id: asset.id,
    purpose: asset.purpose,
    contentType: asset.contentType,
    size: asset.size,
    ownerId: asset.ownerId,
  };
}

function extensionFor(contentType: string): string {
  if (!ALLOWED_TYPE_SET.has(contentType)) {
    throw new Error("Unsupported image content type");
  }
  return EXTENSION_BY_TYPE[contentType as AllowedImageType];
}

function storageKeyFor(input: {
  purpose: FilePurpose;
  ownerId: string | undefined;
  contentType: string;
}): string {
  const extension = extensionFor(input.contentType);
  const filename = `${randomUUID()}.${extension}`;
  const key =
    input.purpose === "avatar" ? `avatars/${input.ownerId}/${filename}` : `site/logo/${filename}`;
  return storageKeySchema.parse(key);
}

/** Reads once and rejects SVG/XML payloads even when the declared MIME is safe. */
async function readImageBytes(file: File): Promise<Buffer> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const head = bytes.subarray(0, 512).toString("utf8");
  if (SVG_CONTENT.test(head)) throw new Error("SVG images are not allowed.");
  return bytes;
}

async function removeReplacedAssets(input: {
  purpose: FilePurpose;
  ownerId: string | null;
  exceptId: string;
  actor: AuditActor;
  adapter: StorageAdapter;
}): Promise<void> {
  const previous = await prisma.fileAsset.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      purpose: input.purpose,
      id: { not: input.exceptId },
      ...(input.purpose === "avatar" ? { ownerId: input.ownerId } : {}),
    },
    select: assetSelect,
    orderBy: { createdAt: "desc" },
  });

  for (const row of previous) {
    const view = toView(row);
    try {
      await input.adapter.delete(row.storageKey);
    } catch (error: unknown) {
      // Keep the old row when its object cannot be removed: a dangling row is
      // recoverable, a deleted row with an orphaned object is not.
      logger.error("Replaced file storage cleanup failed", {
        assetId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    try {
      await prisma.fileAsset.delete({ where: { id: row.id } });
      await audit.log({
        action: auditActions.filesDeleted,
        actor: input.actor,
        targetType: "file_asset",
        targetId: row.id,
        module: "core",
        workspaceId: WORKSPACE_ID,
        before: auditSnapshot(view),
        after: null,
        metadata: { reason: "replaced" },
      });
    } catch (error: unknown) {
      logger.error("Replaced file metadata cleanup failed", {
        assetId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function uploadFile(
  input: { file: File; purpose: FilePurpose; ownerId?: string; actor: AuditActor },
  adapter?: StorageAdapter,
): Promise<FileAssetView> {
  const data = uploadFileSchema.parse(input);
  const actor = actorSchema.parse(input.actor);
  const contentType = data.file.type.trim().toLowerCase();
  const bytes = await readImageBytes(data.file);
  const store = adapter ?? getStorageAdapter();
  const storageKey = storageKeyFor({
    purpose: data.purpose,
    ownerId: data.ownerId,
    contentType,
  });
  const ownerId = data.purpose === "avatar" ? (data.ownerId ?? null) : null;

  await store.put({
    key: storageKey,
    contentType,
    body: bytes,
    size: bytes.byteLength,
  });

  let created: FileAssetRow;
  try {
    created = await prisma.fileAsset.create({
      data: {
        storageKey,
        ownerId,
        purpose: data.purpose,
        contentType,
        size: bytes.byteLength,
        workspaceId: WORKSPACE_ID,
      },
      select: assetSelect,
    });
  } catch (error: unknown) {
    try {
      await store.delete(storageKey);
    } catch (cleanupError: unknown) {
      logger.error("File storage compensation failed", {
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
    throw error;
  }

  const view = toView(created);
  await audit.log({
    action: auditActions.filesUploaded,
    actor,
    targetType: "file_asset",
    targetId: view.id,
    module: "core",
    workspaceId: WORKSPACE_ID,
    after: auditSnapshot(view),
  });

  // New row first: a failed cleanup leaves the new asset usable rather than
  // removing the current image before its replacement exists.
  try {
    await removeReplacedAssets({
      purpose: data.purpose,
      ownerId,
      exceptId: view.id,
      actor,
      adapter: store,
    });
  } catch (error: unknown) {
    logger.error("Replaced file lookup failed", {
      assetId: view.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return view;
}

export async function deleteFile(
  input: { assetId: string; actor: AuditActor },
  adapter?: StorageAdapter,
): Promise<void> {
  const data = z
    .object({
      assetId: z.string().min(1).max(200),
      actor: actorSchema,
    })
    .parse(input);

  const row = await prisma.fileAsset.findUnique({
    where: { id: data.assetId },
    select: assetSelect,
  });
  if (!row) throw new Error("File asset not found");

  const view = toView(row);
  const store = adapter ?? getStorageAdapter();
  await store.delete(row.storageKey);
  await prisma.fileAsset.delete({ where: { id: row.id } });

  await audit.log({
    action: auditActions.filesDeleted,
    actor: data.actor,
    targetType: "file_asset",
    targetId: row.id,
    module: "core",
    workspaceId: WORKSPACE_ID,
    before: auditSnapshot(view),
    after: null,
  });
}

export async function getFileAsset(id: string): Promise<FileAssetView | null> {
  const parsed = z.string().min(1).max(200).parse(id);
  const row = await prisma.fileAsset.findUnique({
    where: { id: parsed },
    select: assetSelect,
  });
  return row ? toView(row) : null;
}

export async function getCurrentAvatar(userId: string): Promise<FileAssetView | null> {
  const parsed = ownerIdSchema.parse(userId);
  const row = await prisma.fileAsset.findFirst({
    where: { workspaceId: WORKSPACE_ID, purpose: "avatar", ownerId: parsed },
    select: assetSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? toView(row) : null;
}

export async function getSiteLogo(): Promise<FileAssetView | null> {
  const row = await prisma.fileAsset.findFirst({
    where: { workspaceId: WORKSPACE_ID, purpose: "site-logo" },
    select: assetSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? toView(row) : null;
}
