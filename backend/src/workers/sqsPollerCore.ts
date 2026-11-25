import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import { getSqsClient } from "../infrastructure/sqs/sqsClient.js";
import { SQS_WAIT_TIME_SECONDS } from "../infrastructure/sqs/sqsQueues.js";

export type SqsPointer = {
  jobType: string;
  jobId: string;
};

export function parseSqsPointer(body: string | undefined): SqsPointer {
  const parsed = JSON.parse(body ?? "{}") as Partial<SqsPointer>;
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "jobId" ||
    keys[1] !== "jobType" ||
    typeof parsed.jobType !== "string" ||
    typeof parsed.jobId !== "string"
  ) {
    throw new Error("Invalid SQS pointer message");
  }
  return { jobType: parsed.jobType, jobId: parsed.jobId };
}

export async function pollOneSqsPointer(input: {
  queueUrl: string;
  process: (message: SqsPointer) => Promise<void>;
  client?: SQSClient | undefined;
}): Promise<boolean> {
  const client = input.client ?? getSqsClient();
  const response = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: input.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: SQS_WAIT_TIME_SECONDS,
    }),
  );
  const message = response.Messages?.[0];
  if (!message) {
    return false;
  }

  const pointer = parseSqsPointer(message.Body);
  await input.process(pointer);

  if (message.ReceiptHandle) {
    await client.send(
      new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }
  return true;
}
