import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { VoiceTranscriptPayload } from "../../../../shared/contracts/voice.js";

export type VoiceJobStatus = "queued" | "processing" | "succeeded" | "failed";

export type VoiceJobRecord = {
  jobId: string;
  clinicId: string;
  patientId: string;
  sessionId?: string | undefined;
  uploadId: string;
  status: VoiceJobStatus;
  attempt: number;
  maxAttempts: number;
  errorMessage: string | null;
  transcript: VoiceTranscriptPayload | null;
  audioUrl?: string;
  storageKey?: string;
  durationSeconds?: number | null;
  transcriptKey?: string;
  audioDeletedAt?: string;
  transcriptDeletedAt?: string;
  soapDraft?: string;
  patientSummary?: string;
  resends?: number;
  createdAt: string;
  updatedAt: string;
  stageState?: VoicePipelineStageState | undefined;
  stageRetries?: StageRetries | undefined;
};

export interface VoiceJobStore {
  find(jobId: string): Promise<VoiceJobRecord | undefined>;
  findByClinicId(jobId: string, clinicId: string): Promise<VoiceJobRecord | undefined>;
  findByUploadId(clinicId: string, uploadId: string): Promise<VoiceJobRecord | undefined>;
  save(record: VoiceJobRecord): Promise<void>;
  findAll(): Promise<VoiceJobRecord[]>;
  clear(): Promise<void>;
}

type VoiceJobCreateData = Prisma.VoiceJobUncheckedCreateInput;
type VoiceJobPromise = Promise<VoiceJobRecord> & VoiceJobRecord;

function withVoiceJobPromise(
  job: VoiceJobRecord,
  operation: Promise<unknown>,
): VoiceJobPromise {
  return Object.assign(operation.then(() => job) as VoiceJobPromise, job);
}

export class VoiceJobNotFoundError extends Error {
  constructor() {
    super("Voice job not found");
    this.name = "VoiceJobNotFoundError";
  }
}

export class VoiceJobRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceJobRetryError";
  }
}

export class InvalidVoiceJobTransitionError extends Error {
  constructor() {
    super("Invalid job state transition");
    this.name = "InvalidVoiceJobTransitionError";
  }
}

export class VoiceTranscriptNotFoundError extends Error {
  constructor() {
    super("Transcript not found");
    this.name = "VoiceTranscriptNotFoundError";
  }
}

const MAX_RETRY_ATTEMPTS = 3;

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackTranscriptSegments(text: string): VoiceTranscriptPayload["segments"] {
  const cleanText = text.trim();
  if (!cleanText) {
    return [];
  }

  return [{
    startMs: 0,
    endMs: Math.max(1000, cleanText.split(/\s+/).length * 350),
    text: cleanText,
    words: [],
  }];
}

function recordToPrismaData(record: VoiceJobRecord): VoiceJobCreateData {
  return {
    id: record.jobId,
    clinicId: record.clinicId,
    patientId: record.patientId,
    sessionId: record.sessionId ?? null,
    uploadId: record.uploadId,
    status: record.status,
    stageState: record.stageState ?? "queued_transcription",
    transcriptText: record.transcript?.text ?? null,
    audioUrl: record.audioUrl ?? null,
    storageKey: record.storageKey ?? null,
    durationSeconds: record.durationSeconds ?? null,
    soapDraft: record.soapDraft ?? null,
    patientSummary: record.patientSummary ?? null,
    errorMessage: record.errorMessage,
    attempts: record.attempt,
    resends: record.resends ?? 0,
    ...(record.stageRetries !== undefined ? { stageRetries: record.stageRetries } : {}),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    completedAt: record.status === "succeeded" ? new Date(record.updatedAt) : null,
  };
}

function prismaToRecord(row: {
  id: string;
  clinicId: string;
  patientId: string;
  sessionId: string | null;
  uploadId: string;
  status: string;
  stageState: string;
  audioUrl: string | null;
  storageKey: string | null;
  durationSeconds: number | null;
  transcriptText: string | null;
  soapDraft: string | null;
  patientSummary: string | null;
  errorMessage: string | null;
  attempts: number;
  resends: number;
  stageRetries: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): VoiceJobRecord {
  return {
    jobId: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    uploadId: row.uploadId,
    status: row.status as VoiceJobStatus,
    attempt: row.attempts,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    errorMessage: row.errorMessage,
    transcript: row.transcriptText
      ? {
          transcriptStatus: "ready",
          text: row.transcriptText,
          segments: fallbackTranscriptSegments(row.transcriptText),
        }
      : null,
    ...(row.sessionId !== null ? { sessionId: row.sessionId } : {}),
    ...(row.audioUrl !== null ? { audioUrl: row.audioUrl } : {}),
    ...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
    ...(row.durationSeconds !== null ? { durationSeconds: row.durationSeconds } : {}),
    ...(row.soapDraft !== null ? { soapDraft: row.soapDraft } : {}),
    ...(row.patientSummary !== null ? { patientSummary: row.patientSummary } : {}),
    resends: row.resends,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stageState: row.stageState as VoicePipelineStageState,
    ...(row.stageRetries !== null ? { stageRetries: row.stageRetries as StageRetries } : {}),
  };
}

// ---- In-memory store (for tests / local dev) ----

export class InMemoryVoiceJobStore implements VoiceJobStore {
  private jobs = new Map<string, VoiceJobRecord>();

  async find(jobId: string): Promise<VoiceJobRecord | undefined> {
    return this.jobs.get(jobId);
  }

  async findByClinicId(jobId: string, clinicId: string): Promise<VoiceJobRecord | undefined> {
    const job = this.jobs.get(jobId);
    if (!job || job.clinicId !== clinicId) {
      return undefined;
    }
    return job;
  }

  async findByUploadId(clinicId: string, uploadId: string): Promise<VoiceJobRecord | undefined> {
    return Array.from(this.jobs.values()).find(
      (job) => job.clinicId === clinicId && job.uploadId === uploadId,
    );
  }

  async save(record: VoiceJobRecord): Promise<void> {
    this.jobs.set(record.jobId, record);
  }

  async findAll(): Promise<VoiceJobRecord[]> {
    return Array.from(this.jobs.values());
  }

  async clear(): Promise<void> {
    this.jobs.clear();
  }

  // Backward-compat accessor for retention worker
  get jobsMap(): Map<string, VoiceJobRecord> {
    return this.jobs;
  }
}

// ---- Prisma-backed store ----

export class PrismaVoiceJobStore implements VoiceJobStore {
  constructor(private prisma: PrismaClient) {}

  async find(jobId: string): Promise<VoiceJobRecord | undefined> {
    const row = await this.prisma.voiceJob.findUnique({ where: { id: jobId } });
    return row ? prismaToRecord(row) : undefined;
  }

  async findByClinicId(jobId: string, clinicId: string): Promise<VoiceJobRecord | undefined> {
    const row = await this.prisma.voiceJob.findFirst({
      where: { id: jobId, clinicId },
    });
    return row ? prismaToRecord(row) : undefined;
  }

  async findByUploadId(clinicId: string, uploadId: string): Promise<VoiceJobRecord | undefined> {
    const row = await this.prisma.voiceJob.findFirst({
      where: { clinicId, uploadId },
    });
    return row ? prismaToRecord(row) : undefined;
  }

  async save(record: VoiceJobRecord): Promise<void> {
    const data = recordToPrismaData(record);
    const { id: _id, ...updateData } = data;
    await this.prisma.voiceJob.upsert({
      where: { id: record.jobId },
      create: data,
      update: updateData as Prisma.VoiceJobUncheckedUpdateInput,
    });
  }

  async findAll(): Promise<VoiceJobRecord[]> {
    const rows = await this.prisma.voiceJob.findMany();
    return rows.map(prismaToRecord);
  }

  async clear(): Promise<void> {
    await this.prisma.voiceJob.deleteMany();
  }
}

export const defaultStore: VoiceJobStore = new InMemoryVoiceJobStore();

export function createVoiceJobStore(prisma?: PrismaClient): VoiceJobStore {
  return prisma ? new PrismaVoiceJobStore(prisma) : new InMemoryVoiceJobStore();
}

export function resetVoiceJobStore(): void {
  // Fire-and-forget for back-compat; callers should await clear() going forward
  void defaultStore.clear();
}

async function findVoiceJob(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await store.findByClinicId(jobId, clinicId);
  if (!job) {
    throw new VoiceJobNotFoundError();
  }
  return job;
}

async function updateStatus(
  store: VoiceJobStore,
  job: VoiceJobRecord,
  nextStatus: VoiceJobStatus,
): Promise<VoiceJobRecord> {
  const updated: VoiceJobRecord = {
    ...job,
    status: nextStatus,
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

export function enqueueTranscriptionJob(
  store: VoiceJobStore = defaultStore,
  input: {
    clinicId: string;
    patientId: string;
    uploadId: string;
    storageKey?: string;
    durationSeconds?: number;
    stageState?: VoicePipelineStageState;
  },
): VoiceJobPromise {
  const createdAt = nowIso();
  const job: VoiceJobRecord = {
    jobId: randomUUID(),
    clinicId: input.clinicId,
    patientId: input.patientId,
    uploadId: input.uploadId,
    ...(input.storageKey !== undefined ? { storageKey: input.storageKey } : {}),
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    status: "queued",
    attempt: 1,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    errorMessage: null,
    transcript: null,
    createdAt,
    updatedAt: createdAt,
    stageState: input.stageState,
  };

  return withVoiceJobPromise(job, store.save(job));
}

export async function getVoiceJobStatus(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  return findVoiceJob(store, jobId, clinicId);
}

export async function findVoiceJobByUploadId(
  store: VoiceJobStore = defaultStore,
  input: { clinicId: string; uploadId: string },
): Promise<VoiceJobRecord | undefined> {
  return store.findByUploadId(input.clinicId, input.uploadId);
}

// Stage-state transition helpers for mark functions
const PROCESSING_TRANSITIONS: Record<string, VoicePipelineStageState> = {
  queued_transcription: "transcribing",
  queued_soap: "generating_soap",
  queued_summary: "generating_summary",
};

const SUCCEEDED_TRANSITIONS: Record<string, VoicePipelineStageState> = {
  transcribing: "transcription_succeeded",
  generating_soap: "soap_succeeded",
  generating_summary: "summary_succeeded",
};

const FAILED_TRANSITIONS: Record<string, VoicePipelineStageState> = {
  transcribing: "transcription_failed",
  generating_soap: "soap_failed",
  generating_summary: "summary_failed",
};

const QUEUED_FAILURE_TRANSITIONS: Partial<Record<VoicePipelineStageState, VoicePipelineStageState>> = {
  queued_transcription: "transcription_failed",
  queued_soap: "soap_failed",
  queued_summary: "summary_failed",
};

const NEXT_STAGE_MAP: Record<string, VoicePipelineStageState> = {
  transcription_succeeded: "queued_soap",
  soap_succeeded: "queued_summary",
  summary_succeeded: "succeeded",
};

export async function markVoiceJobProcessing(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  if (job.status !== "queued") {
    throw new InvalidVoiceJobTransitionError();
  }

  const updated: VoiceJobRecord = {
    ...job,
    status: "processing",
    errorMessage: null,
    updatedAt: nowIso(),
  };

  // Drive stage-state machine (Fix 3)
  const currentStage = job.stageState;
  if (currentStage && currentStage in PROCESSING_TRANSITIONS) {
    const nextStage = PROCESSING_TRANSITIONS[currentStage as keyof typeof PROCESSING_TRANSITIONS] as VoicePipelineStageState;
    assertLegalTransition(currentStage as VoicePipelineStageState, nextStage);
    updated.stageState = nextStage;
  }

  await store.save(updated);
  return updated;
}

export async function markVoiceJobSucceeded(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  if (job.status !== "processing") {
    throw new InvalidVoiceJobTransitionError();
  }

  const updated: VoiceJobRecord = {
    ...job,
    status: "succeeded",
    errorMessage: null,
    updatedAt: nowIso(),
  };

  // Drive stage-state machine (Fix 3)
  const currentStage = job.stageState;
  if (currentStage && currentStage in SUCCEEDED_TRANSITIONS) {
    const nextStage = SUCCEEDED_TRANSITIONS[currentStage as keyof typeof SUCCEEDED_TRANSITIONS] as VoicePipelineStageState;
    assertLegalTransition(currentStage as VoicePipelineStageState, nextStage);
    updated.stageState = nextStage;
  }

  await store.save(updated);
  return updated;
}

export async function markVoiceJobFailed(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
  errorMessage: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  if (job.status !== "processing") {
    throw new InvalidVoiceJobTransitionError();
  }

  const updated: VoiceJobRecord = {
    ...job,
    status: "failed",
    errorMessage,
    updatedAt: nowIso(),
  };

  // Drive stage-state machine (Fix 3)
  const currentStage = job.stageState;
  if (currentStage && currentStage in FAILED_TRANSITIONS) {
    const nextStage = FAILED_TRANSITIONS[currentStage as keyof typeof FAILED_TRANSITIONS] as VoicePipelineStageState;
    assertLegalTransition(currentStage as VoicePipelineStageState, nextStage);
    updated.stageState = nextStage;
  }

  await store.save(updated);
  return updated;
}

export async function markVoiceJobQueueFailed(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  const failedStage = job.stageState
    ? QUEUED_FAILURE_TRANSITIONS[job.stageState]
    : undefined;

  if (job.status !== "queued" || !failedStage) {
    throw new InvalidVoiceJobTransitionError();
  }

  const updated: VoiceJobRecord = {
    ...job,
    status: "failed",
    stageState: failedStage,
    errorMessage: "Voice queue unavailable. Please try again.",
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

export async function advanceToNextPipelineStage(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);

  if (!job.stageState || !(job.stageState in NEXT_STAGE_MAP)) {
    throw new InvalidVoiceJobTransitionError();
  }

  const nextStage = NEXT_STAGE_MAP[job.stageState as keyof typeof NEXT_STAGE_MAP] as VoicePipelineStageState;
  assertLegalTransition(job.stageState as VoicePipelineStageState, nextStage);

  const updated: VoiceJobRecord = {
    ...job,
    stageState: nextStage,
    status: nextStage === "succeeded" ? "succeeded" : "queued",
    updatedAt: nowIso(),
  };

  await store.save(updated);
  return updated;
}

export async function retryVoiceJob(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);

  // Stage-aware retry (D-02): only retry the specific failed stage with bounded attempts
  if (job.stageState) {
    const failedStages = ["transcription_failed", "soap_failed", "summary_failed"] as const;
    type FailedStage = typeof failedStages[number];

    if (!failedStages.includes(job.stageState as FailedStage)) {
      throw new VoiceJobRetryError("Job is not in a retryable failed stage");
    }

    const stageMap: Record<FailedStage, keyof StageRetries> = {
      transcription_failed: "transcription",
      soap_failed: "soap",
      summary_failed: "summary",
    };
    const stage = stageMap[job.stageState as FailedStage];
    const currentRetries = job.stageRetries?.[stage] ?? 0;

    if (currentRetries >= MAX_STAGE_RETRIES) {
      throw new VoiceJobRetryError("Stage retry limit reached");
    }

    const queueMap: Record<FailedStage, VoicePipelineStageState> = {
      transcription_failed: "queued_transcription",
      soap_failed: "queued_soap",
      summary_failed: "queued_summary",
    };

    const retried: VoiceJobRecord = {
      ...job,
      stageState: queueMap[job.stageState as FailedStage],
      stageRetries: {
        transcription: job.stageRetries?.transcription ?? 0,
        soap: job.stageRetries?.soap ?? 0,
        summary: job.stageRetries?.summary ?? 0,
        [stage]: currentRetries + 1,
      },
      status: "queued",
      attempt: job.attempt + 1,
      errorMessage: null,
      updatedAt: nowIso(),
    };

    await store.save(retried);
    return retried;
  }

  // Legacy retry logic for jobs without stage state
  if (job.status === "succeeded") {
    throw new VoiceJobRetryError("Cannot retry succeeded job");
  }

  if (job.status !== "failed") {
    throw new VoiceJobRetryError("Job is not retryable");
  }

  if (job.attempt >= job.maxAttempts) {
    throw new VoiceJobRetryError("Retry limit reached");
  }

  const retried: VoiceJobRecord = {
    ...job,
    status: "queued",
    attempt: job.attempt + 1,
    errorMessage: null,
    updatedAt: nowIso(),
  };

  await store.save(retried);
  return retried;
}

export async function saveVoiceJobTranscript(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
  transcript: VoiceTranscriptPayload,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  const updated: VoiceJobRecord = {
    ...job,
    transcript,
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

export async function saveVoiceJobSoapDraft(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
  soapDraft: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  const updated: VoiceJobRecord = {
    ...job,
    soapDraft,
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

export async function saveVoiceJobPatientSummary(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
  patientSummary: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  const updated: VoiceJobRecord = {
    ...job,
    patientSummary,
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

export async function readVoiceJobTranscript(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceTranscriptPayload> {
  const job = await findVoiceJob(store, jobId, clinicId);
  if (!job.transcript) {
    throw new VoiceTranscriptNotFoundError();
  }
  return job.transcript;
}

export async function updateTranscriptText(
  store: VoiceJobStore = defaultStore,
  jobId: string,
  clinicId: string,
  text: string,
): Promise<VoiceJobRecord> {
  const job = await findVoiceJob(store, jobId, clinicId);
  const updated: VoiceJobRecord = {
    ...job,
    transcript: job.transcript
      ? {
          ...job.transcript,
          text,
          segments:
            job.transcript.segments.length > 0
              ? job.transcript.segments.map((segment, index) =>
                  index === 0 ? { ...segment, text } : segment,
                )
              : fallbackTranscriptSegments(text),
        }
      : { transcriptStatus: "ready", text, segments: fallbackTranscriptSegments(text) },
    updatedAt: nowIso(),
  };
  await store.save(updated);
  return updated;
}

// ---- Durable stage-state machine (Phase 11) ----

export type VoicePipelineStageState =
  | "created"
  | "uploading"
  | "uploaded"
  | "queued_transcription"
  | "transcribing"
  | "transcription_succeeded"
  | "transcription_failed"
  | "queued_soap"
  | "generating_soap"
  | "soap_succeeded"
  | "soap_failed"
  | "queued_summary"
  | "generating_summary"
  | "summary_succeeded"
  | "summary_failed"
  | "succeeded";

export type StageRetries = {
  transcription: number;
  soap: number;
  summary: number;
};

export interface VoicePipelineJob {
  id: string;
  clinicId: string;
  patientId: string;
  uploadId: string;
  currentState: VoicePipelineStageState;
  stageRetries: StageRetries;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class IllegalStageTransitionError extends Error {
  constructor(from?: string, to?: string) {
    super(`Illegal stage transition${from && to ? ` from ${from} to ${to}` : ""}`);
    this.name = "IllegalStageTransitionError";
  }
}

const LEGAL_TRANSITIONS: Record<VoicePipelineStageState, VoicePipelineStageState[]> = {
  created: ["uploading"],
  uploading: ["uploaded"],
  uploaded: ["queued_transcription"],
  queued_transcription: ["transcribing"],
  transcribing: ["transcription_succeeded", "transcription_failed"],
  transcription_succeeded: ["queued_soap"],
  transcription_failed: ["queued_transcription"],
  queued_soap: ["generating_soap"],
  generating_soap: ["soap_succeeded", "soap_failed"],
  soap_succeeded: ["queued_summary"],
  soap_failed: ["queued_soap"],
  queued_summary: ["generating_summary"],
  generating_summary: ["summary_succeeded", "summary_failed"],
  summary_succeeded: ["succeeded"],
  summary_failed: ["queued_summary"],
  succeeded: [],
};

export function assertLegalTransition(
  from: VoicePipelineStageState,
  to: VoicePipelineStageState,
): void {
  const legal = LEGAL_TRANSITIONS[from] ?? [];
  if (!legal.includes(to)) {
    throw new IllegalStageTransitionError(from, to);
  }
}

const MAX_STAGE_RETRIES = 3;

export function canRetryStage(
  job: VoicePipelineJob,
  stage: keyof StageRetries,
): boolean {
  return job.stageRetries[stage] < MAX_STAGE_RETRIES;
}

export function incrementStageRetry(
  job: VoicePipelineJob,
  stage: keyof StageRetries,
): VoicePipelineJob {
  return {
    ...job,
    stageRetries: {
      ...job.stageRetries,
      [stage]: job.stageRetries[stage] + 1,
    },
    updatedAt: new Date(),
  };
}
