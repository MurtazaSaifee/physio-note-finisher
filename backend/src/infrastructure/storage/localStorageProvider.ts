import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "localStorageProvider" });

export function getLocalStorageDir(): string {
  return process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "tmp");
}

export function extractStorageKey(keyOrUrl: string): string {
  let key = keyOrUrl;
  if (key.startsWith("file://")) {
    key = key.slice(7);
  }
  try {
    const url = new URL(keyOrUrl);
    if (url.pathname.startsWith("/api/v1/storage/download/")) {
      key = decodeURIComponent(url.pathname.replace("/api/v1/storage/download/", ""));
    } else {
      key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    }
  } catch {
    // Raw key or path
  }
  if (key.startsWith("/api/v1/storage/download/")) {
    key = decodeURIComponent(key.replace("/api/v1/storage/download/", ""));
  }
  return key.replace(/^\/+/, "");
}

export function getLocalStoragePath(storageKey: string): string {
  const baseDir = path.resolve(getLocalStorageDir());
  const cleanKey = extractStorageKey(storageKey);
  const candidate = path.resolve(baseDir, cleanKey);
  const relative = path.relative(baseDir, candidate);

  if (
    cleanKey.length === 0 ||
    path.isAbsolute(cleanKey) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Invalid storage key");
  }

  return candidate;
}

export async function putObject(
  storageKey: string,
  body: Buffer,
  _contentType?: string,
): Promise<void> {
  const filePath = getLocalStoragePath(storageKey);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, body);
  logger.info("local_storage.object_uploaded", { path: filePath, size: body.length });
}

export async function getObject(storageKey: string): Promise<Buffer> {
  const filePath = getLocalStoragePath(storageKey);
  const buffer = await fsPromises.readFile(filePath);
  logger.info("local_storage.object_downloaded", { path: filePath, size: buffer.length });
  return buffer;
}

export async function objectExists(storageKey: string): Promise<boolean> {
  const filePath = getLocalStoragePath(storageKey);
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(keyOrUrl: string): Promise<void> {
  const filePath = getLocalStoragePath(keyOrUrl);
  await fsPromises.rm(filePath, { force: true });
  logger.info("local_storage.object_deleted", { path: filePath });
}

export async function createPresignedUploadUrl(
  storageKey: string,
  _contentType: string,
  _expiresInSeconds?: number,
): Promise<string> {
  const parts = storageKey.split("/");
  const uploadId = parts.at(-2);
  if (!uploadId) {
    throw new Error("Invalid voice upload storage key");
  }
  return `/api/v1/voice/uploads/${uploadId}/binary`;
}

export async function createPresignedDownloadUrl(
  storageKey: string,
  _expiresInSeconds?: number,
): Promise<string> {
  const cleanKey = extractStorageKey(storageKey);
  return `/api/v1/storage/download/${encodeURIComponent(cleanKey)}`;
}

export const LocalStorageProvider = {
  putObject,
  getObject,
  objectExists,
  deleteObject,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  getLocalStoragePath,
  getLocalStorageDir,
  extractStorageKey,
};
