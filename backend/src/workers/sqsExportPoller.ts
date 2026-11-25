import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import type { SqsRuntimeConfig } from "../config/env.js";
import { prisma } from "../data/prismaClient.js";
import { EXPORT_QUEUE, requireQueueUrl } from "../infrastructure/sqs/sqsQueues.js";
import { processExportJob } from "./exportWorker.js";
import { startSqsPoller, type SqsPollerHandle } from "./sqsPoller.js";
import { pollOneSqsPointer } from "./sqsPollerCore.js";

void DeleteMessageCommand;
void ReceiveMessageCommand;
// SQS long polling contract: WaitTimeSeconds: 20

async function processExportPointer(jobType: string, jobId: string): Promise<void> {
  if (jobType !== "generate_pdf") {
    throw new Error(`Unknown export-generation job type: ${jobType}`);
  }
  const exportRecord = await prisma.exportRecord.findFirst({
    where: { id: jobId },
    select: { id: true, clinicId: true, sessionId: true, fileStatus: true },
  });
  if (!exportRecord) {
    throw new Error(`Export record not found: ${jobId}`);
  }
  if (exportRecord.fileStatus === "succeeded" || exportRecord.fileStatus === "failed") {
    return;
  }
  await processExportJob({
    exportId: exportRecord.id,
    clinicId: exportRecord.clinicId,
    sessionId: exportRecord.sessionId,
  });
}

export async function pollExportQueueOnce(input: {
  queueUrl?: string;
  client?: SQSClient;
} = {}): Promise<boolean> {
  const pollInput = {
    queueUrl: input.queueUrl ?? requireQueueUrl(EXPORT_QUEUE, "SQS_EXPORT_QUEUE_URL"),
    process: (message: { jobType: string; jobId: string }) =>
      processExportPointer(message.jobType, message.jobId),
  };
  return input.client
    ? pollOneSqsPointer({ ...pollInput, client: input.client })
    : pollOneSqsPointer(pollInput);
}

export function startSqsExportPoller(config: SqsRuntimeConfig): SqsPollerHandle {
  return startSqsPoller({
    name: "export",
    queueUrl: requireQueueUrl(config.exportQueueUrl, "SQS_EXPORT_QUEUE_URL"),
    processMessage: (message) => processExportPointer(message.jobType, message.jobId),
  });
}
