import { promises as fsPromises } from "node:fs";
import path from "node:path";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  getLocalStoragePath,
  normalizeStorageKey,
} from "../../infrastructure/s3/s3Client.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".txt": "text/plain",
};

/**
 * Serves locally stored files (exports, recordings) when the API runs without
 * S3. In cloud mode the export routes hand out presigned S3 URLs instead, so
 * this route is only registered for local storage.
 *
 * Authorisation happens on the *normalised* key, so `clinics/<own>/../<other>/x`
 * is rejected rather than slipping past a naive prefix check.
 */
async function serveFile(
  rawKey: string,
  clinicId: string,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const key = normalizeStorageKey(rawKey);
  if (!key) {
    return reply.code(400).send({ error: "Invalid storage key" });
  }
  if (!key.startsWith(`clinics/${clinicId}/`)) {
    return reply.code(403).send({ error: "Forbidden" });
  }

  let filePath: string;
  try {
    filePath = getLocalStoragePath(key);
  } catch {
    return reply.code(400).send({ error: "Invalid storage key" });
  }

  try {
    const buffer = await fsPromises.readFile(filePath);
    const contentType =
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return reply
      .header("content-type", contentType)
      .header("cache-control", "private, max-age=300")
      .send(buffer);
  } catch {
    return reply.code(404).send({ error: "File not found" });
  }
}

export function registerStorageRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/storage/download/*",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const wildcard = (request.params as Record<string, string>)["*"] ?? "";
      if (!wildcard) {
        return reply.code(400).send({ error: "Storage key required" });
      }
      let key = wildcard;
      try {
        key = decodeURIComponent(wildcard);
      } catch {
        return reply.code(400).send({ error: "Invalid storage key" });
      }
      return serveFile(key, (request as AuthenticatedRequest).auth.clinicId, reply);
    },
  );
}
