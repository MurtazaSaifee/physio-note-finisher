import { z } from "zod";
import { parseVoiceEnv } from "../../config/env.js";

const providerModelEntrySchema = z.object({
  provider: z.string().min(1),
  sttModel: z.string().min(1).optional(),
  llmModel: z.string().min(1).optional(),
});

const providerMatrixSchema = z.record(z.string().min(1), providerModelEntrySchema);

export type VoiceProviderConfig = {
  provider: string;
  sttModel: string;
  llmModel: string;
};

export function resolveVoiceProviderConfig(
  source: Record<string, string | undefined> = process.env,
): VoiceProviderConfig {
  const env = parseVoiceEnv(source);
  const defaultProvider = env.providerDefault;
  const defaultModel = env.llmDefaultModel;

  if (env.providerMatrixJson) {
    let matrix: unknown;
    try {
      matrix = JSON.parse(env.providerMatrixJson);
    } catch {
      throw new Error("VOICE_PROVIDER_MATRIX_JSON is not valid JSON");
    }

    const parsed = providerMatrixSchema.safeParse(matrix);
    if (!parsed.success) {
      throw new Error(`Invalid provider matrix shape: ${parsed.error.message}`);
    }

    const entry = parsed.data[defaultProvider];
    if (entry) {
      return {
        provider: entry.provider,
        sttModel: entry.sttModel ?? env.sttDefaultModel,
        llmModel: entry.llmModel ?? defaultModel,
      };
    }
  }

  return {
    provider: defaultProvider,
    sttModel: env.sttDefaultModel,
    llmModel: defaultModel,
  };
}
