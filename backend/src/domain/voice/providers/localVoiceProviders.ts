import { accessSync, constants } from "node:fs";
import path from "node:path";

import type { SttProvider } from "./providerTypes.js";
import type { VoiceProviders } from "./providerRegistry.js";
import { parseVoiceEnv } from "../../../config/env.js";
import {
  createDemoClinicalNoteProvider,
  createDemoPatientSummaryProvider,
  createDemoSttProvider,
} from "./demoVoiceProviders.js";
import { createSarvamClinicalNoteProvider } from "./sarvamClinicalNoteProvider.js";
import { createSarvamPatientSummaryProvider } from "./sarvamPatientSummaryProvider.js";
import { createSarvamSttProvider } from "./sarvamSttProvider.js";
import { createSpokenlySttProvider, isSpokenlyCliMissing } from "./spokenlySttProvider.js";
import { createLogger } from "../../../observability/logger.js";

const logger = createLogger({ component: "localVoiceProviders" });

export type LocalSttChoice = "sarvam" | "spokenly" | "stub";
export type LocalLlmChoice = "sarvam" | "stub";

function isOnPath(command: string, pathValue: string | undefined): boolean {
  for (const directory of (pathValue ?? "").split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    try {
      accessSync(path.join(directory, command), constants.X_OK);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
}

/**
 * Speech-to-text for the local runtime. `LOCAL_STT_PROVIDER` wins when set;
 * otherwise use the Spokenly CLI if it is installed, else the offline demo stub.
 * Sarvam STT is never chosen implicitly, so local runs never spend API credit by accident.
 */
export function resolveLocalSttChoice(
  source: Record<string, string | undefined>,
): LocalSttChoice {
  const explicit = source.LOCAL_STT_PROVIDER?.trim().toLowerCase();
  if (explicit === "sarvam" || explicit === "spokenly" || explicit === "stub") {
    return explicit;
  }
  if (explicit) {
    throw new Error("LOCAL_STT_PROVIDER must be one of: sarvam, spokenly, stub.");
  }
  return isOnPath("spokenly", source.PATH) ? "spokenly" : "stub";
}

/** SOAP and summary drafting: Sarvam when a real key is configured, else the demo stub. */
export function resolveLocalLlmChoice(
  source: Record<string, string | undefined>,
  sarvamApiKey: string | undefined,
): LocalLlmChoice {
  const explicit = source.LOCAL_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "stub") {
    return "stub";
  }
  if (explicit === "sarvam") {
    if (!sarvamApiKey) {
      throw new Error("LOCAL_LLM_PROVIDER=sarvam requires SARVAM_API_KEY.");
    }
    return "sarvam";
  }
  if (explicit) {
    throw new Error("LOCAL_LLM_PROVIDER must be one of: sarvam, stub.");
  }
  return sarvamApiKey ? "sarvam" : "stub";
}

function createLocalSttProvider(
  choice: LocalSttChoice,
  sarvamApiKey: string | undefined,
  sarvamModel: string,
): SttProvider {
  if (choice === "stub") {
    return createDemoSttProvider();
  }

  if (choice === "sarvam") {
    if (!sarvamApiKey) {
      throw new Error("LOCAL_STT_PROVIDER=sarvam requires SARVAM_API_KEY.");
    }
    return createSarvamSttProvider(sarvamApiKey, { model: sarvamModel });
  }

  const spokenlyProvider = createSpokenlySttProvider();
  return {
    async transcribe(audioBuffer, options) {
      try {
        return await spokenlyProvider.transcribe(audioBuffer, options);
      } catch (error) {
        if (isSpokenlyCliMissing(error)) {
          throw new Error(
            "Spokenly CLI not found. Install it from Spokenly Settings and keep Spokenly running.",
          );
        }
        throw error;
      }
    },
  };
}

export function createLocalVoiceProviders(
  source: Record<string, string | undefined> = process.env,
): VoiceProviders {
  const voiceEnv = parseVoiceEnv(source);
  const sttChoice = resolveLocalSttChoice(source);
  const llmChoice = resolveLocalLlmChoice(source, voiceEnv.sarvamApiKey);

  logger.info("voice.local_providers.selected", {
    stt: sttChoice,
    llm: llmChoice,
    demoMode: sttChoice === "stub" || llmChoice === "stub",
  });

  const useSarvamLlm = llmChoice === "sarvam" && voiceEnv.sarvamApiKey;
  return {
    sttProvider: createLocalSttProvider(sttChoice, voiceEnv.sarvamApiKey, voiceEnv.sttDefaultModel),
    clinicalNoteProvider: useSarvamLlm
      ? createSarvamClinicalNoteProvider(voiceEnv.sarvamApiKey!, { model: voiceEnv.llmDefaultModel })
      : createDemoClinicalNoteProvider(),
    patientSummaryProvider: useSarvamLlm
      ? createSarvamPatientSummaryProvider(voiceEnv.sarvamApiKey!, { model: voiceEnv.llmDefaultModel })
      : createDemoPatientSummaryProvider(),
  };
}
