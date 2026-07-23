import type { CreateManualNoteRequest, SoapSections } from "./notes.js";
import type { UpdateAppointmentRequest } from "./appointments.js";

export type QueuedChange =
  | {
      id: string;
      type: "noteEdit";
      sessionId: string;
      patientId: string;
      sections: SoapSections;
      timestamp: number;
    }
  | {
      id: string;
      type: "noteCreate";
      draftId: string;
      patientId: string;
      input: CreateManualNoteRequest;
      timestamp: number;
    }
  | {
      id: string;
      type: "appointmentEdit";
      appointmentId: string;
      updates: UpdateAppointmentRequest;
      timestamp: number;
    };

export type SyncState = {
  status: "idle" | "syncing" | "failed";
  pendingCount: number;
  currentItem?: number;
  totalItems?: number;
  lastError?: string;
};

export type SyncStatus = "synced" | "pending" | "failed";
