/**
 * STT language codes supported by Sarvam Saaras v3.
 */
export type SttLanguageCode =
  | "unknown"
  | "hi-IN"
  | "en-IN"
  | "bn-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "od-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN"
  | "gu-IN";

/**
 * STT processing mode.
 */
export type SttMode = "transcribe" | "translate" | "verbatim" | "translit" | "codemix";

/**
 * A single segment of a transcript with optional speaker annotation.
 */
export interface TranscriptSegment {
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
  speakerId?: string;
}

/**
 * Result returned by any SttProvider implementation.
 */
export interface TranscriptionResult {
  requestId: string | null;
  transcript: string;
  languageCode: string | null;
  languageProbability: number | null;
  segments: TranscriptSegment[];
  diarizedEntries?: Array<{
    transcript: string;
    startTimeSeconds: number;
    endTimeSeconds: number;
    speakerId: string;
  }> | undefined;
}

/**
 * Options passed to a SttProvider implementatation.
 */
export interface SttTranscribeOptions {
  languageCode?: SttLanguageCode;
  mode?: SttMode;
  enableDiarization?: boolean;
  audioDurationSeconds?: number;
  numSpeakers?: number;
}

/**
 * Speech-to-text provider interface.
 * Implementations call an external STT API and return a normalized TranscriptionResult.
 */
export interface SttProvider {
  transcribe(
    audioBuffer: Buffer,
    options?: SttTranscribeOptions,
  ): Promise<TranscriptionResult>;
}

/**
 * SOAP note draft produced by a ClinicalNoteProvider.
 */
export interface SoapNoteDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  metadata?: {
    language?: string;
    confidence?: "high" | "medium" | "low";
    missingInformation?: string[];
    requiresClinicianReview?: boolean;
  } | undefined;
}

/**
 * Input for SOAP note generation.
 */
export interface GenerateSoapInput {
  transcript: string;
  correctedTranscript?: string;
  patientDemographics?: {
    age?: number;
    sex?: string;
    conditionTags?: string[];
  };
  priorNotes?: Array<{
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }>;
  templateHints?: string[];
  clinicPreferences?: string;
}

/**
 * Clinical note (SOAP) generation provider interface.
 */
export interface ClinicalNoteProvider {
  generateSoapDraft(input: GenerateSoapInput): Promise<SoapNoteDraft>;
}

/**
 * Patient summary draft produced by a PatientSummaryProvider.
 */
export interface PatientSummaryDraft {
  message: string;
  language?: string;
  safetyNote?: string | null;
  followUp?: string | null;
}

/**
 * Input for patient summary generation.
 */
export interface GenerateSummaryInput {
  validatedSoap: SoapNoteDraft;
  transcriptLanguage?: string;
  patientLanguagePreference?: string;
  clinicTonePreference?: string;
}

/**
 * Patient-friendly summary generation provider interface.
 */
export interface PatientSummaryProvider {
  generatePatientSummary(input: GenerateSummaryInput): Promise<PatientSummaryDraft>;
}
