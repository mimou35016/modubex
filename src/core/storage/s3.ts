import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { env } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import {
  contentTypeSchema,
  StorageError,
  storageKeySchema,
  storagePutSchema,
  type StorageAdapter,
  type StorageGet,
  type StorageOperation,
  type StoragePut,
} from "./types";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

type S3Config = {
  bucket: string;
  client: S3Client;
};

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const code = typeof candidate.name === "string" ? candidate.name : candidate.Code;
  return code === "NoSuchKey" || code === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name ?? "Error")
    : "Error";
}

function fail(operation: StorageOperation, key: string, error: unknown): StorageError {
  // Never log vendor messages, endpoints, or credentials.
  logger.error("S3 storage operation failed", { operation, key, error: errorName(error) });
  return new StorageError(`S3 storage ${operation} failed for key: ${key}`, {
    operation,
    key,
    cause: error,
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createConfig(): S3Config {
  const bucket = z.string().min(1).safeParse(env.STORAGE_S3_BUCKET);
  if (!bucket.success) {
    throw new StorageError("S3 storage bucket is not configured", { operation: "configure" });
  }

  const endpoint = optionalString(env.STORAGE_S3_ENDPOINT);
  const region = optionalString(env.STORAGE_S3_REGION) ?? DEFAULT_REGION;
  const forcePathStyle = String(env.STORAGE_S3_FORCE_PATH_STYLE ?? "false") === "true";
  const accessKeyId = optionalString(env.STORAGE_S3_ACCESS_KEY_ID);
  const secretAccessKey = optionalString(env.STORAGE_S3_SECRET_ACCESS_KEY);
  const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle,
    ...(credentials ? { credentials } : {}),
  });

  return { bucket: bucket.data, client };
}

function parseKey(key: string, operation: StorageOperation): string {
  const parsed = storageKeySchema.safeParse(key);
  if (!parsed.success) {
    throw new StorageError("Storage key is invalid", { operation, key, cause: parsed.error });
  }
  return parsed.data;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  if (typeof body === "string") return Buffer.from(body);
  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    const stream = body as { transformToByteArray(): Promise<Uint8Array> };
    return Buffer.from(await stream.transformToByteArray());
  }
  if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new StorageError("S3 storage get returned an unsupported body", { operation: "get" });
}

/** S3-compatible adapter; configuration comes from infrastructure env only. */
export function createS3StorageAdapter(): StorageAdapter {
  const { bucket, client } = createConfig();

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
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ContentLength: size,
          }),
        );
      } catch (error) {
        throw fail("put", key, error);
      }
      return { key };
    },

    async get(key: string): Promise<StorageGet | null> {
      const safeKey = parseKey(key, "get");
      let response;
      try {
        response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: safeKey }));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw fail("get", safeKey, error);
      }

      const body = await bodyToBuffer(response.Body);
      const contentType = contentTypeSchema.safeParse(response.ContentType);
      const size = z.number().int().nonnegative().safeParse(response.ContentLength);
      return {
        body,
        contentType: contentType.success ? contentType.data : DEFAULT_CONTENT_TYPE,
        size: size.success ? size.data : body.length,
      };
    },

    async delete(key: string): Promise<void> {
      const safeKey = parseKey(key, "delete");
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey }));
      } catch (error) {
        throw fail("delete", safeKey, error);
      }
    },
  };
}
