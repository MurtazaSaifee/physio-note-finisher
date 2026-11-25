import {
  defaultStore,
  InMemoryVoiceJobStore,
  type VoiceJobStore,
  type VoiceJobRecord,
} from "../voice/voiceJobService.js";
import type { AuthRepository } from "../auth/authRepository.js";
import type { AudioRetentionPeriod } from "../../../../shared/contracts/users.js";
import { createLogger } from "../../observability/logger.js";

const RETENTION_DAYS: Record<AudioRetentionPeriod, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  forever: null,
};

const logger = createLogger({ component: "retentionService" });

export type RetentionPeriod = AudioRetentionPeriod;

export function getRetentionPolicy({
  userId,
  repository,
}: {
  userId: string;
  repository: AuthRepository;
}): Promise<AudioRetentionPeriod> {
  return Promise.resolve()
    .then(async () => {
      const user = await repository.findUserById(userId);
      const period = user?.audioRetentionPeriod;
      if (
        period === "7d" ||
        period === "30d" ||
        period === "90d" ||
        period === "forever"
      ) {
        return period;
      }
      return "30d";
    })
    .catch((err) => {
      logger.error("retention.policy_lookup_failed", { userId, error: err instanceof Error ? err.message : String(err) });
      return "30d";
    });
}

export function getExpiredAudioRecords({
  clinicId,
  retentionPeriod,
  batchSize = 100,
  store,
}: {
  clinicId: string;
  retentionPeriod: AudioRetentionPeriod;
  batchSize?: number;
  store: VoiceJobStore;
}): Promise<VoiceJobRecord[]> | VoiceJobRecord[] {
  if (retentionPeriod === "forever") {
    return [];
  }

  const days = RETENTION_DAYS[retentionPeriod];
  if (days === null) {
    return [];
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const filterExpired = (jobs: VoiceJobRecord[]): VoiceJobRecord[] => {
    const expired: VoiceJobRecord[] = [];
    for (const job of jobs) {
      if (job.clinicId !== clinicId) continue;
      if (job.audioDeletedAt) continue;

      const createdAt = new Date(job.createdAt);
      if (createdAt < cutoff) {
        expired.push(job);
      }
    }

    expired.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return expired.slice(0, batchSize);
  };

  if (store instanceof InMemoryVoiceJobStore) {
    return filterExpired(Array.from(store.jobsMap.values()));
  }

  return store.findAll().then(filterExpired);
}

export type DeleteResult =
  | { success: true; error?: undefined }
  | { success: false; error: string };

function isAlreadyDeletedStorageError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /NoSuchKey|NotFound|404/i.test(`${error.name} ${error.message}`);
}

export async function deleteAudioAndTranscript({
  jobId,
  clinicId,
  store,
  s3DeleteObject,
}: {
  jobId: string;
  clinicId: string;
  store?: VoiceJobStore;
  s3DeleteObject?(keyOrUrl: string): Promise<void>;
}): Promise<DeleteResult> {
  const targetStore = store ?? defaultStore;
  const job = await targetStore.find(jobId);
  if (!job || job.clinicId !== clinicId) {
    return { success: false, error: "Voice job not found" };
  }

  const storagePointer = job.storageKey ?? job.audioUrl;
  if (storagePointer && s3DeleteObject) {
    try {
      await s3DeleteObject(storagePointer);
    } catch (error) {
      logger.warn("retention.s3_delete_failed", {
        jobId,
        clinicId,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      });
      if (!isAlreadyDeletedStorageError(error)) {
        return { success: false, error: "Storage deletion failed" };
      }
    }
  }

  const {
    audioUrl: _audioUrlDiscard,
    storageKey: _storageKeyDiscard,
    soapDraft: _soapDraftDiscard,
    patientSummary: _patientSummaryDiscard,
    ...jobWithoutAudioArtifacts
  } = job;
  const updated: VoiceJobRecord = {
    ...jobWithoutAudioArtifacts,
    audioDeletedAt: new Date().toISOString(),
    transcript: null,
  };
  if (job.transcript) {
    updated.transcriptDeletedAt = new Date().toISOString();
  }
  await targetStore.save(updated);

  logger.info("retention.audio_deleted", {
    jobId,
    clinicId,
  });

  return { success: true };
}
