import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("../../src/infrastructure/sqs/sqsClient.js", () => ({
  getSqsClient: () => ({ send: sendMock }),
}));

describe("SQS queue helpers", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ MessageId: "message-123" });
  });

  it("sends pointer messages with only jobType and jobId", async () => {
    const { sendPointerMessage } = await import(
      "../../src/infrastructure/sqs/sqsQueues.js"
    );

    await sendPointerMessage("https://sqs.example/voice", {
      jobType: "transcription",
      jobId: "job-123",
    });

    const command = sendMock.mock.calls[0]?.[0];
    expect(command.input.QueueUrl).toBe("https://sqs.example/voice");
    expect(JSON.parse(command.input.MessageBody)).toEqual({
      jobType: "transcription",
      jobId: "job-123",
    });
    expect(Object.keys(JSON.parse(command.input.MessageBody)).sort()).toEqual([
      "jobId",
      "jobType",
    ]);
  });

  it("rejects extra SQS message fields", async () => {
    const { sendPointerMessage } = await import(
      "../../src/infrastructure/sqs/sqsQueues.js"
    );

    await expect(
      sendPointerMessage("https://sqs.example/voice", {
        jobType: "transcription",
        jobId: "job-123",
        clinicId: "clinic-123",
      } as { jobType: string; jobId: string }),
    ).rejects.toThrow("SQS pointer messages may contain only jobType and jobId");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("voice and calendar producers send only pointer message bodies", async () => {
    const { createSqsStageQueue } = await import("../../src/workers/voiceWorker.js");
    const { createSqsGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    await createSqsStageQueue("https://sqs.example/voice").add(
      "transcription",
      {
        jobId: "voice-job-1",
        clinicId: "clinic-secret",
        transcript: "clinical transcript",
        soap: "SOAP text",
        patientName: "Ada",
        oauthToken: "token",
        presignedUrl: "https://signed.example",
      },
    );
    await createSqsGoogleCalendarQueue("https://sqs.example/calendar").add(
      "push",
      {
        clinicId: "clinic-1",
        userId: "user-1",
        appointmentId: "appt-1",
        patientName: "Ada",
        oauthToken: "token",
      },
    );

    for (const call of sendMock.mock.calls) {
      const body = JSON.parse(call[0].input.MessageBody);
      expect(Object.keys(body).sort()).toEqual(["jobId", "jobType"]);
      expect(JSON.stringify(body)).not.toMatch(
        /clinic-secret|clinical transcript|SOAP text|Ada|token|signed/i,
      );
    }
  });

  it("deletes SQS messages only after processing succeeds", async () => {
    const sentCommands: unknown[] = [];
    const client = {
      send: vi.fn(async (command: { input: Record<string, unknown> }) => {
        sentCommands.push(command);
        if ("WaitTimeSeconds" in command.input) {
          return {
            Messages: [
              {
                Body: JSON.stringify({ jobType: "transcription", jobId: "job-1" }),
                ReceiptHandle: "receipt-1",
              },
            ],
          };
        }
        return {};
      }),
    };
    const { pollOneSqsPointer } = await import("../../src/workers/sqsPollerCore.js");
    const process = vi.fn().mockResolvedValue(undefined);

    await pollOneSqsPointer({
      queueUrl: "https://sqs.example/voice",
      client: client as never,
      process,
    });

    expect(process).toHaveBeenCalledWith({
      jobType: "transcription",
      jobId: "job-1",
    });
    expect(sentCommands).toHaveLength(2);
    expect(sentCommands[0]).toMatchObject({
      input: { WaitTimeSeconds: 20 },
    });
    expect(sentCommands[1]).toMatchObject({
      input: { ReceiptHandle: "receipt-1" },
    });
  });

  it("does not delete SQS messages when processing fails", async () => {
    const client = {
      send: vi.fn(async (command: { input: Record<string, unknown> }) => {
        if ("WaitTimeSeconds" in command.input) {
          return {
            Messages: [
              {
                Body: JSON.stringify({ jobType: "transcription", jobId: "job-1" }),
                ReceiptHandle: "receipt-1",
              },
            ],
          };
        }
        return {};
      }),
    };
    const { pollOneSqsPointer } = await import("../../src/workers/sqsPollerCore.js");

    await expect(
      pollOneSqsPointer({
        queueUrl: "https://sqs.example/voice",
        client: client as never,
        process: vi.fn().mockRejectedValue(new Error("processor failed")),
      }),
    ).rejects.toThrow("processor failed");

    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
