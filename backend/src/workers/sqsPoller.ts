import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

import { SQS_WAIT_TIME_SECONDS, type SqsPointerMessage } from "../infrastructure/sqs/sqsQueues.js";
import { getSqsClient } from "../infrastructure/sqs/sqsClient.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger({ component: "sqsPoller" });

export type SqsPollerHandle = {
  stop(): Promise<void>;
};

type StartSqsPollerOptions = {
  queueUrl: string;
  name: string;
  processMessage(message: SqsPointerMessage): Promise<void>;
};

function pollerFailurePayload(
  poller: string,
  errorCode: string,
  error: unknown,
): Record<string, unknown> {
  if (poller === "voice") {
    return {
      poller,
      errorCode,
      errorClass: "VoiceSqsPollerFailure",
    };
  }

  return {
    poller,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function parsePointerMessage(body: string | undefined): SqsPointerMessage {
  const parsed = JSON.parse(body ?? "{}") as Partial<SqsPointerMessage>;
  if (
    typeof parsed.jobType !== "string" ||
    typeof parsed.jobId !== "string" ||
    !parsed.jobType.trim() ||
    !parsed.jobId.trim()
  ) {
    throw new Error("Invalid SQS pointer message");
  }
  return { jobType: parsed.jobType, jobId: parsed.jobId };
}

export function startSqsPoller(options: StartSqsPollerOptions): SqsPollerHandle {
  let stopped = false;

  async function deleteMessage(receiptHandle: string): Promise<void> {
    await getSqsClient().send(
      new DeleteMessageCommand({
        QueueUrl: options.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async function poll(): Promise<void> {
    while (!stopped) {
      const response = await getSqsClient().send(
        new ReceiveMessageCommand({
          QueueUrl: options.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: SQS_WAIT_TIME_SECONDS,
        }),
      );

      for (const message of response.Messages ?? []) {
        if (!message.ReceiptHandle) {
          continue;
        }

        let pointer: SqsPointerMessage;
        try {
          pointer = parsePointerMessage(message.Body);
        } catch (error) {
          logger.error("sqs.poller.message.failed", {
            ...pollerFailurePayload(options.name, "voice_sqs_invalid_message", error),
          });

          try {
            await deleteMessage(message.ReceiptHandle);
          } catch (deleteError) {
            logger.error("sqs.poller.message.delete_failed", {
              ...pollerFailurePayload(options.name, "voice_sqs_delete_failed", deleteError),
            });
          }
          continue;
        }

        try {
          await options.processMessage(pointer);
          await deleteMessage(message.ReceiptHandle);
        } catch (error) {
          logger.error("sqs.poller.message.failed", {
            ...pollerFailurePayload(options.name, "voice_sqs_message_failed", error),
          });
        }
      }
    }
  }

  const activeLoop = poll().catch((error) => {
    logger.error("sqs.poller.failed", {
      ...pollerFailurePayload(options.name, "voice_sqs_poll_failed", error),
    });
  });

  return {
    async stop() {
      stopped = true;
      await activeLoop;
    },
  };
}
