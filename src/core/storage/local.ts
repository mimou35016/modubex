import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "@/core/config/env";
import {
  StorageError,
  storageKeySchema,
  storageMetadataSchema,
  storagePutSchema,
  type StorageAdapter,
  type StorageGet,
  type StorageOperation,
  type StoragePut,
} from "./types";

const FALLBACK_ROOT = path.join(process.cwd(), ".data", "storage");
const METADATA_SUFFIX = ".meta.json";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Server-only: relies on node:fs and must never be bundled into a client module. */
function resolveRoot(rootPath: string | undefined): string {
  const configured = rootPath ?? env.STORAGE_LOCAL_PATH ?? FALLBACK_ROOT;
  const parsed = z.string().min(1).max(4096).safeParse(configured);
  if (!parsed.success) {
    throw new StorageError("Local storage root path is invalid", { operation: "configure" });
  }
  return path.resolve(parsed.data);
}

function parseKey(key: string, operation: StorageOperation): string {
  const parsed = storageKeySchema.safeParse(key);
  if (!parsed.success) {
    throw new StorageError("Storage key is invalid", { operation, key, cause: parsed.error });
  }
  return parsed.data;
}

function resolveTarget(root: string, key: string, operation: StorageOperation): string {
  const target = path.resolve(root, ...key.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new StorageError("Storage key escapes the storage root", { operation, key });
  }
  return target;
}

function metadataPath(filePath: string): string {
  return `${filePath}${METADATA_SUFFIX}`;
}

/**
 * Local disk adapter. Writes are staged to unique temp files and renamed into
 * place so readers never observe a partially written object.
 */
export function createLocalStorageAdapter(rootPath?: string): StorageAdapter {
  const root = resolveRoot(rootPath);

  return {
    async put(input: StoragePut): Promise<{ key: string }> {
      const parsed = storagePutSchema.safeParse(input);
      if (!parsed.success) {
        throw new StorageError("Storage put input is invalid", {
          operation: "put",
          cause: parsed.error,
        });
      }
      const { key, body, contentType, size } = parsed.data;
      const target = resolveTarget(root, parseKey(key, "put"), "put");
      const unique = randomUUID();
      const dataTemp = `${target}.${unique}.tmp`;
      const metadataTemp = `${target}.${unique}${METADATA_SUFFIX}.tmp`;

      try {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(dataTemp, body);
        await writeFile(metadataTemp, JSON.stringify({ contentType, size }), "utf8");
        await rename(dataTemp, target);
        await rename(metadataTemp, metadataPath(target));
      } catch (error) {
        await Promise.allSettled([
          rm(dataTemp, { force: true }),
          rm(metadataTemp, { force: true }),
        ]);
        throw new StorageError(`Local storage put failed for key: ${key}`, {
          operation: "put",
          key,
          cause: error,
        });
      }

      return { key };
    },

    async get(key: string): Promise<StorageGet | null> {
      const safeKey = parseKey(key, "get");
      const target = resolveTarget(root, safeKey, "get");
      let body: Buffer;
      try {
        body = await readFile(target);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw new StorageError(`Local storage get failed for key: ${safeKey}`, {
          operation: "get",
          key: safeKey,
          cause: error,
        });
      }

      let contentType = "application/octet-stream";
      try {
        const rawMetadata = await readFile(metadataPath(target), "utf8");
        const metadata = storageMetadataSchema.safeParse(JSON.parse(rawMetadata));
        if (metadata.success) contentType = metadata.data.contentType;
      } catch {
        // A file written outside this adapter may have no metadata; fall back.
      }

      return { body, contentType, size: body.length };
    },

    async delete(key: string): Promise<void> {
      const safeKey = parseKey(key, "delete");
      const target = resolveTarget(root, safeKey, "delete");
      try {
        await Promise.all([rm(target, { force: true }), rm(metadataPath(target), { force: true })]);
      } catch (error) {
        throw new StorageError(`Local storage delete failed for key: ${safeKey}`, {
          operation: "delete",
          key: safeKey,
          cause: error,
        });
      }
    },
  };
}
