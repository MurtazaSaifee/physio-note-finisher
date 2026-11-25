import { beforeEach, describe, expect, it } from "vitest";

import {
  createVoiceJobStore,
  enqueueTranscriptionJob,
  getVoiceJobStatus,
  markVoiceJobProcessing,
  markVoiceJobSucceeded,
  markVoiceJobFailed,
  retryVoiceJob,
  resetVoiceJobStore,
} from "../../src/domain/voice/voiceJobService.js";

describe("voiceJobService", () => {
  beforeEach(() => {
    resetVoiceJobStore();
  });

  it("tracks queued -> processing -> succeeded transitions", async () => {
    const store = createVoiceJobStore();
    const queued = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    expect(queued.status).toBe("queued");

    const processing = await markVoiceJobProcessing(store, queued.jobId, "clinic-1");
    expect(processing.status).toBe("processing");

    const succeeded = await markVoiceJobSucceeded(store, queued.jobId, "clinic-1");
    expect(succeeded.status).toBe("succeeded");

    const status = await getVoiceJobStatus(store, queued.jobId, "clinic-1");
    expect(status.status).toBe("succeeded");
  });

  it("stores the uploaded audio key on queued transcription jobs", async () => {
    const store = createVoiceJobStore();
    const queued = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
      storageKey: "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
      durationSeconds: 75,
    });

    expect(queued.storageKey).toBe("clinics/clinic-1/voice-uploads/upload-1/audio.m4a");
    expect(queued.durationSeconds).toBe(75);
    await expect(getVoiceJobStatus(store, queued.jobId, "clinic-1")).resolves.toMatchObject({
      storageKey: "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
      durationSeconds: 75,
    });
  });

  it("increments attempts on failed retries and blocks retries after max attempts", async () => {
    const store = createVoiceJobStore();
    const queued = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    await markVoiceJobProcessing(store, queued.jobId, "clinic-1");
    await markVoiceJobFailed(store, queued.jobId, "clinic-1", "provider timeout");

    const retried = await retryVoiceJob(store, queued.jobId, "clinic-1");
    expect(retried.status).toBe("queued");
    expect(retried.attempt).toBe(2);

    await markVoiceJobProcessing(store, queued.jobId, "clinic-1");
    await markVoiceJobFailed(store, queued.jobId, "clinic-1", "provider timeout");
    await retryVoiceJob(store, queued.jobId, "clinic-1");

    await markVoiceJobProcessing(store, queued.jobId, "clinic-1");
    await markVoiceJobFailed(store, queued.jobId, "clinic-1", "provider timeout");

    await expect(retryVoiceJob(store, queued.jobId, "clinic-1")).rejects.toThrow(
      "Retry limit reached",
    );
  });

  it("rejects retry for succeeded jobs", async () => {
    const store = createVoiceJobStore();
    const queued = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    await markVoiceJobProcessing(store, queued.jobId, "clinic-1");
    await markVoiceJobSucceeded(store, queued.jobId, "clinic-1");

    await expect(retryVoiceJob(store, queued.jobId, "clinic-1")).rejects.toThrow(
      "Cannot retry succeeded job",
    );
  });
});
