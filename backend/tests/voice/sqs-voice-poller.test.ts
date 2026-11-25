import { describe, expect, it, vi } from "vitest";

import type { VoiceJobStore } from "../../src/domain/voice/voiceJobService.js";

const mocks = vi.hoisted(() => ({
  capturedPollerOptions: undefined as
    | {
        name: string;
        queueUrl: string;
        processMessage(message: { jobType: string; jobId: string }): Promise<void>;
      }
    | undefined,
  processVoicePipelineJob: vi.fn(async () => undefined),
}));

vi.mock("../../src/workers/sqsPoller.js", () => ({
  startSqsPoller: vi.fn((options) => {
    mocks.capturedPollerOptions = options;
    return { stop: vi.fn(async () => undefined) };
  }),
}));

vi.mock("../../src/infrastructure/sqs/sqsQueues.js", () => ({
  VOICE_QUEUE: "voice",
  requireQueueUrl: vi.fn((value) => value ?? "https://sqs.example.com/voice"),
}));

vi.mock("../../src/workers/voiceWorker.js", () => ({
  processVoicePipelineJob: mocks.processVoicePipelineJob,
}));

describe("startSqsVoicePoller", () => {
  it("uses the injected voice job store for production poller messages", async () => {
    const { startSqsVoicePoller } = await import("../../src/workers/sqsVoicePoller.js");
    const store = { find: vi.fn() } as unknown as VoiceJobStore;
    const sttProvider = { transcribe: vi.fn() };
    const clinicalNoteProvider = { generateSoapDraft: vi.fn() };
    const patientSummaryProvider = { generatePatientSummary: vi.fn() };

    startSqsVoicePoller(
      {
        awsRegion: "ap-south-1",
        voiceQueueUrl: "https://sqs.example.com/voice",
        calendarQueueUrl: undefined,
        reminderQueueUrl: undefined,
        exportQueueUrl: undefined,
        waitTimeSeconds: 20,
      },
      { sttProvider, clinicalNoteProvider, patientSummaryProvider },
      { store },
    );

    await mocks.capturedPollerOptions?.processMessage({
      jobType: "transcription",
      jobId: "job-1",
    });

    expect(mocks.processVoicePipelineJob).toHaveBeenCalledWith(
      "transcription",
      "job-1",
      store,
      sttProvider,
      clinicalNoteProvider,
      patientSummaryProvider,
    );
  });
});
