import type { VoiceJobStore } from "../domain/voice/voiceJobService.js";
import {
  getExpiredAudioRecords,
  deleteAudioAndTranscript,
  type RetentionPeriod,
} from "../domain/audio/retentionService.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger({ component: "retentionWorker" });

export type RetentionJobResult = {
  deletedCount: number;
  clinicId?: string | undefined;
};

export type RetentionWorker = {
  runRetentionJob(options: {
    clinicId?: string;
    retentionPeriod: RetentionPeriod;
  }): Promise<RetentionJobResult>;
};

async function getUniqueClinicIds(store: VoiceJobStore): Promise<string[]> {
  const ids = new Set<string>();
  const jobs = await store.findAll();
  for (const job of jobs) {
    ids.add(job.clinicId);
  }
  return Array.from(ids);
}

export function registerRetentionWorker(
  store: VoiceJobStore,
  s3DeleteObject?: (keyOrUrl: string) => Promise<void>,
): RetentionWorker {
  return {
    async runRetentionJob({ clinicId, retentionPeriod }) {
      if (retentionPeriod === "forever") {
        return { deletedCount: 0, clinicId };
      }

      const clinicIds = clinicId ? [clinicId] : await getUniqueClinicIds(store);
      let totalDeleted = 0;

      for (const targetClinicId of clinicIds) {
        const expired = await getExpiredAudioRecords({
          clinicId: targetClinicId,
          retentionPeriod,
          batchSize: 100,
          store,
        });

        let clinicDeleted = 0;
        for (const job of expired) {
          const deleteArgs: {
            jobId: string;
            clinicId: string;
            store: VoiceJobStore;
            s3DeleteObject?(keyOrUrl: string): Promise<void>;
          } = {
            jobId: job.jobId,
            clinicId: targetClinicId,
            store,
          };
          if (s3DeleteObject) {
            deleteArgs.s3DeleteObject = s3DeleteObject;
          }
          const result = await deleteAudioAndTranscript(deleteArgs);
          if (result.success) {
            totalDeleted++;
            clinicDeleted++;
          }
        }

        if (clinicDeleted > 0) {
          logger.info("retention.batch_completed", {
            clinicId: targetClinicId,
            deletedCount: clinicDeleted,
          });
        }
      }

      return { deletedCount: totalDeleted, clinicId };
    },
  };
}
