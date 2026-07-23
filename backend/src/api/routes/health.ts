import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import { prisma } from "../../data/prismaClient.js";
import { getLocalStorageDir } from "../../infrastructure/storage/localStorageProvider.js";

async function checkDb(): Promise<"connected" | "disconnected"> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return "connected";
  } catch {
    return "disconnected";
  }
}

async function checkLocalStorageStatus(): Promise<"ready" | "error"> {
  try {
    const baseDir = getLocalStorageDir();
    await fs.mkdir(baseDir, { recursive: true });
    await fs.access(baseDir);
    return "ready";
  } catch {
    return "error";
  }
}

function checkSarvamStatus(): "configured" | "missing" {
  return process.env.SARVAM_API_KEY?.trim() ? "configured" : "missing";
}

export function registerHealthRoutes(app: FastifyInstance): void {
  const getHealthResponse = async () => {
    const [dbStatus, storageStatus] = await Promise.all([
      checkDb(),
      checkLocalStorageStatus(),
    ]);
    const sarvamStatus = checkSarvamStatus();

    const isOk = dbStatus === "connected" && storageStatus === "ready";

    return {
      status: isOk ? "ok" : "degraded",
      db: dbStatus,
      storage: storageStatus,
      sarvam: sarvamStatus,
    };
  };

  app.get("/api/v1/health", async () => getHealthResponse());
  app.get("/health", async () => getHealthResponse());
}
