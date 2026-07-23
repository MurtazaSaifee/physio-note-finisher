export interface VoiceUploadRequest {
  clinicId: string;
  patientId: string;
  mimeType: "audio/m4a" | "audio/mp4" | "audio/mpeg" | "audio/wav";
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;
}

export interface VoiceUploadResponse {
  uploadId: string;
  clinicId: string;
  patientId: string;
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export interface VoiceUploadCompleteRequest {
  clinicId: string;
  patientId: string;
  uploadId: string;
  storageKey: string;
  durationSeconds: number;
}

export interface VoiceUploadCompleteResponse {
  uploadId: string;
  clinicId: string;
  patientId: string;
  status: "uploaded";
  completedAt: string;
  transcriptionJobId?: string;
}

export interface TranscriptWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  words: TranscriptWord[];
  speaker?: string;
}

export interface VoiceTranscriptPayload {
  transcriptStatus: "ready";
  text: string;
  segments: TranscriptSegment[];
}

export interface VoiceTranscriptResponse extends VoiceTranscriptPayload {
  jobId: string;
  clinicId: string;
  patientId: string;
  speakerMode: "single";
  audioUrl: string | null;
}

export interface SoapSectionsDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface SoapGenerationRequest {
  patientId: string;
  sessionId: string;
  transcriptText: string;
}

export interface SoapGenerationResponse {
  sessionId: string;
  patientId: string;
  sections: SoapSectionsDraft;
}

export interface SoapSectionRegenerationRequest {
  patientId: string;
  sessionId: string;
  transcriptText: string;
  section: "subjective" | "objective" | "assessment" | "plan";
  hint?: string;
}

export interface SoapSectionRegenerationResponse {
  sessionId: string;
  patientId: string;
  sections: SoapSectionsDraft;
  regeneratedSection: "subjective" | "objective" | "assessment" | "plan";
}

export interface PatientSummaryGenerationRequest {
  patientId: string;
  sessionId: string;
}

export interface PatientSummaryGenerationResponse {
  sessionId: string;
  patientId: string;
  patientSummary: string;
}

export interface PatientSummarySaveRequest {
  patientId: string;
  sessionId: string;
  patientSummary: string;
}

export interface PatientSummarySaveResponse {
  sessionId: string;
  patientId: string;
  patientSummary: string;
}

// ---- Patient Consent contracts (Phase 12-10) ----

export type PatientConsentType = "recording_ai_processing";
export type PatientConsentStatus = "active" | "revoked";
export type PatientConsentSource = "clinician_confirmed_mobile";

export interface PatientConsentRecord {
  id: string;
  clinicId: string;
  patientId: string;
  type: PatientConsentType;
  status: PatientConsentStatus;
  source: PatientConsentSource;
  consentTextVersion: string;
  consentedAt: string;
  revokedAt: string | null;
}

export interface PatientConsentRequest {
  patientId: string;
  consentTextVersion: string;
}

export interface PatientConsentResponse extends PatientConsentRecord {}

// ---- Stage-state contracts (Phase 11) ----

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

export interface VoicePipelineStatusResponse {
  jobId: string;
  clinicId: string;
  patientId: string;
  uploadId: string;
  currentStage: VoicePipelineStageState;
  stageRetries: StageRetries;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoicePipelineStageEvent {
  id: string;
  jobId: string;
  clinicId: string;
  fromState: VoicePipelineStageState | null;
  toState: VoicePipelineStageState;
  actor: string;
  source: string;
  occurredAt: string;
}
