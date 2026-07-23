export type NoteStatus = "draft" | "finalized" | "reopened";

export interface CreateSessionEntryRequest {
  startedAt: string;
  visitType: string;
  noteStatus: NoteStatus;
  finalNote?: string | null;
  patientSummary?: string | null;
  priorPlan?: string | null;
  carryForwardContext?: string | null;
}

export interface SessionTimelineItem {
  id: string;
  patientId: string;
  sessionDate: string;
  visitType: string;
  noteStatus: NoteStatus;
  finalNotePreview: string | null;
  patientSummaryPreview: string | null;
}

export interface PatientTimelineResponse {
  patientId: string;
  items: SessionTimelineItem[];
}

export interface PriorSessionDetailResponse {
  id: string;
  patientId: string;
  sessionDate: string;
  visitType: string;
  noteStatus: NoteStatus;
  finalNote: string | null;
  patientSummary: string | null;
  priorPlan: string | null;
  carryForwardContext: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CopyForwardSection = "priorPlan" | "carryForwardContext";

export interface CopyForwardRequest {
  selectedSections: CopyForwardSection[];
}

export interface CopyForwardScaffold {
  patientId: string;
  sourceSessionId: string;
  selectedSections: CopyForwardSection[];
  priorPlan: string | null;
  carryForwardContext: string | null;
  sourceSessionDate: string;
}
