import type { NoteStatus } from "./sessions.js";

export interface DashboardFilters {
  date?: string;
  timezoneOffset?: string;
  patientId?: string;
  noteStatus?: NoteStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface DashboardUpcomingCard {
  label: "Upcoming";
  body: string;
  appointmentId?: string;
  patientName?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  visitType?: string;
}

export interface DashboardSessionCard {
  sessionId: string;
  patientId: string;
  patientName: string;
  sessionDate: string;
  visitType: string;
  noteStatus: NoteStatus;
  templateKey: string | null;
  finalNote: string | null;
  patientSummary: string | null;
  conditionTags: string[];
}

export interface DashboardResponse {
  upcoming: DashboardUpcomingCard;
  recentSessions: DashboardSessionCard[];
  filters: DashboardFilters;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
