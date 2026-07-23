import type { NoteStatus } from "./sessions.js";

export type SoapSectionKey = "subjective" | "objective" | "assessment" | "plan";
export type TemplateApplyMode = "fillBlank" | "replaceAll";
export type ConditionTemplateKey =
  | "low_back"
  | "neck"
  | "shoulder"
  | "knee"
  | "acl_rehab"
  | "tennis_elbow"
  | "post_op"
  | "balance_gait";
export type TemplateCategory = string;
export type TemplateSource = "built_in" | "custom";
export type TemplateKey = ConditionTemplateKey | string;

export interface SoapSections {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
}

export interface CreateManualNoteRequest {
  startedAt: string;
  visitType: string;
  sections: SoapSections;
  templateKey?: TemplateKey | null;
  templateApplyMode?: TemplateApplyMode | null;
}

export interface SaveManualNoteRequest {
  sections: SoapSections;
  templateKey?: TemplateKey | null;
  templateApplyMode?: TemplateApplyMode | null;
}

export interface ProgressNoteResponse {
  id: string;
  patientId: string;
  sessionId: string;
  startedAt: string;
  visitType: string;
  noteStatus: NoteStatus;
  patientSummary: string | null;
  sections: SoapSections;
  templateKey: TemplateKey | null;
  templateProvenance?: TemplateProvenanceSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLifecycleResponse extends ProgressNoteResponse {}

export interface ConditionTemplate {
  key: TemplateKey;
  label: string;
  category: TemplateCategory;
  categories?: TemplateCategory[];
  source?: TemplateSource;
  description: string;
  conditionTags: string[];
  sections: SoapSections;
}

export interface ConditionTemplateListResponse {
  templates: ConditionTemplate[];
  suggestedTemplates: ConditionTemplate[];
  recentTemplates: ConditionTemplate[];
  categories: TemplateCategory[];
}

export interface CustomTemplateCategory {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomConditionTemplate {
  id: string;
  name: string;
  source: TemplateSource;
  categories: TemplateCategory[];
  sections: SoapSections;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateProvenanceSnapshot {
  templateLabel: string | null;
  categoryLabels: TemplateCategory[];
  source: TemplateSource | null;
  applyMode: TemplateApplyMode | null;
}
