import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const errorMock = vi.fn();

vi.mock("../../src/infrastructure/sqs/sqsClient.js", () => ({
  getSqsClient: () => ({ send: sendMock }),
}));

vi.mock("../../src/observability/logger.js", () => ({
  createLogger: () => ({ error: errorMock }),
}));

function isReceiveCommand(command: { input: Record<string, unknown> }): boolean {
  return "WaitTimeSeconds" in command.input;
}

async function waitUntil(
  check: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

describe("startSqsPoller", () => {
  beforeEach(() => {
    sendMock.mockReset();
    errorMock.mockReset();
  });

  it("continues polling after malformed pointer and deletes malformed message", async () => {
    let receiveCount = 0;
    const deletedHandles: string[] = [];

    sendMock.mockImplementation(
      async (command: { input: Record<string, unknown> }) => {
        if (isReceiveCommand(command)) {
          receiveCount += 1;
          if (receiveCount === 1) {
            return {
              Messages: [{ Body: "{bad-json", ReceiptHandle: "receipt-bad" }],
            };
          }
          if (receiveCount === 2) {
            return {
              Messages: [
                {
                  Body: JSON.stringify({
                    jobType: "transcription",
                    jobId: "job-1",
                  }),
                  ReceiptHandle: "receipt-good",
                },
              ],
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { Messages: [] };
        }

        const receiptHandle = command.input.ReceiptHandle;
        if (typeof receiptHandle === "string") {
          deletedHandles.push(receiptHandle);
        }
        return {};
      },
    );

    const { startSqsPoller } = await import("../../src/workers/sqsPoller.js");
    const processMessage = vi.fn().mockResolvedValue(undefined);

    const handle = startSqsPoller({
      queueUrl: "https://sqs.example/voice",
      name: "voice",
      processMessage,
    });

    await waitUntil(() => processMessage.mock.calls.length === 1);
    await handle.stop();

    expect(processMessage).toHaveBeenCalledWith({
      jobType: "transcription",
      jobId: "job-1",
    });
    expect(deletedHandles).toEqual(["receipt-bad", "receipt-good"]);
    expect(errorMock).toHaveBeenCalledWith(
      "sqs.poller.message.failed",
      expect.objectContaining({ poller: "voice" }),
    );
  });

  it("keeps provider sentinel text out of deployed voice poller logs", async () => {
    let receiveCount = 0;
    const deletedHandles: string[] = [];

    sendMock.mockImplementation(
      async (command: { input: Record<string, unknown> }) => {
        if (isReceiveCommand(command)) {
          receiveCount += 1;
          if (receiveCount === 1) {
            return {
              Messages: [
                {
                  Body: JSON.stringify({
                    jobType: "transcription",
                    jobId: "job-fail",
                  }),
                  ReceiptHandle: "receipt-fail",
                },
              ],
            };
          }
          if (receiveCount === 2) {
            return {
              Messages: [
                {
                  Body: JSON.stringify({
                    jobType: "transcription",
                    jobId: "job-ok",
                  }),
                  ReceiptHandle: "receipt-ok",
                },
              ],
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { Messages: [] };
        }

        const receiptHandle = command.input.ReceiptHandle;
        if (typeof receiptHandle === "string") {
          deletedHandles.push(receiptHandle);
        }
        return {};
      },
    );

    const { startSqsPoller } = await import("../../src/workers/sqsPoller.js");
    const providerText = "Patient Meera Nair has sciatica; api_key=provider-secret-321";
    const processMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error(providerText))
      .mockResolvedValueOnce(undefined);

    const handle = startSqsPoller({
      queueUrl: "https://sqs.example/voice",
      name: "voice",
      processMessage,
    });

    await waitUntil(() => processMessage.mock.calls.length === 2);
    await handle.stop();

    expect(processMessage).toHaveBeenNthCalledWith(1, {
      jobType: "transcription",
      jobId: "job-fail",
    });
    expect(processMessage).toHaveBeenNthCalledWith(2, {
      jobType: "transcription",
      jobId: "job-ok",
    });
    expect(deletedHandles).toEqual(["receipt-ok"]);
    expect(errorMock).toHaveBeenCalledWith(
      "sqs.poller.message.failed",
      expect.objectContaining({
        poller: "voice",
        errorCode: "voice_sqs_message_failed",
        errorClass: "VoiceSqsPollerFailure",
      }),
    );
    expect(JSON.stringify(errorMock.mock.calls)).not.toContain(providerText);
    expect(JSON.stringify(errorMock.mock.calls)).not.toContain("provider-secret-321");
  });
});
