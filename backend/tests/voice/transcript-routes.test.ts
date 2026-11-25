import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import {
  enqueueTranscriptionJob,
  markVoiceJobProcessing,
  markVoiceJobSucceeded,
  createVoiceJobStore,
  resetVoiceJobStore,
  saveVoiceJobTranscript,
  getVoiceJobStatus,
} from "../../src/domain/voice/voiceJobService.js";
import { registerVoiceJobRoutes } from "../../src/api/routes/voiceJobs.js";
import { registerTranscriptRoutes } from "../../src/api/routes/transcripts.js";

const originalEnv = { ...process.env };

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

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerVoiceJobRoutes(app);
  registerTranscriptRoutes(app);
  await app.ready();
  return app;
}

describe("transcript routes", () => {
  beforeEach(() => {
    setAuthEnv();
    resetVoiceJobStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns clinic-scoped transcript payload", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    await markVoiceJobProcessing(undefined, job.jobId, "clinic-1");
    await markVoiceJobSucceeded(undefined, job.jobId, "clinic-1");
    await saveVoiceJobTranscript(undefined, job.jobId, "clinic-1", {
      transcriptStatus: "ready",
      text: "Patient reports less pain while walking.",
      segments: [
        {
          startMs: 0,
          endMs: 1200,
          text: "Patient reports",
          words: [
            { startMs: 0, endMs: 350, text: "Patient" },
            { startMs: 360, endMs: 760, text: "reports" },
          ],
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: job.jobId,
        transcriptStatus: "ready",
        speakerMode: "single",
        segments: expect.any(Array),
      }),
    });
  });

  it("uses the injected voice job store instead of the default singleton", async () => {
    const app = Fastify();
    const store = createVoiceJobStore();
    registerVoiceJobRoutes(app, undefined, store);
    registerTranscriptRoutes(app, store);
    await app.ready();

    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    await markVoiceJobProcessing(store, job.jobId, "clinic-1");
    await markVoiceJobSucceeded(store, job.jobId, "clinic-1");
    await saveVoiceJobTranscript(store, job.jobId, "clinic-1", {
      transcriptStatus: "ready",
      text: "Injected store transcript",
      segments: [
        {
          startMs: 0,
          endMs: 800,
          text: "Injected store",
          words: [
            { startMs: 0, endMs: 350, text: "Injected" },
            { startMs: 360, endMs: 800, text: "store" },
          ],
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          text: "Injected store transcript",
        }),
      }),
    );
  });

  it("returns 403 for clinic mismatch and 404 when transcript missing", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-2",
      },
    });

    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "Transcript not found" });
  });

  it("patches transcript text and preserves existing segments", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    await markVoiceJobProcessing(undefined, job.jobId, "clinic-1");
    await markVoiceJobSucceeded(undefined, job.jobId, "clinic-1");
    await saveVoiceJobTranscript(undefined, job.jobId, "clinic-1", {
      transcriptStatus: "ready",
      text: "Original text",
      segments: [
        {
          startMs: 0,
          endMs: 1200,
          text: "Original text",
          words: [
            { startMs: 0, endMs: 350, text: "Original" },
            { startMs: 360, endMs: 760, text: "text" },
          ],
        },
      ],
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
        "content-type": "application/json",
      },
      payload: { transcriptText: "Updated text" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: job.jobId,
        transcript: expect.objectContaining({
          text: "Updated text",
          segments: expect.any(Array),
        }),
      }),
    });

    const updatedJob = await getVoiceJobStatus(undefined, job.jobId, "clinic-1");
    expect(updatedJob.transcript?.text).toBe("Updated text");
    expect(updatedJob.transcript?.segments).toHaveLength(1);
  });

  it("rejects PATCH for non-existent job and clinic mismatch", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    const notFound = await app.inject({
      method: "PATCH",
      url: "/api/v1/voice/jobs/non-existent-job/transcript",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
        "content-type": "application/json",
      },
      payload: { transcriptText: "Updated text" },
    });

    expect(notFound.statusCode).toBe(404);

    const forbidden = await app.inject({
      method: "PATCH",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-2",
        "content-type": "application/json",
      },
      payload: { transcriptText: "Updated text" },
    });

    expect(forbidden.statusCode).toBe(403);
  });

  it("rejects PATCH with empty transcript text", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/voice/jobs/${job.jobId}/transcript`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
        "content-type": "application/json",
      },
      payload: { transcriptText: "   " },
    });

    expect(response.statusCode).toBe(400);
  });
});
