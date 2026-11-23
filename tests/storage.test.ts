import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageAdapter, resetStorageAdapterForTests, storage } from "@/core/storage";
import { createLocalStorageAdapter } from "@/core/storage/local";
import { createS3StorageAdapter } from "@/core/storage/s3";
import { StorageError, storageKeySchema } from "@/core/storage/types";

const testState = vi.hoisted(() => ({
  localRoot: "",
  send: vi.fn(),
  clientConfigs: [] as unknown[],
  putInputs: [] as unknown[],
  getInputs: [] as unknown[],
  deleteInputs: [] as unknown[],
}));

vi.mock("@/core/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/config/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      STORAGE_DRIVER: "local",
      get STORAGE_LOCAL_PATH() {
        return testState.localRoot;
      },
      STORAGE_S3_BUCKET: "unit-test-bucket",
      STORAGE_S3_REGION: "us-east-1",
      STORAGE_S3_ENDPOINT: "http://localhost:9000",
      STORAGE_S3_FORCE_PATH_STYLE: true,
      STORAGE_S3_ACCESS_KEY_ID: "test-access-key",
      STORAGE_S3_SECRET_ACCESS_KEY: "test-secret-key",
    },
  };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: unknown) {
      testState.clientConfigs.push(config);
    }

    send(command: unknown) {
      return testState.send(command);
    }
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {
      testState.putInputs.push(input);
    }
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {
      testState.getInputs.push(input);
    }
  },
  DeleteObjectCommand: class {
    constructor(public readonly input: unknown) {
      testState.deleteInputs.push(input);
    }
  },
}));

type S3PutInput = {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType: string;
  ContentLength: number;
};

type S3KeyInput = { Bucket: string; Key: string };

type S3ClientConfig = {
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
};

describe("storage key schema", () => {
  it("accepts relative POSIX keys", () => {
    expect(storageKeySchema.safeParse("file.txt").success).toBe(true);
    expect(storageKeySchema.safeParse("nested/deep/file.txt").success).toBe(true);
  });

  it("rejects absolute, traversal, backslash, and oversized keys", () => {
    for (const key of [
      "/file.txt",
      "../file.txt",
      "a/../../b",
      "a\\b",
      "a//b",
      "a/./b",
      "".padEnd(513, "x"),
    ]) {
      expect(storageKeySchema.safeParse(key).success).toBe(false);
    }
  });
});

describe("local storage adapter", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "modubex-storage-"));
    testState.localRoot = root;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips content and its content type, then deletes data and metadata", async () => {
    const adapter = createLocalStorageAdapter(root);
    const body = Buffer.from("hello local");
    await expect(
      adapter.put({ key: "nested/file.txt", contentType: "text/plain", body, size: body.length }),
    ).resolves.toEqual({ key: "nested/file.txt" });

    const stored = await adapter.get("nested/file.txt");
    expect(stored).toEqual({ body, contentType: "text/plain", size: body.length });

    const filePath = path.join(root, "nested", "file.txt");
    await expect(readFile(`${filePath}.meta.json`, "utf8")).resolves.toContain("text/plain");

    await adapter.delete("nested/file.txt");
    await expect(adapter.get("nested/file.txt")).resolves.toBeNull();
    await expect(readFile(`${filePath}.meta.json`, "utf8")).rejects.toThrow();
    await expect(adapter.delete("nested/file.txt")).resolves.toBeUndefined();
  });

  it("overwrites an existing object atomically", async () => {
    const adapter = createLocalStorageAdapter(root);
    const first = Buffer.from("first");
    const second = Buffer.from("second value");
    await adapter.put({
      key: "reports/current.txt",
      contentType: "text/plain",
      body: first,
      size: first.length,
    });
    await adapter.put({
      key: "reports/current.txt",
      contentType: "text/markdown",
      body: second,
      size: second.length,
    });

    expect(await adapter.get("reports/current.txt")).toEqual({
      body: second,
      contentType: "text/markdown",
      size: second.length,
    });
  });

  it("creates a missing root directory", async () => {
    const missingRoot = path.join(root, "does", "not", "exist");
    const adapter = createLocalStorageAdapter(missingRoot);
    const body = Buffer.from("created");
    await adapter.put({
      key: "file.bin",
      contentType: "application/octet-stream",
      body,
      size: body.length,
    });

    expect((await adapter.get("file.bin"))?.body.equals(body)).toBe(true);
  });

  it("rejects unsafe keys and mismatched sizes", async () => {
    const adapter = createLocalStorageAdapter(root);
    const body = Buffer.from("x");
    for (const key of [
      "/abs",
      "../escape",
      "a/../../b",
      "a\\b",
      "a//b",
      "a/./b",
      "x".repeat(513),
    ]) {
      await expect(
        adapter.put({ key, contentType: "text/plain", body, size: body.length }),
      ).rejects.toBeInstanceOf(StorageError);
      await expect(adapter.get(key)).rejects.toBeInstanceOf(StorageError);
      await expect(adapter.delete(key)).rejects.toBeInstanceOf(StorageError);
    }
    await expect(
      adapter.put({ key: "valid.txt", contentType: "text/plain", body, size: 2 }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3 storage adapter", () => {
  beforeEach(() => {
    testState.send.mockReset();
    testState.clientConfigs.length = 0;
    testState.putInputs.length = 0;
    testState.getInputs.length = 0;
    testState.deleteInputs.length = 0;
  });

  it("configures the client from env and uploads validated input", async () => {
    const adapter = createS3StorageAdapter();
    const body = Buffer.from("upload");
    await expect(
      adapter.put({ key: "docs/a.txt", contentType: "text/plain", body, size: body.length }),
    ).resolves.toEqual({ key: "docs/a.txt" });

    const config = testState.clientConfigs[0] as S3ClientConfig;
    expect(config).toMatchObject({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    });
    expect(config.credentials).toMatchObject({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    });

    const input = testState.putInputs[0] as S3PutInput;
    expect(input).toMatchObject({
      Bucket: "unit-test-bucket",
      Key: "docs/a.txt",
      Body: body,
      ContentType: "text/plain",
      ContentLength: body.length,
    });
  });

  it("returns stored content and metadata", async () => {
    const bytes = Uint8Array.from(Buffer.from("from s3"));
    testState.send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
      ContentType: "text/plain",
      ContentLength: bytes.length,
    });

    const adapter = createS3StorageAdapter();
    expect(await adapter.get("docs/a.txt")).toEqual({
      body: Buffer.from(bytes),
      contentType: "text/plain",
      size: bytes.length,
    });
    expect(testState.getInputs[0]).toMatchObject({ Bucket: "unit-test-bucket", Key: "docs/a.txt" });
  });

  it("returns null for missing keys", async () => {
    testState.send.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );
    const adapter = createS3StorageAdapter();
    await expect(adapter.get("missing.txt")).resolves.toBeNull();
  });

  it("deletes objects", async () => {
    testState.send.mockResolvedValueOnce({});
    const adapter = createS3StorageAdapter();
    await expect(adapter.delete("docs/a.txt")).resolves.toBeUndefined();
    expect(testState.deleteInputs[0] as S3KeyInput).toEqual({
      Bucket: "unit-test-bucket",
      Key: "docs/a.txt",
    });
  });

  it("wraps failures without leaking secrets and validates keys", async () => {
    testState.send.mockRejectedValueOnce(new Error("signed secret credential leaked"));
    const adapter = createS3StorageAdapter();
    const body = Buffer.from("x");
    const error = await adapter
      .put({ key: "docs/a.txt", contentType: "text/plain", body, size: body.length })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).not.toContain("secret");
    await expect(adapter.get("../escape")).rejects.toBeInstanceOf(StorageError);
    await expect(adapter.delete("a\\b")).rejects.toBeInstanceOf(StorageError);
  });
});

describe("default storage adapter", () => {
  it("memoizes selection and delegates through the stable export", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "modubex-storage-default-"));
    testState.localRoot = root;
    try {
      resetStorageAdapterForTests();
      const first = getStorageAdapter();
      expect(getStorageAdapter()).toBe(first);

      const body = Buffer.from("delegated");
      await storage.put({
        key: "default/file.bin",
        contentType: "application/octet-stream",
        body,
        size: body.length,
      });
      expect((await storage.get("default/file.bin"))?.body.equals(body)).toBe(true);

      resetStorageAdapterForTests();
      expect(getStorageAdapter()).not.toBe(first);
    } finally {
      resetStorageAdapterForTests();
      await rm(root, { recursive: true, force: true });
    }
  });
});
