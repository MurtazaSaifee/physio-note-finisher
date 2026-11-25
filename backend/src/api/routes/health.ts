import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parseAppEnv } from "../../config/env.js";
import { prisma } from "../../data/prismaClient.js";
import { getSqsClient } from "../../infrastructure/sqs/sqsClient.js";

type HealthComponent = "db" | "queue" | "storage";

function ok(component: HealthComponent, requestId: string): Record<string, string> {
  return { status: "ok", component, requestId };
}

function failed(component: HealthComponent, requestId: string): Record<string, string> {
  return { status: "error", component, requestId };
}

function configuredQueues(): string[] {
  return [
    process.env.SQS_VOICE_QUEUE_URL,
    process.env.SQS_CALENDAR_QUEUE_URL,
    process.env.SQS_REMINDER_QUEUE_URL,
    process.env.SQS_EXPORT_QUEUE_URL,
  ].filter((value): value is string => Boolean(value?.trim()));
}

async function checkLocalStorage(): Promise<void> {
  const baseDir = process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "tmp", "uploads");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.access(baseDir);
}

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/db", async (request, reply) => {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return ok("db", request.id);
    } catch {
      return reply.code(503).send(failed("db", request.id));
    }
  });

  app.get("/health/queue", async (request, reply) => {
    try {
      if (parseAppEnv() === "local") {
        return ok("queue", request.id);
      }

      const queues = configuredQueues();
      if (queues.length === 0) {
        throw new Error("No queues configured");
      }
      const client = getSqsClient();
      await Promise.all(
        queues.map((queueUrl) =>
          client.send(
            new GetQueueAttributesCommand({
              QueueUrl: queueUrl,
              AttributeNames: ["QueueArn"],
            }),
          ),
        ),
      );
      return ok("queue", request.id);
    } catch {
      return reply.code(503).send(failed("queue", request.id));
    }
  });

  app.get("/health/storage", async (request, reply) => {
    try {
      if (parseAppEnv() === "local" && !process.env.S3_BUCKET) {
        await checkLocalStorage();
        return ok("storage", request.id);
      }

      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION;
      if (!bucket || !region) {
        throw new Error("Storage not configured");
      }

      const client = new S3Client({ region });
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return ok("storage", request.id);
    } catch {
      return reply.code(503).send(failed("storage", request.id));
    }
  });
}
