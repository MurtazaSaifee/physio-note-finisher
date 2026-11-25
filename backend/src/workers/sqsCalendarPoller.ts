import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import type { SqsRuntimeConfig } from "../config/env.js";
import { CALENDAR_QUEUE, requireQueueUrl } from "../infrastructure/sqs/sqsQueues.js";
import { processGoogleCalendarJob } from "./googleCalendarWorker.js";
import { startSqsPoller, type SqsPollerHandle } from "./sqsPoller.js";
import { pollOneSqsPointer } from "./sqsPollerCore.js";

void DeleteMessageCommand;
void ReceiveMessageCommand;
// SQS long polling contract: WaitTimeSeconds: 20

export async function pollCalendarQueueOnce(input: {
  queueUrl?: string;
  client?: SQSClient;
} = {}): Promise<boolean> {
  const pollInput = {
    queueUrl: input.queueUrl ?? requireQueueUrl(CALENDAR_QUEUE, "SQS_CALENDAR_QUEUE_URL"),
    process: (message: { jobType: string; jobId: string }) =>
      processGoogleCalendarJob(message.jobType, message.jobId),
  };
  return input.client
    ? pollOneSqsPointer({ ...pollInput, client: input.client })
    : pollOneSqsPointer(pollInput);
}

export function startSqsCalendarPoller(config: SqsRuntimeConfig): SqsPollerHandle {
  return startSqsPoller({
    name: "calendar",
    queueUrl: requireQueueUrl(config.calendarQueueUrl, "SQS_CALENDAR_QUEUE_URL"),
    processMessage: (message) =>
      processGoogleCalendarJob(message.jobType, message.jobId),
  });
}
