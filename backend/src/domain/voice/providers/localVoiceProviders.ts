import type { VoiceProviders } from "./providerRegistry.js";
import { parseVoiceEnv } from "../../../config/env.js";
import { createSarvamClinicalNoteProvider } from "./sarvamClinicalNoteProvider.js";
import { createSarvamPatientSummaryProvider } from "./sarvamPatientSummaryProvider.js";
import { createSarvamSttProvider } from "./sarvamSttProvider.js";

export function createLocalVoiceProviders(
  source: Record<string, string | undefined> = process.env,
): VoiceProviders {
  const voiceEnv = parseVoiceEnv(source);
  const apiKey = voiceEnv.sarvamApiKey?.trim();

  if (!apiKey) {
    return {};
  }

  return {
    sttProvider: createSarvamSttProvider(apiKey, {
      model: voiceEnv.sttDefaultModel,
    }),
    clinicalNoteProvider: createSarvamClinicalNoteProvider(apiKey, {
      model: voiceEnv.llmDefaultModel,
    }),
    patientSummaryProvider: createSarvamPatientSummaryProvider(apiKey, {
      model: voiceEnv.llmDefaultModel,
    }),
  };
}
