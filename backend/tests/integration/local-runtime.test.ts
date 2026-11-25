import { chmod, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const localState = vi.hoisted(() => {
  const voiceUploadRows = new Map<string, Record<string, unknown>>();
  const exportRecords = new Map<string, Record<string, unknown>>();
  const googleConnections = new Map<string, Record<string, unknown>>();

  let exportSequence = 0;

  const prisma = {
    voiceUpload: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        voiceUploadRows.set(String(data.uploadId), {
          ...data,
          completedAt: null,
        });
        return data;
      }),
      findFirst: vi.fn(async ({ where }: { where: { uploadId: string; clinicId: string } }) => {
        const row = voiceUploadRows.get(where.uploadId);
        return row && row.clinicId === where.clinicId ? row : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { uploadId: string }; data: Record<string, unknown> }) => {
        const row = voiceUploadRows.get(where.uploadId);
        if (!row) {
          return null;
        }
        const next = { ...row, ...data };
        voiceUploadRows.set(where.uploadId, next);
        return next;
      }),
    },
    exportRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        exportSequence += 1;
        const id = `export-local-${exportSequence}`;
        const record = {
          id,
          sessionId: data.sessionId,
          action: data.action,
          type: data.type,
          format: data.format,
          exportedByUserId: data.exportedByUserId,
          fileStatus: "queued",
          fileError: null,
          fileExpiresAt: null,
          fileStorageKey: null,
          fileSizeBytes: null,
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
          clinicId: data.clinicId,
          patientId: data.patientId,
        };
        exportRecords.set(id, record);
        return record;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        return exportRecords.get(where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = exportRecords.get(where.id);
        if (!row) {
          return null;
        }
        const next = { ...row, ...data };
        exportRecords.set(where.id, next);
        return next;
      }),
    },
    session: {
      findFirst: vi.fn(async () => ({
        id: "session-local-1",
        clinicId: "clinic-local-1",
        patientId: "patient-local-1",
        startedAt: new Date("2026-05-10T09:00:00.000Z"),
        visitType: "Initial Evaluation",
        noteStatus: "finalized",
      })),
    },
    progressNote: {
      findFirst: vi.fn(async () => ({
        subjective: "Local subjective",
        objective: "Local objective",
        assessment: "Local assessment",
        plan: "Local plan",
      })),
    },
    patient: {
      findFirst: vi.fn(async () => ({
        fullName: "Local Patient",
      })),
    },
    clinic: {
      findFirst: vi.fn(async () => ({
        name: "Local Clinic",
      })),
    },
    googleCalendarConnection: {
      upsert: vi.fn(async ({ create }: { create: { clinicId: string; userId: string; refreshToken: string } }) => {
        const record = {
          id: "google-conn-local-1",
          userId: create.userId,
          clinicId: create.clinicId,
          refreshToken: create.refreshToken,
          channelId: null,
          channelToken: null,
          channelExpiration: null,
          nextSyncToken: null,
          lastSyncedAt: new Date("2026-05-10T00:00:00.000Z"),
          lastSyncError: null,
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
          updatedAt: new Date("2026-05-10T00:00:00.000Z"),
        };
        googleConnections.set(`${create.clinicId}:${create.userId}`, record);
        return record;
      }),
      findFirst: vi.fn(async ({ where }: { where: { clinicId: string; userId: string } }) => {
        return googleConnections.get(`${where.clinicId}:${where.userId}`) ?? null;
      }),
      delete: vi.fn(async ({ where }: { where: { userId_clinicId: { userId: string; clinicId: string } } }) => {
        const key = `${where.userId_clinicId.clinicId}:${where.userId_clinicId.userId}`;
        const row = googleConnections.get(key);
        googleConnections.delete(key);
        return row ?? { id: "google-conn-local-1" };
      }),
    },
    user: {
      findFirst: vi.fn(async () => ({
        email: "clinician@example.com",
      })),
    },
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    prisma,
    voiceUploadRows,
    exportRecords,
    googleConnections,
  };
});

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: localState.prisma,
}));

import { createExportRecord, enqueueExportGeneration } from "../../src/domain/exports/exportRecordService.js";
import { createLocalVoiceProviders } from "../../src/domain/voice/providers/localVoiceProviders.js";
import {
  completeVoiceUploadSession,
  createVoiceUploadSession,
  receiveVoiceUploadBinary,
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";
import {
  buildGoogleConnectUrl,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
  getGoogleCalendarConnectionStatus,
} from "../../src/domain/google-calendar/googleCalendarAuthService.js";
import { createVoiceJobStore, getVoiceJobStatus } from "../../src/domain/voice/voiceJobService.js";
import { createLocalExportQueue } from "../../src/workers/exportWorker.js";
import { createLocalStageQueue } from "../../src/workers/voiceWorker.js";
import { resetS3Client } from "../../src/infrastructure/s3/s3Client.js";
import { setLocalGoogleCalendarMode } from "../../src/domain/google-calendar/googleCalendarRuntime.js";
import { resetLocalGoogleCalendarConnections } from "../../src/domain/google-calendar/googleCalendarLocalStore.js";

const originalEnv = { ...process.env };

function configureLocalEnv(storageDir: string): void {
  process.env = {
    ...originalEnv,
    APP_ENV: "local",
    NODE_ENV: "development",
    LOCAL_STORAGE_DIR: storageDir,
  };
}

async function createFakeSpokenlyCli(
  directory: string,
  transcriptSegments: Array<{ start: number; end: number; text: string }>,
): Promise<string> {
  const scriptPath = join(directory, "spokenly");
  const script = `#!/bin/sh
set -eu

if [ "$1" != "transcribe" ]; then
  echo "unexpected spokenly command: $1" >&2
  exit 2
fi

if [ ! -f "$2" ]; then
  echo "missing audio input: $2" >&2
  exit 3
fi

cat <<'JSON'
${JSON.stringify(
  {
    languageCode: "en-IN",
    languageProbability: 0.99,
    segments: transcriptSegments,
  },
  null,
  2,
)}
JSON
`;

  await writeFile(scriptPath, script, { mode: 0o755 });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createFailingSpokenlyCli(
  directory: string,
  message: string,
): Promise<string> {
  const scriptPath = join(directory, "spokenly");
  const script = `#!/bin/sh
set -eu
echo "${message}" >&2
exit 0
`;

  await writeFile(scriptPath, script, { mode: 0o755 });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

describe("local runtime helpers", () => {
  let storageDir: string;
  let defaultSpokenlyDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "physio-local-runtime-"));
    defaultSpokenlyDir = await mkdtemp(join(tmpdir(), "physio-spokenly-default-"));
    await createFakeSpokenlyCli(defaultSpokenlyDir, [
      {
        start: 0,
        end: 2.4,
        text: "Local test transcript: patient reports pain relief after therapy and wants to continue the home program.",
      },
    ]);
    configureLocalEnv(storageDir);
    process.env.PATH = `${defaultSpokenlyDir}:/usr/bin:/bin`;
    setLocalGoogleCalendarMode(true);
    resetLocalGoogleCalendarConnections();
    resetVoiceUploadStore();
    resetS3Client();
    localState.voiceUploadRows.clear();
    localState.exportRecords.clear();
    localState.googleConnections.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    setLocalGoogleCalendarMode(false);
    resetLocalGoogleCalendarConnections();
    resetVoiceUploadStore();
    resetS3Client();
    await rm(defaultSpokenlyDir, { recursive: true, force: true });
    await rm(storageDir, { recursive: true, force: true });
  });

  it("runs the voice pipeline inline with local providers", async () => {
    const store = createVoiceJobStore();
    const queue = createLocalStageQueue({
      store,
      voiceProviders: createLocalVoiceProviders(),
    });

    const upload = await createVoiceUploadSession({
      clinicId: "clinic-local-1",
      patientId: "patient-local-1",
      mimeType: "audio/m4a",
      fileName: "recap.m4a",
      fileSizeBytes: 4096,
      durationSeconds: 75,
    });

    await receiveVoiceUploadBinary("clinic-local-1", upload.uploadId, Buffer.from("local-audio-bytes"), undefined);

    const completed = await completeVoiceUploadSession(
      {
        clinicId: "clinic-local-1",
        patientId: "patient-local-1",
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        durationSeconds: 75,
      },
      queue,
      store,
    );

    expect(completed?.transcriptionJobId).toEqual(expect.any(String));

    const job = await getVoiceJobStatus(
      store,
      completed!.transcriptionJobId!,
      "clinic-local-1",
    );

    expect(job.status).toBe("succeeded");
    expect(job.stageState).toBe("succeeded");
    expect(job.transcript?.text).toContain("Local test transcript");
    expect(job.soapDraft).toContain("Local SOAP subjective");
    expect(job.patientSummary).toContain("Local patient summary");

    const storedAudio = await readFile(
      join(storageDir, upload.storageKey),
    );
    expect(storedAudio.toString("utf8")).toBe("local-audio-bytes");
  });

  it("keeps local transcripts printable even for binary audio uploads", async () => {
    const store = createVoiceJobStore();
    const queue = createLocalStageQueue({
      store,
      voiceProviders: createLocalVoiceProviders(),
    });

    const upload = await createVoiceUploadSession({
      clinicId: "clinic-local-1",
      patientId: "patient-local-1",
      mimeType: "audio/m4a",
      fileName: "recap.m4a",
      fileSizeBytes: 4096,
      durationSeconds: 45,
    });

    await receiveVoiceUploadBinary(
      "clinic-local-1",
      upload.uploadId,
      Buffer.from([0x00, 0x1f, 0x7f, 0x41, 0x42, 0x43]),
      undefined,
    );

    const completed = await completeVoiceUploadSession(
      {
        clinicId: "clinic-local-1",
        patientId: "patient-local-1",
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        durationSeconds: 45,
      },
      queue,
      store,
    );

    const job = await getVoiceJobStatus(
      store,
      completed!.transcriptionJobId!,
      "clinic-local-1",
    );

    expect(job.transcript?.text).toMatch(/^Local test transcript:/);
    expect(job.transcript?.text).not.toContain("\u0000");
  });

  it("uses Spokenly for local transcription and Sarvam for local SOAP generation", async () => {
    const spokenlyDir = await mkdtemp(join(tmpdir(), "physio-spokenly-cli-"));
    const originalPath = process.env.PATH ?? "";
    const previousFetch = globalThis.fetch;

    try {
      await createFakeSpokenlyCli(spokenlyDir, [
        { start: 0, end: 1.1, text: "Local" },
        { start: 1.1, end: 2.4, text: "Spokenly transcript" },
      ]);

      process.env = {
        ...process.env,
        PATH: `${spokenlyDir}:${originalPath}`,
        SARVAM_API_KEY: "sarvam-test-key",
      };

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(async () =>
          new Response(
            JSON.stringify({
              id: "sarvam-local-soap-1",
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      subjective: "Local subjective from Sarvam",
                      objective: "Local objective from Sarvam",
                      assessment: "Local assessment from Sarvam",
                      plan: "Local plan from Sarvam",
                    }),
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          ))
        .mockImplementationOnce(async () =>
          new Response(
            JSON.stringify({
              id: "sarvam-local-summary-1",
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      message: "Local summary from Sarvam",
                      safetyNote: null,
                      followUp: "Review next visit",
                    }),
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          ));

      globalThis.fetch = fetchMock as typeof fetch;

      const store = createVoiceJobStore();
      const queue = createLocalStageQueue({
        store,
        voiceProviders: createLocalVoiceProviders(),
      });

      const upload = await createVoiceUploadSession({
        clinicId: "clinic-local-1",
        patientId: "patient-local-1",
        mimeType: "audio/m4a",
        fileName: "recap.m4a",
        fileSizeBytes: 4096,
        durationSeconds: 45,
      });

      await receiveVoiceUploadBinary(
        "clinic-local-1",
        upload.uploadId,
        Buffer.from("fake local audio bytes"),
        undefined,
      );

      const completed = await completeVoiceUploadSession(
        {
          clinicId: "clinic-local-1",
          patientId: "patient-local-1",
          uploadId: upload.uploadId,
          storageKey: upload.storageKey,
          durationSeconds: 45,
        },
        queue,
        store,
      );

      const job = await getVoiceJobStatus(
        store,
        completed!.transcriptionJobId!,
        "clinic-local-1",
      );

      expect(job.transcript?.text).toBe("Local Spokenly transcript");
      expect(job.soapDraft).toContain("Local subjective from Sarvam");
      expect(job.patientSummary).toContain("Local summary from Sarvam");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      process.env = { ...originalEnv };
      globalThis.fetch = previousFetch;
      await rm(spokenlyDir, { recursive: true, force: true });
    }
  });

  it("keeps upload completion successful when Spokenly returns stderr and marks the job failed", async () => {
    const failingSpokenlyDir = await mkdtemp(join(tmpdir(), "physio-spokenly-failing-"));
    const originalPath = process.env.PATH ?? "";

    try {
      await createFailingSpokenlyCli(
        failingSpokenlyDir,
        "Network error: This feature needs internet access. Disable local-only mode in Settings to continue.",
      );
      process.env.PATH = `${failingSpokenlyDir}:${originalPath}`;

      const store = createVoiceJobStore();
      const queue = createLocalStageQueue({
        store,
        voiceProviders: createLocalVoiceProviders(),
      });

      const upload = await createVoiceUploadSession({
        clinicId: "clinic-local-1",
        patientId: "patient-local-1",
        mimeType: "audio/m4a",
        fileName: "recap.m4a",
        fileSizeBytes: 4096,
        durationSeconds: 45,
      });

      await receiveVoiceUploadBinary(
        "clinic-local-1",
        upload.uploadId,
        Buffer.from("fake local audio bytes"),
        undefined,
      );

      const completed = await completeVoiceUploadSession(
        {
          clinicId: "clinic-local-1",
          patientId: "patient-local-1",
          uploadId: upload.uploadId,
          storageKey: upload.storageKey,
          durationSeconds: 45,
        },
        queue,
        store,
      );

      expect(completed?.transcriptionJobId).toEqual(expect.any(String));

      const job = await getVoiceJobStatus(
        store,
        completed!.transcriptionJobId!,
        "clinic-local-1",
      );

      expect(job.status).toBe("failed");
      expect(job.errorMessage).toContain("Spokenly transcription failed");
    } finally {
      process.env.PATH = originalPath;
      await rm(failingSpokenlyDir, { recursive: true, force: true });
    }
  });

  it("processes export jobs inline and stores the generated PDF locally", async () => {
    const created = await createExportRecord({
      clinicId: "clinic-local-1",
      userId: "user-local-1",
      patientId: "patient-local-1",
      sessionId: "session-local-1",
      input: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });

    const queue = createLocalExportQueue();
    await enqueueExportGeneration(
      queue,
      created.id,
      "clinic-local-1",
      "session-local-1",
    );

    const updated = localState.exportRecords.get(created.id);
    expect(updated).toMatchObject({
      fileStatus: "succeeded",
      fileSizeBytes: expect.any(Number),
    });

    const storedPdfPath = join(storageDir, String(updated?.fileStorageKey));
    const pdf = await readFile(storedPdfPath);
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("stubs Google Calendar connect, status, and disconnect in local mode", async () => {
    const url = await buildGoogleConnectUrl("clinic-local-1", "user-local-1");
    expect(url).toBe("physio-local://google-calendar/connected");

    const exchanged = await exchangeGoogleCode(
      "clinic-local-1",
      "user-local-1",
      "local-code",
    );

    expect(exchanged.connected).toBe(true);
    expect(exchanged.syncState).toBe("connected");

    const status = await getGoogleCalendarConnectionStatus(
      "clinic-local-1",
      "user-local-1",
    );

    expect(status.connected).toBe(true);
    expect(status.accountEmail).toBe("local-calendar@physio.local");
    expect(status.syncState).toBe("connected");

    await disconnectGoogleCalendar("clinic-local-1", "user-local-1");

    const disconnected = await getGoogleCalendarConnectionStatus(
      "clinic-local-1",
      "user-local-1",
    );

    expect(disconnected.connected).toBe(false);
    expect(disconnected.syncState).toBe("disconnected");
  });
});
