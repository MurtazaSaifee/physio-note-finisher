export type ExportRecordAction = "saved" | "shared" | "copied";
export type ExportRecordType = "fullNote" | "patientSummary";
export type ExportRecordFormat = "pdf" | "text";

export interface CreateExportRecordRequest {
  action: ExportRecordAction;
  type: ExportRecordType;
  format: ExportRecordFormat;
}

export interface ExportRecordResponse {
  id: string;
  sessionId: string;
  action: ExportRecordAction;
  type: ExportRecordType;
  format: ExportRecordFormat;
  exportedByUserId: string;
  fileStatus: string | null;
  fileError: string | null;
  fileExpiresAt: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

export interface ListPatientExportRecordsResponse {
  patientId: string;
  records: ExportRecordResponse[];
}
