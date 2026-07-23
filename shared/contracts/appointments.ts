export type AppointmentStatus = "upcoming" | "completed" | "cancelled" | "missed";

export type ReminderTimingOption = "30m" | "1h" | "2h" | "1d";

export interface AppointmentDetailResponse {
  id: string;
  clinicId: string;
  patientId: string | null;
  patientName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  linkedSessionId: string | null;
  reminderText: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentRequest {
  patientId: string | null;
  patientNameSnapshot?: string | null | undefined;
  scheduledAt: string;
  durationMinutes: number;
  notes?: string | null | undefined;
}

export interface UpdateAppointmentRequest {
  patientId?: string | null | undefined;
  scheduledAt?: string | undefined;
  durationMinutes?: number | undefined;
  notes?: string | null | undefined;
}

export interface RescheduleAppointmentRequest {
  scheduledAt: string;
}

export interface ListAppointmentsQuery {
  date?: string;
  timezoneOffset?: string;
}

export interface AppointmentHistoryQuery {
  limit?: number;
}

export interface StartSessionFromAppointmentRequest {
  sessionType: string;
}

export interface StartSessionFromAppointmentResponse {
  appointmentId: string;
  sessionId: string;
  patientId: string;
  linkedSessionId: string;
}

export interface NotificationPreferenceResponse {
  defaultReminderTiming: ReminderTimingOption;
  pushEnabled: boolean;
}

export interface UpdateNotificationPreferenceRequest {
  defaultReminderTiming: ReminderTimingOption;
  pushEnabled: boolean;
}
