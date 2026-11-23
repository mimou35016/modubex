import { z } from "zod";
import { env } from "@/core/config/env";
import { createLocalStorageAdapter } from "./local";
import { createS3StorageAdapter } from "./s3";
import { StorageError, type StorageAdapter } from "./types";

let cachedAdapter: StorageAdapter | undefined;

function createAdapter(): StorageAdapter {
  const driver = z.enum(["local", "s3"]).safeParse(env.STORAGE_DRIVER ?? "local");
  if (!driver.success) {
    throw new StorageError("STORAGE_DRIVER must be 'local' or 's3'", { operation: "configure" });
  }
  return driver.data === "s3" ? createS3StorageAdapter() : createLocalStorageAdapter();
}

/** Memoized adapter selection; call resetStorageAdapterForTests() in tests. */
export function getStorageAdapter(): StorageAdapter {
  cachedAdapter ??= createAdapter();
  return cachedAdapter;
}

export function resetStorageAdapterForTests(): void {
  cachedAdapter = undefined;
}

/** Stable delegate so importers never hold a stale adapter after a reset. */
export const storage: StorageAdapter = {
  put: (input) => getStorageAdapter().put(input),
  get: (key) => getStorageAdapter().get(key),
  delete: (key) => getStorageAdapter().delete(key),
};
