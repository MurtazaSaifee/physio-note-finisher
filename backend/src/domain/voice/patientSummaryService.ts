import { z } from "zod";

import { prisma } from "../../data/prismaClient.js";
import type { SoapSections } from "../../../../shared/contracts/notes.js";
import type { PatientSummaryProvider } from "./providers/providerTypes.js";
import { generatedSoapSectionsSchema } from "./soapGenerationSchemas.js";
import { createLogger } from "../../observability/logger.js";
import {
  getVoiceJobStatus,
  markVoiceJobSucceeded,
  saveVoiceJobPatientSummary,
  type VoiceJobRecord,
  type VoiceJobStore,
} from "./voiceJobService.js";

const logger = createLogger({ component: "patientSummaryService" });

const summaryTextSchema = z.string().trim().min(1).max(2000);
const MAX_SUMMARY_CHARS = 2000;
const MAX_SECTION_SNIPPET_CHARS = 320;

function isStrictVoiceRuntime(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

function cleanSentence(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function cleanPunctuation(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.`;
}

function truncateForSummary(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildFallbackPatientSummary(sections: SoapSections): string {
  const subjective = truncateForSummary(cleanSentence(sections.subjective), MAX_SECTION_SNIPPET_CHARS);
  const objective = truncateForSummary(cleanSentence(sections.objective), MAX_SECTION_SNIPPET_CHARS);
  const assessment = truncateForSummary(cleanSentence(sections.assessment), MAX_SECTION_SNIPPET_CHARS);
  const plan = truncateForSummary(cleanSentence(sections.plan), MAX_SECTION_SNIPPET_CHARS);

  const summary = [
    subjective
      ? `You reported ${subjective.charAt(0).toLowerCase()}${subjective.slice(1)}`
      : "You shared your current symptoms and recovery updates",
    objective
      ? `today we observed ${objective.charAt(0).toLowerCase()}${objective.slice(1)}`
      : "today we reviewed your movement and functional progress",
    assessment
      ? `this suggests ${assessment.charAt(0).toLowerCase()}${assessment.slice(1)}`
      : "this suggests steady progress based on your current response",
    plan
      ? `and the next step is ${plan.charAt(0).toLowerCase()}${plan.slice(1)}`
      : "and the next step is to continue the agreed home program and follow-up",
  ]
    .map(cleanPunctuation)
    .join(" ");

  return truncateForSummary(summary, MAX_SUMMARY_CHARS);
}

export interface GeneratePatientSummaryOptions {
  provider?: PatientSummaryProvider | undefined;
}

export async function generatePatientSummary(
  sections: SoapSections,
  options?: GeneratePatientSummaryOptions,
): Promise<string> {
  const fallbackSummary = buildFallbackPatientSummary(sections);

  // If a PatientSummaryProvider is injected, use it first and fall back when it fails.
  if (options?.provider) {
    try {
      const draft = await options.provider.generatePatientSummary({
        validatedSoap: {
          subjective: sections.subjective ?? "",
          objective: sections.objective ?? "",
          assessment: sections.assessment ?? "",
          plan: sections.plan ?? "",
        },
      });

      const parsed = summaryTextSchema.safeParse(draft.message);
      if (parsed.success) {
        return parsed.data;
      }

      logger.warn("voice.patient_summary.provider_invalid_output", {
        errorCode: "provider_summary_invalid_output",
      });
    } catch {
      logger.warn("voice.patient_summary.provider_failed_fallback", {
        errorCode: "provider_summary_request_failed",
        errorClass: "ProviderFailure",
      });
    }

    return fallbackSummary;
  }

  // Deterministic fallback (existing behavior)
  const parsed = summaryTextSchema.safeParse(fallbackSummary);
  if (!parsed.success) {
    throw new Error(`Generated patient summary failed validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function savePatientSummary(input: {
  clinicId: string;
  sessionId: string;
  summaryText: string;
}): Promise<{ id: string; clinicId: string; patientSummary: string | null }> {
  const patientSummary = summaryTextSchema.parse(input.summaryText);

  return prisma.session.update({
    where: {
      id_clinicId: {
        id: input.sessionId,
        clinicId: input.clinicId,
      },
    },
    data: {
      patientSummary,
    },
    select: {
      id: true,
      clinicId: true,
      patientSummary: true,
    },
  });
}

/**
 * Worker-stage patient summary generation: reads SOAP draft from the voice job,
 * calls the patient summary provider, saves the summary to the job record,
 * and marks the stage as succeeded.
 * Local/test runtimes may still use deterministic summary fallback; managed
 * runtimes require provider output, and every runtime requires valid SOAP JSON.
 */
export async function runSummaryGeneration(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
  provider?: PatientSummaryProvider,
): Promise<VoiceJobRecord> {
  const job = await getVoiceJobStatus(store, jobId, clinicId);

  if (job.soapDraft) {
    let soapSections: SoapSections;
    try {
      soapSections = generatedSoapSectionsSchema.parse(JSON.parse(job.soapDraft));
    } catch (error) {
      throw new Error(
        `Invalid SOAP draft for patient summary: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let summaryText: string | null = null;

    if (provider) {
      try {
        const draft = await provider.generatePatientSummary({
          validatedSoap: {
            subjective: soapSections.subjective ?? "",
            objective: soapSections.objective ?? "",
            assessment: soapSections.assessment ?? "",
            plan: soapSections.plan ?? "",
          },
        });

        const parsed = summaryTextSchema.safeParse(draft.message);
        if (parsed.success) {
          summaryText = parsed.data;
        } else if (isStrictVoiceRuntime()) {
          throw new Error(`Patient summary provider returned invalid output: ${parsed.error.message}`);
        }
      } catch (error) {
        if (isStrictVoiceRuntime()) {
          throw error;
        }
        logger.warn("voice.summary.provider_failed_fallback", {
          jobId,
          clinicId,
          errorCode: "provider_summary_request_failed",
          errorClass: "ProviderFailure",
        });
      }
    }

    if (!summaryText) {
      summaryText = await generatePatientSummary(soapSections);
    }

    await saveVoiceJobPatientSummary(store, jobId, clinicId, summaryText);
  } else if (isStrictVoiceRuntime() || provider) {
    throw new Error("Patient summary generation requires a valid SOAP draft");
  }

  const persisted = await getVoiceJobStatus(store, jobId, clinicId);
  if (isStrictVoiceRuntime() && !persisted.patientSummary?.trim()) {
    throw new Error("Summary generation stage cannot succeed without a patient summary");
  }

  return markVoiceJobSucceeded(store, jobId, clinicId);
}
