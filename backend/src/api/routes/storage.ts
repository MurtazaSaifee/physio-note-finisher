import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import {
  extractStorageKey,
  getLocalStoragePath,
} from "../../infrastructure/storage/localStorageProvider.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".json":
      return "application/json";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function serveFile(
  key: string,
  clinicId: string,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const cleanKey = extractStorageKey(key);
  if (!cleanKey.startsWith(`clinics/${clinicId}/`)) {
    return reply.code(403).send({ error: "Forbidden" });
  }

  try {
    const filePath = getLocalStoragePath(cleanKey);
    const buffer = await fsPromises.readFile(filePath);
    const contentType = getContentType(filePath);
    return reply
      .header("content-type", contentType)
      .header("cache-control", "private, max-age=300")
      .send(buffer);
  } catch (error) {
    return reply.code(404).send({ error: "File not found" });
  }
}

export function registerStorageRoutes(app: FastifyInstance): void {
  app.get("/api/v1/storage/download/*", {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const wildcard = (request.params as Record<string, string>)["*"] ?? "";
    if (!wildcard) {
      return reply.code(400).send({ error: "Storage key required" });
    }
    return serveFile(
      wildcard,
      (request as AuthenticatedRequest).auth.clinicId,
      reply,
    );
  });

  app.get("/api/v1/storage/download/:key", {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const key = (request.params as { key: string }).key;
    if (!key) {
      return reply.code(400).send({ error: "Storage key required" });
    }
    return serveFile(
      key,
      (request as AuthenticatedRequest).auth.clinicId,
      reply,
    );
  });
}
