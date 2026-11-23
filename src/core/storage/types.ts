import { z } from "zod";

/**
 * Keys are relative POSIX-style paths. They never begin with a separator,
 * never contain a parent traversal, and never rely on Windows separators.
 */
export const storageKeySchema = z
  .string()
  .min(1, "Storage key must not be empty")
  .max(512, "Storage key must be at most 512 characters")
  .refine((key) => !key.startsWith("/"), "Storage key must be relative")
  .refine((key) => !key.includes("\\"), "Storage key must use POSIX separators")
  .refine((key) => !key.includes(".."), "Storage key must not contain parent traversal")
  .refine(
    (key) => !/[\u0000-\u001f\u007f]/.test(key),
    "Storage key must not contain control characters",
  )
  .refine(
    (key) => key.split("/").every((segment) => segment.length > 0 && segment !== "."),
    "Storage key must contain non-empty, non-dot segments",
  );

/** Content types are stored as HTTP header values, so reject header injection. */
export const contentTypeSchema = z
  .string()
  .min(1, "Content type must not be empty")
  .max(255, "Content type must be at most 255 characters")
  .refine(
    (value) => !/[\r\n\u0000]/.test(value),
    "Content type must not contain control characters",
  );

export const storagePutSchema = z
  .object({
    key: storageKeySchema,
    contentType: contentTypeSchema,
    body: z.instanceof(Buffer),
    size: z.number().int().nonnegative(),
  })
  .refine((input) => input.size === input.body.length, {
    path: ["size"],
    message: "size must match the body length",
  });

/** Shape written beside local files so get() can restore the content type. */
export const storageMetadataSchema = z.object({
  contentType: contentTypeSchema,
  size: z.number().int().nonnegative(),
});

export type StoragePut = {
  key: string;
  contentType: string;
  body: Buffer;
  size: number;
};

export type StorageGet = {
  body: Buffer;
  contentType: string;
  size: number;
};

export type StorageOperation = "configure" | "put" | "get" | "delete";

export interface StorageAdapter {
  put(input: StoragePut): Promise<{ key: string }>;
  get(key: string): Promise<StorageGet | null>;
  delete(key: string): Promise<void>;
}

/** Storage failures never expose credentials or raw vendor error messages. */
export class StorageError extends Error {
  readonly operation?: StorageOperation;
  readonly key?: string;

  constructor(
    message: string,
    options?: { cause?: unknown; operation?: StorageOperation; key?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageError";
    this.operation = options?.operation;
    this.key = options?.key;
  }
}
