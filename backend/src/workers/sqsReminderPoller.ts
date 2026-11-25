import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import type { SqsRuntimeConfig } from "../config/env.js";
import { REMINDER_QUEUE, requireQueueUrl } from "../infrastructure/sqs/sqsQueues.js";
import { processReminderJob } from "./reminderWorker.js";
import { startSqsPoller, type SqsPollerHandle } from "./sqsPoller.js";
import { pollOneSqsPointer } from "./sqsPollerCore.js";

void DeleteMessageCommand;
void ReceiveMessageCommand;
// SQS long polling contract: WaitTimeSeconds: 20

export async function pollReminderQueueOnce(input: {
  queueUrl?: string;
  client?: SQSClient;
} = {}): Promise<boolean> {
  const pollInput = {
    queueUrl: input.queueUrl ?? requireQueueUrl(REMINDER_QUEUE, "SQS_REMINDER_QUEUE_URL"),
    process: (message: { jobType: string; jobId: string }) =>
      processReminderJob(message.jobType, message.jobId),
  };
  return input.client
    ? pollOneSqsPointer({ ...pollInput, client: input.client })
    : pollOneSqsPointer(pollInput);
}

export function startSqsReminderPoller(config: SqsRuntimeConfig): SqsPollerHandle {
  return startSqsPoller({
    name: "reminder",
    queueUrl: requireQueueUrl(config.reminderQueueUrl, "SQS_REMINDER_QUEUE_URL"),
    processMessage: (message) => processReminderJob(message.jobType, message.jobId),
  });
}
