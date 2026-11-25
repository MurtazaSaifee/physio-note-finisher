import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { parseSqsEnv } from "../../config/env.js";
import { getSqsClient } from "./sqsClient.js";

const sqsEnv = parseSqsEnv();

export const VOICE_QUEUE = sqsEnv.voiceQueueUrl;
export const CALENDAR_QUEUE = sqsEnv.calendarQueueUrl;
export const REMINDER_QUEUE = sqsEnv.reminderQueueUrl;
export const EXPORT_QUEUE = sqsEnv.exportQueueUrl;
export const SQS_WAIT_TIME_SECONDS = sqsEnv.waitTimeSeconds;

export type SqsPointerMessage = {
  jobType: string;
  jobId: string;
};

function validatePointerMessage(message: SqsPointerMessage): void {
  const keys = Object.keys(message).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== "jobId" ||
    keys[1] !== "jobType" ||
    typeof message.jobType !== "string" ||
    typeof message.jobId !== "string" ||
    !message.jobType.trim() ||
    !message.jobId.trim()
  ) {
    throw new Error("SQS pointer messages may contain only jobType and jobId");
  }
}

export async function sendPointerMessage(
  queueUrl: string,
  message: SqsPointerMessage,
): Promise<{ id: string | undefined }> {
  validatePointerMessage(message);

  const response = await getSqsClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        jobType: message.jobType,
        jobId: message.jobId,
      }),
    }),
  );

  return { id: response.MessageId };
}

export function requireQueueUrl(
  queueUrl: string | undefined,
  envName: string,
): string {
  if (!queueUrl) {
    throw new Error(`${envName} is required`);
  }
  return queueUrl;
}
