import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import {
  createVoiceJobStore,
  enqueueTranscriptionJob,
  resetVoiceJobStore,
  type VoiceJobRecord,
  type VoiceJobStore,
} from "../../src/domain/voice/voiceJobService.js";
import { runTranscription } from "../../src/domain/voice/transcriptionService.js";
import { registerVoiceJobRoutes } from "../../src/api/routes/voiceJobs.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import type {
  SttProvider,
  ClinicalNoteProvider,
  PatientSummaryProvider,
  TranscriptionResult,
  SoapNoteDraft,
  PatientSummaryDraft,
} from "../../src/domain/voice/providers/providerTypes.js";
import type { StageQueue } from "../../src/workers/voiceWorker.js";
import { createLocalStageQueue, processVoicePipelineJob } from "../../src/workers/voiceWorker.js";
import { putObject } from "../../src/infrastructure/s3/s3Client.js";

const CLINIC_ID = "clinic-wrkr-1";
const PATIENT_ID = "patient-wrkr-1";

function createFakeSttProvider(): SttProvider & { transcribe: ReturnType<typeof vi.fn> } {
  const result: TranscriptionResult = {
    requestId: "stt-req-001",
    transcript: "Patient reports knee pain after physiotherapy session.",
    languageCode: "en-IN",
    languageProbability: 0.98,
    segments: [
      { startTimeSeconds: 0.0, endTimeSeconds: 2.5, text: "Patient reports knee pain" },
      { startTimeSeconds: 2.5, endTimeSeconds: 4.0, text: "after physiotherapy session." },
    ],
  };
  return {
    transcribe: vi.fn().mockResolvedValue(result),
  };
}

function createFakeClinicalNoteProvider(): ClinicalNoteProvider & { generateSoapDraft: ReturnType<typeof vi.fn> } {
  const draft: SoapNoteDraft = {
    subjective: "Patient reports knee pain after running.",
    objective: "Swelling observed. Range of motion limited.",
    assessment: "Patellofemoral pain syndrome likely.",
    plan: "Continue physiotherapy. Ice after activity.",
  };
  return {
    generateSoapDraft: vi.fn().mockResolvedValue(draft),
  };
}

function createFakePatientSummaryProvider(): PatientSummaryProvider & { generatePatientSummary: ReturnType<typeof vi.fn> } {
  const summary: PatientSummaryDraft = {
    message: "Your knee is improving. Continue the exercises and apply ice after activity.",
    safetyNote: null,
    followUp: "See you next week for follow-up.",
  };
  return {
    generatePatientSummary: vi.fn().mockResolvedValue(summary),
  };
}

async function createJobAtStage(
  store: VoiceJobStore,
  stageState: VoiceJobRecord["stageState"],
  opts?: { transcript?: boolean; soapDraft?: boolean; patientSummary?: boolean },
): Promise<VoiceJobRecord> {
  const job = await enqueueTranscriptionJob(store, {
    clinicId: CLINIC_ID,
    patientId: PATIENT_ID,
    uploadId: `upload-${stageState}`,
    stageState,
  });

  const withStage: VoiceJobRecord = {
    ...job,
    stageState,
    status: "queued",
    storageKey: `clinics/${CLINIC_ID}/voice-uploads/${job.uploadId}/audio.m4a`,
  };

  if (opts?.transcript) {
    withStage.transcript = {
      transcriptStatus: "ready",
      text: "Patient reports knee pain after running. Swelling observed.",
      segments: [],
    };
  }

  if (opts?.soapDraft) {
    withStage.soapDraft = JSON.stringify({
      subjective: "Knee pain.",
      objective: "Swelling.",
      assessment: "PFPS.",
      plan: "Continue PT.",
    });
  }

  if (opts?.patientSummary) {
    withStage.patientSummary = "Your knee is improving. Continue exercises.";
  }

  await store.save(withStage);
  return withStage;
}

describe("voice-worker-integration: provider-backed pipeline stages", () => {
  let store: VoiceJobStore;

  beforeEach(() => {
    resetVoiceJobStore();
    store = createVoiceJobStore();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Transcription stage
  // ---------------------------------------------------------------------------
	  describe("transcription stage", () => {
    it("calls SttProvider.transcribe, saves transcript, and sets stageState to transcription_succeeded", async () => {
      const sttProvider = createFakeSttProvider();
      const job = await createJobAtStage(store, "queued_transcription");
      const storageKey = job.storageKey!;

      // Upload sample audio to local storage
      const audioBytes = Buffer.from("fake-audio-data-for-stt");
      await putObject(storageKey, audioBytes, "audio/m4a");

      // Advance job to processing so completeTranscription can run
      const processing: VoiceJobRecord = {
        ...job,
        status: "processing",
        stageState: "transcribing",
        storageKey,
        durationSeconds: 45,
      };
      await store.save(processing);

      // Run transcription with provider
      const result = await runTranscription(store, job.jobId, CLINIC_ID, sttProvider);

      // Assertions
      expect(sttProvider.transcribe).toHaveBeenCalledTimes(1);
      expect(sttProvider.transcribe).toHaveBeenCalledWith(
        expect.any(Buffer),
        { audioDurationSeconds: 45 },
      );
      // Verify audio was passed
      const calledWithBuffer = sttProvider.transcribe.mock.calls[0]?.[0] as Buffer;
      expect(Buffer.isBuffer(calledWithBuffer)).toBe(true);
      expect(calledWithBuffer.length).toBeGreaterThan(0);

      // Transcript must be saved to the voice job
      expect(result.transcript).not.toBeNull();
      expect(result.transcript?.text).toBe("Patient reports knee pain after physiotherapy session.");
      expect(result.transcript?.transcriptStatus).toBe("ready");

      // Stage must advance to transcription_succeeded
      expect(result.stageState).toBe("transcription_succeeded");
      expect(result.status).toBe("succeeded");
	    });

	    it("fails provider-backed transcription when the audio storage key is missing", async () => {
	      const sttProvider = createFakeSttProvider();
	      const job = await enqueueTranscriptionJob(store, {
	        clinicId: CLINIC_ID,
	        patientId: PATIENT_ID,
	        uploadId: "upload-missing-storage-key",
	        stageState: "transcribing",
	      });
	      await store.save({ ...job, status: "processing", stageState: "transcribing" });

	      const result = await runTranscription(store, job.jobId, CLINIC_ID, sttProvider);

	      expect(sttProvider.transcribe).not.toHaveBeenCalled();
	      expect(result.status).toBe("failed");
	      expect(result.stageState).toBe("transcription_failed");
	      expect(result.errorMessage).toBe("Missing uploaded audio storage key");
	    });
	  });

  // ---------------------------------------------------------------------------
  // Test 2: SOAP generation stage
  // ---------------------------------------------------------------------------
  describe("soap generation stage", () => {
    it("calls ClinicalNoteProvider.generateSoapDraft, saves draft, and advances to soap_succeeded", async () => {
      const clinicalNoteProvider = createFakeClinicalNoteProvider();
      const job = await createJobAtStage(store, "generating_soap", { transcript: true });

      // Set to processing state
      const processing: VoiceJobRecord = {
        ...job,
        status: "processing",
        stageState: "generating_soap",
      };
      await store.save(processing);

      // Import the function — will be implemented in GREEN phase
      const { runSoapGeneration } = await import(
        "../../src/domain/voice/soapGenerationService.js"
      );

      const result = await runSoapGeneration(store, job.jobId, CLINIC_ID, clinicalNoteProvider);

      // Assertions
      expect(clinicalNoteProvider.generateSoapDraft).toHaveBeenCalledTimes(1);
      const calledWith = clinicalNoteProvider.generateSoapDraft.mock.calls[0]?.[0];
      expect(calledWith?.transcript).toBe("Patient reports knee pain after running. Swelling observed.");

      // SOAP draft must be saved
      expect(result.soapDraft).not.toBeNull();
      const savedDraft = JSON.parse(result.soapDraft!);
      expect(savedDraft.subjective).toBe("Patient reports knee pain after running.");
      expect(savedDraft.assessment).toBe("Patellofemoral pain syndrome likely.");

      // Stage must advance to soap_succeeded
      expect(result.stageState).toBe("soap_succeeded");
      expect(result.status).toBe("succeeded");
    });

    it("ignores provider metadata when validating and saving the SOAP draft", async () => {
      const clinicalNoteProvider: ClinicalNoteProvider & {
        generateSoapDraft: ReturnType<typeof vi.fn>;
      } = {
        generateSoapDraft: vi.fn().mockResolvedValue({
          subjective: "Patient reports knee pain after running.",
          objective: "Swelling observed. Range of motion limited.",
          assessment: "Patellofemoral pain syndrome likely.",
          plan: "Continue physiotherapy. Ice after activity.",
          metadata: {
            language: "en",
            confidence: "high",
          },
        }),
      };
      const job = await createJobAtStage(store, "generating_soap", { transcript: true });
      await store.save({ ...job, status: "processing", stageState: "generating_soap" });

      const { runSoapGeneration } = await import(
        "../../src/domain/voice/soapGenerationService.js"
      );

      const result = await runSoapGeneration(store, job.jobId, CLINIC_ID, clinicalNoteProvider);

      expect(result.stageState).toBe("soap_succeeded");
      expect(result.status).toBe("succeeded");
      expect(result.soapDraft).not.toBeNull();
      expect(JSON.parse(result.soapDraft!)).toEqual({
        subjective: "Patient reports knee pain after running.",
        objective: "Swelling observed. Range of motion limited.",
        assessment: "Patellofemoral pain syndrome likely.",
        plan: "Continue physiotherapy. Ice after activity.",
      });
    });

    it("fails provider-backed SOAP generation when transcript is missing", async () => {
      const clinicalNoteProvider = createFakeClinicalNoteProvider();
      const job = await createJobAtStage(store, "generating_soap");
      await store.save({ ...job, status: "processing", stageState: "generating_soap" });

      const { runSoapGeneration } = await import(
        "../../src/domain/voice/soapGenerationService.js"
      );

      await expect(
        runSoapGeneration(store, job.jobId, CLINIC_ID, clinicalNoteProvider),
      ).rejects.toThrow(/transcript/i);

      const persisted = await store.find(job.jobId);
      expect(persisted?.status).toBe("processing");
      expect(persisted?.stageState).toBe("generating_soap");
      expect(clinicalNoteProvider.generateSoapDraft).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Summary generation stage
  // ---------------------------------------------------------------------------
  describe("summary generation stage", () => {
    it("calls PatientSummaryProvider.generatePatientSummary, saves summary, and reaches soap_succeeded", async () => {
      const patientSummaryProvider = createFakePatientSummaryProvider();
      const job = await createJobAtStage(store, "generating_summary", {
        transcript: true,
        soapDraft: true,
      });

      // Set to processing state
      const processing: VoiceJobRecord = {
        ...job,
        status: "processing",
        stageState: "generating_summary",
      };
      await store.save(processing);

      // Import the function — will be implemented in GREEN phase
      const { runSummaryGeneration } = await import(
        "../../src/domain/voice/patientSummaryService.js"
      );

      const result = await runSummaryGeneration(store, job.jobId, CLINIC_ID, patientSummaryProvider);

      // Assertions
      expect(patientSummaryProvider.generatePatientSummary).toHaveBeenCalledTimes(1);
      const calledWith = patientSummaryProvider.generatePatientSummary.mock.calls[0]?.[0];
      expect(calledWith?.validatedSoap.subjective).toBe("Knee pain.");

      // Summary must be saved
      expect(result.patientSummary).not.toBeNull();
      expect(result.patientSummary).toBe("Your knee is improving. Continue the exercises and apply ice after activity.");

      // Stage must advance to summary_succeeded
      expect(result.stageState).toBe("summary_succeeded");
      expect(result.status).toBe("succeeded");
    });

    it("rejects invalid SOAP drafts instead of generating a patient summary", async () => {
      const patientSummaryProvider = createFakePatientSummaryProvider();
      const job = await createJobAtStage(store, "generating_summary", {
        transcript: true,
      });
      await store.save({
        ...job,
        status: "processing",
        stageState: "generating_summary",
        soapDraft: "not-json-soap",
      });

      const { runSummaryGeneration } = await import(
        "../../src/domain/voice/patientSummaryService.js"
      );

      await expect(
        runSummaryGeneration(store, job.jobId, CLINIC_ID, patientSummaryProvider),
      ).rejects.toThrow(/SOAP/i);

      const persisted = await store.find(job.jobId);
      expect(persisted?.patientSummary).toBeUndefined();
      expect(persisted?.stageState).toBe("generating_summary");
      expect(patientSummaryProvider.generatePatientSummary).not.toHaveBeenCalled();
    });

    it("keeps provider text out of local queue logs while recording the failed job", async () => {
      const providerText = "Patient Ravi Patel has a new diagnosis; credential=provider-secret-654";
      const previousAppEnv = process.env.APP_ENV;
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const failedProvider: PatientSummaryProvider = {
        generatePatientSummary: vi.fn().mockRejectedValue(new Error(providerText)),
      };
      const job = await createJobAtStage(store, "queued_summary", { soapDraft: true });
      const queue = createLocalStageQueue({
        store,
        voiceProviders: { patientSummaryProvider: failedProvider },
      });

      try {
        process.env.APP_ENV = "staging";
        await queue.add("summary", { jobId: job.jobId }, { jobId: `${job.jobId}-summary` });

        const persisted = await store.find(job.jobId);
        const serializedLogs = errorLog.mock.calls.flat().join(" ");
        expect(persisted?.status).toBe("failed");
        expect(persisted?.stageState).toBe("summary_failed");
        expect(persisted?.errorMessage).toBe("Voice pipeline job failed");
        expect(serializedLogs).toContain('"errorCode":"voice_pipeline_job_failed"');
        expect(serializedLogs).not.toContain(providerText);
        expect(serializedLogs).not.toContain("provider-secret-654");
      } finally {
        if (previousAppEnv === undefined) {
          delete process.env.APP_ENV;
        } else {
          process.env.APP_ENV = previousAppEnv;
        }
        errorLog.mockRestore();
      }
    });
  });

  describe("SQS stage message guards", () => {
    it("treats stale stage messages as idempotent no-ops before mutating the persisted stage", async () => {
      const staleJob = await createJobAtStage(store, "queued_soap", { transcript: true });
      const queue = createCapturingQueue();

      await processVoicePipelineJob(
        "transcription",
        staleJob.jobId,
        store,
        createFakeSttProvider(),
        createFakeClinicalNoteProvider(),
        createFakePatientSummaryProvider(),
        queue,
      );

      const persisted = await store.find(staleJob.jobId);
      expect(persisted?.status).toBe("queued");
      expect(persisted?.stageState).toBe("queued_soap");
      expect(queue.calls).toHaveLength(0);
    });

    it("fails clearly when a queued stage receives the wrong non-stale message", async () => {
      const wrongJob = await createJobAtStage(store, "queued_transcription");

      await expect(
        processVoicePipelineJob("soap", wrongJob.jobId, store),
      ).rejects.toThrow(/does not match queued stage/i);

      const persisted = await store.find(wrongJob.jobId);
      expect(persisted?.status).toBe("queued");
      expect(persisted?.stageState).toBe("queued_transcription");
    });

    it("marks a job failed when handoff enqueue fails after stage advancement", async () => {
      const job = await createJobAtStage(store, "queued_transcription");
      await putObject(job.storageKey!, Buffer.from("fake-audio-data-for-stt"), "audio/m4a");
      const queue: StageQueue = {
        add: vi.fn().mockRejectedValue(new Error("SQS unavailable")),
      };

      await expect(
        processVoicePipelineJob(
          "transcription",
          job.jobId,
          store,
          createFakeSttProvider(),
          createFakeClinicalNoteProvider(),
          createFakePatientSummaryProvider(),
          queue,
        ),
      ).rejects.toThrow("SQS unavailable");

      const persisted = await store.find(job.jobId);
      expect(persisted?.status).toBe("failed");
      expect(persisted?.stageState).toBe("soap_failed");
      expect(persisted?.errorMessage).toBe("Voice pipeline job failed");
    });
  });
});

// ---------------------------------------------------------------------------
// Task 2: Retry-stage boundaries (route-level tests)
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env };
const CLINIC_A = "clinic-wrkr-2";

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

function createCapturingQueue(): StageQueue & { calls: Array<{ name: string; data: unknown; opts?: Record<string, unknown> }> } {
  const calls: Array<{ name: string; data: unknown; opts?: Record<string, unknown> }> = [];
  return {
    calls,
    async add(name, data, opts) {
      calls.push({ name, data, opts });
      return { id: opts?.jobId ?? "mock" };
    },
  };
}

async function buildRetryApp(queue: StageQueue, store?: VoiceJobStore): Promise<FastifyInstance> {
  const app = Fastify();
  registerVoiceJobRoutes(app, queue, store);
  await app.ready();
  return app;
}

describe("retry-stage boundaries: only failed stage re-enqueued", () => {
  let store: VoiceJobStore;

  beforeEach(() => {
    setAuthEnv();
    resetVoiceJobStore();
    store = createVoiceJobStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("retrying soap_failed enqueues only soap stage with deterministic ${jobId}-soap ID", async () => {
    const capturingQueue = createCapturingQueue();
    const app = await buildRetryApp(capturingQueue, store);
    const accessToken = createAccessToken(CLINIC_A);

    // Create a job that has succeeded transcription but failed SOAP
    const job = await enqueueTranscriptionJob(store, {
      clinicId: CLINIC_A,
      patientId: "patient-1",
      uploadId: "upload-soap-fail",
    });

    // Simulate: transcription_succeeded → queued_soap → generating_soap → soap_failed
    const jobWithStages: VoiceJobRecord = {
      ...job,
      stageState: "soap_failed",
      stageRetries: { transcription: 0, soap: 1, summary: 0 },
      status: "failed",
      transcript: {
        transcriptStatus: "ready",
        text: "Patient reports knee pain.",
        segments: [],
      },
    };
    await store.save(jobWithStages);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/voice/jobs/${job.jobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": CLINIC_A,
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.stageState).toBe("queued_soap");

    // Must have enqueued exactly one job: soap
    expect(capturingQueue.calls).toHaveLength(1);
    expect(capturingQueue.calls[0]!.name).toBe("soap");
    // Must use deterministic stage job ID
    expect(capturingQueue.calls[0]!.opts?.jobId).toBe(`${job.jobId}-soap`);
  });

  it("retrying summary_failed enqueues only summary stage with deterministic ${jobId}-summary ID", async () => {
    const capturingQueue = createCapturingQueue();
    const app = await buildRetryApp(capturingQueue, store);
    const accessToken = createAccessToken(CLINIC_A);

    const job = await enqueueTranscriptionJob(store, {
      clinicId: CLINIC_A,
      patientId: "patient-1",
      uploadId: "upload-summary-fail",
    });

    // Simulate: transcription + SOAP succeeded, summary failed
    const jobWithStages: VoiceJobRecord = {
      ...job,
      stageState: "summary_failed",
      stageRetries: { transcription: 0, soap: 0, summary: 1 },
      status: "failed",
      transcript: {
        transcriptStatus: "ready",
        text: "Patient reports knee pain.",
        segments: [],
      },
      soapDraft: JSON.stringify({ subjective: "Pain.", objective: "Swelling.", assessment: "PFPS.", plan: "Continue PT." }),
    };
    await store.save(jobWithStages);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/voice/jobs/${job.jobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": CLINIC_A,
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.stageState).toBe("queued_summary");

    // Must have enqueued exactly one job: summary
    expect(capturingQueue.calls).toHaveLength(1);
    expect(capturingQueue.calls[0]!.name).toBe("summary");
    expect(capturingQueue.calls[0]!.opts?.jobId).toBe(`${job.jobId}-summary`);
  });

  it("returns 409 and does not enqueue after max stage retries (3)", async () => {
    const capturingQueue = createCapturingQueue();
    const app = await buildRetryApp(capturingQueue, store);
    const accessToken = createAccessToken(CLINIC_A);

    const job = await enqueueTranscriptionJob(store, {
      clinicId: CLINIC_A,
      patientId: "patient-1",
      uploadId: "upload-exhausted",
    });

    // Simulate: all 3 soap retries exhausted
    const exhausted: VoiceJobRecord = {
      ...job,
      stageState: "soap_failed",
      stageRetries: { transcription: 0, soap: 3, summary: 0 },
      status: "failed",
    };
    await store.save(exhausted);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/voice/jobs/${job.jobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": CLINIC_A,
      },
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/limit|retry/i);

    // No queue add should have occurred
    expect(capturingQueue.calls).toHaveLength(0);
  });
});
