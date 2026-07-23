export type PatientSex =
  | "female"
  | "male"
  | "other"
  | "prefer_not_to_say";

export type RecentSessionStatus = "draft" | "finalized" | "reopened" | null;

export interface PatientRecord {
  id: string;
  clinicId: string;
  fullName: string;
  dateOfBirth: string | null;
  sex: PatientSex | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  clinicalNotes: string | null;
  conditionTags: string[];
  lastVisitDate: string | null;
  unfinishedNoteCount: number;
  recentSessionStatus: RecentSessionStatus;
  nextAppointment: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientListItem {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  sex: PatientSex | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  conditionTags: string[];
  lastVisitDate: string | null;
  unfinishedNoteCount: number;
  recentSessionStatus: RecentSessionStatus;
  nextAppointment: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfileResponse {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  sex: PatientSex | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  clinicalNotes: string | null;
  conditionTags: string[];
  lastVisitDate: string | null;
  unfinishedNoteCount: number;
  recentSessionStatus: RecentSessionStatus;
  nextAppointment: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientRequest {
  fullName: string;
  dateOfBirth?: string | null;
  sex?: PatientSex | null;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  clinicalNotes?: string | null;
  conditionTags?: string[];
}

export interface UpdatePatientRequest {
  fullName?: string;
  dateOfBirth?: string | null;
  sex?: PatientSex | null;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  clinicalNotes?: string | null;
  conditionTags?: string[];
}

export interface ArchivePatientRequest {
  archived: boolean;
}

export interface ListPatientsQuery {
  query?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface ListPatientsResponse {
  items: PatientListItem[];
  nextCursor: string | null;
}
