import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import type { SqsRuntimeConfig } from "../config/env.js";
import { createVoiceJobStore, type VoiceJobStore } from "../domain/voice/voiceJobService.js";
import type {
  ClinicalNoteProvider,
  PatientSummaryProvider,
  SttProvider,
} from "../domain/voice/providers/providerTypes.js";
import type { VoiceProviders } from "../domain/voice/providers/providerRegistry.js";
import { requireQueueUrl, VOICE_QUEUE } from "../infrastructure/sqs/sqsQueues.js";
import { startSqsPoller, type SqsPollerHandle } from "./sqsPoller.js";
import { pollOneSqsPointer } from "./sqsPollerCore.js";
import { processVoicePipelineJob } from "./voiceWorker.js";

void DeleteMessageCommand;
void ReceiveMessageCommand;
// SQS long polling contract: WaitTimeSeconds: 20

export async function pollVoiceQueueOnce(input: {
  queueUrl?: string;
  client?: SQSClient;
  store?: VoiceJobStore;
  sttProvider?: SttProvider;
  clinicalNoteProvider?: ClinicalNoteProvider;
  patientSummaryProvider?: PatientSummaryProvider;
  voiceProviders?: VoiceProviders;
} = {}): Promise<boolean> {
  const store = input.store ?? createVoiceJobStore();
  const pollInput = {
    queueUrl: input.queueUrl ?? requireQueueUrl(VOICE_QUEUE, "SQS_VOICE_QUEUE_URL"),
    process: (message: { jobType: string; jobId: string }) =>
      processVoicePipelineJob(
        message.jobType,
        message.jobId,
        store,
        input.sttProvider ?? input.voiceProviders?.sttProvider,
        input.clinicalNoteProvider ?? input.voiceProviders?.clinicalNoteProvider,
        input.patientSummaryProvider ?? input.voiceProviders?.patientSummaryProvider,
      ),
  };
  return input.client
    ? pollOneSqsPointer({ ...pollInput, client: input.client })
    : pollOneSqsPointer(pollInput);
}

export function startSqsVoicePoller(
  config: SqsRuntimeConfig,
  voiceProviders?: VoiceProviders,
  options: { store?: VoiceJobStore } = {},
): SqsPollerHandle {
  const store = options.store ?? createVoiceJobStore();
  return startSqsPoller({
    name: "voice",
    queueUrl: requireQueueUrl(config.voiceQueueUrl, "SQS_VOICE_QUEUE_URL"),
    processMessage: (message) =>
      processVoicePipelineJob(
        message.jobType,
        message.jobId,
        store,
        voiceProviders?.sttProvider,
        voiceProviders?.clinicalNoteProvider,
        voiceProviders?.patientSummaryProvider,
      ),
  });
}
