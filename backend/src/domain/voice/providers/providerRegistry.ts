import { resolveVoiceProviderConfig } from "../providerMatrixConfig.js";
import type {
  ClinicalNoteProvider,
  PatientSummaryProvider,
  SttProvider,
} from "./providerTypes.js";
import { createSarvamClinicalNoteProvider } from "./sarvamClinicalNoteProvider.js";
import { createSarvamPatientSummaryProvider } from "./sarvamPatientSummaryProvider.js";
import { createSarvamSttProvider } from "./sarvamSttProvider.js";

export type VoiceProviders = {
  sttProvider?: SttProvider;
  clinicalNoteProvider?: ClinicalNoteProvider;
  patientSummaryProvider?: PatientSummaryProvider;
};

type VoiceProviderFactory = (input: {
  apiKey: string;
  sttModel: string;
  llmModel: string;
}) => VoiceProviders;

const voiceProviderFactories: Record<string, VoiceProviderFactory> = {
  sarvam: ({ apiKey, sttModel, llmModel }) => ({
    sttProvider: createSarvamSttProvider(apiKey, { model: sttModel }),
    clinicalNoteProvider: createSarvamClinicalNoteProvider(apiKey, { model: llmModel }),
    patientSummaryProvider: createSarvamPatientSummaryProvider(apiKey, { model: llmModel }),
  }),
};

export function resolveVoiceProviders(
  source: Record<string, string | undefined> = process.env,
): VoiceProviders | undefined {
  const config = resolveVoiceProviderConfig(source);
  const factory = voiceProviderFactories[config.provider];
  if (!factory) {
    throw new Error(`Unsupported voice provider: ${config.provider}`);
  }

  const apiKey = source.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return factory({
    apiKey,
    sttModel: config.sttModel,
    llmModel: config.llmModel,
  });
}
