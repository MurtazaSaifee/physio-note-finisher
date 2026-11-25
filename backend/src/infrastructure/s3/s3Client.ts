import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "s3Client" });

const LOCAL_DOWNLOAD_PREFIX = "/api/v1/storage/download/";

let _client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!_client) {
    const region = process.env.S3_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!region) {
      throw new Error("S3_REGION is required");
    }

    const config: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
      region,
    };

    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }

    _client = new S3Client(config);
  }
  return _client;
}

export function resetS3Client(): void {
  _client = undefined;
}

function isS3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.S3_REGION);
}

export function isLocalStorageMode(): boolean {
  return !isS3Configured();
}

export function getLocalStorageDir(): string {
  return path.resolve(
    process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "tmp", "uploads"),
  );
}

/**
 * Normalise a caller-supplied storage key to a canonical relative POSIX key.
 * Returns null for anything that is absolute or climbs out of the storage root
 * (for example `clinics/a/../b/file`), so callers can authorise on the result.
 */
export function normalizeStorageKey(rawKey: string): string | null {
  let key = rawKey;
  if (key.startsWith("file://")) {
    key = key.slice("file://".length);
  }
  if (key.startsWith(LOCAL_DOWNLOAD_PREFIX)) {
    key = key.slice(LOCAL_DOWNLOAD_PREFIX.length);
    try {
      key = decodeURIComponent(key);
    } catch {
      return null;
    }
  }
  if (key.includes("\\") || key.includes("\0") || path.posix.isAbsolute(key)) {
    return null;
  }
  const normalized = path.posix.normalize(key);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized;
}

/** Resolve a storage key to a file path that is guaranteed to stay inside the storage root. */
export function getLocalStoragePath(storageKey: string): string {
  const baseDir = getLocalStorageDir();
  const key = normalizeStorageKey(extractS3Key(storageKey));
  if (!key) {
    throw new Error("Invalid storage key");
  }
  const candidate = path.resolve(baseDir, key);
  const relative = path.relative(baseDir, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage key");
  }
  return candidate;
}

export function extractS3Key(keyOrUrl: string): string {
  const bucket = process.env.S3_BUCKET ?? "";
  let key = keyOrUrl;
  if (keyOrUrl.startsWith("file://") || keyOrUrl.startsWith(LOCAL_DOWNLOAD_PREFIX)) {
    return keyOrUrl;
  }

  try {
    const url = new URL(keyOrUrl);
    let extracted = url.pathname.replace(/^\//, "");
    const isPathStyle = url.hostname.startsWith("s3.");
    if (isPathStyle && extracted.startsWith(bucket + "/")) {
      extracted = extracted.slice(bucket.length + 1);
    }
    key = decodeURIComponent(extracted);
  } catch {
    // Not a URL — treat as raw key
  }

  return key;
}

/**
 * Upload an object to S3 or local filesystem (dev fallback).
 * Accepts a Buffer as body.
 */
export async function putObject(storageKey: string, body: Buffer, contentType?: string): Promise<void> {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!;
    const key = extractS3Key(storageKey);
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? "application/octet-stream",
    });
    await client.send(command);
    logger.info("s3.object_uploaded", { bucket, key, size: body.length });
    return;
  }

  // Local filesystem fallback for development
  const filePath = getLocalStoragePath(storageKey);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, body);
  logger.info("local.object_uploaded", { size: body.length });
}

/**
 * Download an object from S3 or local filesystem (dev fallback).
 * Returns the object contents as a Buffer.
 */
export async function getObject(storageKey: string): Promise<Buffer> {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!;
    const key = extractS3Key(storageKey);
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(command);
    // response.Body is an SdkStream / Readable in Node.js
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = response.Body as any;
    if (body && typeof body.transformToByteArray === "function") {
      const arr = await body.transformToByteArray();
      return Buffer.from(arr);
    }
    // Fallback: collect chunks from readable stream
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    logger.info("s3.object_downloaded", { bucket, key, size: buffer.length });
    return buffer;
  }

  // Local filesystem fallback for development
  const filePath = getLocalStoragePath(storageKey);
  const buffer = await fsPromises.readFile(filePath);
  logger.info("local.object_downloaded", { size: buffer.length });
  return buffer;
}

/**
 * Check whether an object exists in S3 or local filesystem.
 */
export async function objectExists(storageKey: string): Promise<boolean> {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!;
    const key = extractS3Key(storageKey);
    try {
      const client = getS3Client();
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      await client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  const filePath = getLocalStoragePath(storageKey);
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete an object from S3 by its full URL or bucket key.
 * Accepts either a full S3 URL (https://bucket.s3.region.amazonaws.com/key)
 * or just the object key.
 */
export async function deleteObject(keyOrUrl: string): Promise<void> {
  if (!isS3Configured()) {
    const filePath = getLocalStoragePath(keyOrUrl);
    await fsPromises.rm(filePath, { force: true });
    logger.info("local.object_deleted", {});
    return;
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is required");
  }

  const key = extractS3Key(keyOrUrl);
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);

  logger.info("s3.object_deleted", {
    bucket,
    key,
  });
}

/**
 * Create a presigned URL for uploading an object directly to S3.
 * Signs a PutObjectCommand with the given content type and expiry.
 * Returns a local fallback URL when S3 is not configured (dev mode).
 */
export async function createPresignedUploadUrl(
  storageKey: string,
  contentType: string,
  expiresInSeconds?: number,
): Promise<string> {
  const ttl = expiresInSeconds ?? Number(process.env.PRESIGNED_UPLOAD_TTL_SECONDS || "300");

  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!;
    const key = extractS3Key(storageKey);
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(client, command, {
      expiresIn: ttl,
      signableHeaders: new Set(["content-type"]),
    });
    logger.info("s3.presigned_upload_url_created", { bucket, key, contentType, ttl });
    return url;
  }

  // Local fallback: return a local upload path for dev mode
  const parts = storageKey.split("/");
  const uploadId = parts.at(-2);
  if (!uploadId) {
    throw new Error("Invalid voice upload storage key");
  }
  return `/api/v1/voice/uploads/${uploadId}/binary`;
}

/**
 * Create a presigned URL for downloading an object from S3.
 * Signs a GetObjectCommand with the given expiry.
 * Returns a local file path when S3 is not configured (dev mode).
 */
export async function createPresignedDownloadUrl(
  storageKey: string,
  expiresInSeconds?: number,
): Promise<string> {
  const ttl = expiresInSeconds ?? Number(process.env.PRESIGNED_DOWNLOAD_TTL_SECONDS || "900");

  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!;
    const key = extractS3Key(storageKey);
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(client, command, {
      expiresIn: ttl,
    });
    logger.info("s3.presigned_download_url_created", { bucket, key, ttl });
    return url;
  }

  // Local fallback: an authenticated, clinic-scoped API route serves the file
  // (see api/routes/storage.ts). Validate the key before handing out a URL.
  const key = normalizeStorageKey(extractS3Key(storageKey));
  if (!key) {
    throw new Error("Invalid storage key");
  }
  return `${LOCAL_DOWNLOAD_PREFIX}${encodeURIComponent(key)}`;
}
