export const CURRENT_APP_SCREEN_KEYS = [
  "patients",
  "new-patient",
  "patient-profile",
  "start-session",
  "template-library",
  "template-editor",
  "voice-capture",
  "transcript-review",
  "prior-session",
  "note",
  "settings",
  "settings-password",
  "calendar",
  "new-appointment",
  "appointment-detail",
  "export-share",
  "read-only-preview",
  "audit",
] as const;

export const AUTH_SCREEN_KEYS = [
  "sign-in",
  "sign-up",
  "verify-email-otp",
  "forgot-password",
] as const;

export type CurrentAppScreenKey = (typeof CURRENT_APP_SCREEN_KEYS)[number];
export type AuthScreenKey = (typeof AUTH_SCREEN_KEYS)[number];
export type ClinicalScreenId = CurrentAppScreenKey | AuthScreenKey | "app-loading";
export type BottomNavigationKey = "calendar" | "patients" | "profile";
export type ApprovedBottomNavigationKey = BottomNavigationKey;
export type ClinicalScreenKind = "system" | "auth" | "authenticated";

type CurrentBottomNavigationItem =
  | { key: "patients"; label: "Patients"; target: "patients" }
  | { key: "calendar"; label: "Calendar"; target: "calendar" }
  | { key: "profile"; label: "Profile"; target: "settings" };

type ApprovedBottomNavigationItem =
  | { key: "patients"; label: "Patients"; target: "patients" }
  | { key: "calendar"; label: "Calendar"; target: "calendar" }
  | { key: "profile"; label: "Profile"; target: "settings" };

export type ClinicalScreen = {
  id: ClinicalScreenId;
  kind: ClinicalScreenKind;
  title: string;
  currentStates: readonly string[];
  sourceFiles: readonly string[];
};

export type ClinicalTransition = {
  from: ClinicalScreenId;
  to: ClinicalScreenId;
  trigger: string;
  condition?: string;
  sourceFiles: readonly string[];
};

export type ClinicalFlowMap = {
  current: {
    authenticatedDefaultScreen: CurrentAppScreenKey;
    authDefaultScreen: AuthScreenKey;
    bottomNavigation: readonly CurrentBottomNavigationItem[];
    shellNotes: readonly string[];
  };
  approvedRedesign: {
    defaultScreen: "patients";
    bottomNavigation: readonly ApprovedBottomNavigationItem[];
    notes: readonly string[];
  };
  screens: readonly ClinicalScreen[];
  transitions: readonly ClinicalTransition[];
};

const APP_SOURCE = "mobile/App.tsx";

const screen = (
  id: ClinicalScreenId,
  kind: ClinicalScreenKind,
  title: string,
  currentStates: readonly string[],
  sourceFiles: readonly string[],
): ClinicalScreen => ({ id, kind, title, currentStates, sourceFiles });

const transition = (
  from: ClinicalScreenId,
  to: ClinicalScreenId,
  trigger: string,
  sourceFiles: readonly string[],
  condition?: string,
): ClinicalTransition => ({
  from,
  to,
  trigger,
  ...(condition ? { condition } : {}),
  sourceFiles,
});

export const clinicalFlowMap = {
  current: {
    authenticatedDefaultScreen: "patients",
    authDefaultScreen: "sign-in",
    bottomNavigation: [
      { key: "patients", label: "Patients", target: "patients" },
      { key: "calendar", label: "Calendar", target: "calendar" },
      { key: "profile", label: "Profile", target: "settings" },
    ],
    shellNotes: [
      "AppShell starts authenticated users on patients and exposes Patients, Calendar, and Profile only.",
      "Task-focused routes hide the bottom navigation while persistent root panels remain mounted.",
      "Hardware back returns from task screens to their explicit patient-first origin.",
      "Voice capture, transcript review, and export share render a missing-clinic state when clinic context is unavailable.",
    ],
  },
  approvedRedesign: {
    defaultScreen: "patients",
    bottomNavigation: [
      { key: "patients", label: "Patients", target: "patients" },
      { key: "calendar", label: "Calendar", target: "calendar" },
      { key: "profile", label: "Profile", target: "settings" },
    ],
    notes: [
      "The current App.tsx shell implements this approved patient-first target.",
      "Session functionality remains reachable from patient and appointment flows without a separate Sessions destination.",
    ],
  },
  screens: [
    screen("app-loading", "system", "Restoring local session", ["loading"], [APP_SOURCE, "mobile/features/auth/providers/AuthProvider.tsx"]),
    screen("sign-in", "auth", "Sign in", ["ready", "field-validation-error", "submitting", "error", "password-visible"], [APP_SOURCE, "mobile/app/(auth)/sign-in.tsx", "mobile/tests/ui/auth-screens.test.tsx"]),
    screen("sign-up", "auth", "Create Account", ["ready", "email-validation-error", "submitting", "error", "password-visible"], [APP_SOURCE, "mobile/app/(auth)/sign-up.tsx", "mobile/tests/ui/auth-screens.test.tsx"]),
    screen("verify-email-otp", "auth", "Check your email", ["ready", "code-validation-error", "submitting", "resend-cooldown", "resend-limit", "error", "success"], [APP_SOURCE, "mobile/app/(auth)/verify-email-otp.tsx", "mobile/tests/ui/auth-screens.test.tsx"]),
    screen("forgot-password", "auth", "Reset Password", ["initiate", "reset", "email-validation-error", "code-validation-error", "submitting", "resend-cooldown", "resend-limit", "error", "success"], [APP_SOURCE, "mobile/app/(auth)/forgot-password.tsx", "mobile/tests/ui/forgot-password.test.tsx"]),
    screen("patients", "authenticated", "Patients", ["loading", "ready", "no-patients", "searching", "no-match", "archived-included", "create-idle", "create-pending", "create-error"], [APP_SOURCE, "mobile/features/patients/screens/PatientListScreen.tsx", "mobile/tests/patients/patient-list-search-screen.test.tsx", "mobile/tests/patients/patient-workspace-screen.test.tsx"]),
    screen("new-patient", "authenticated", "New Patient", ["ready", "validation-error", "creating", "create-error"], [APP_SOURCE, "mobile/features/patients/screens/CreatePatientScreen.tsx", "mobile/tests/patients/patient-workspace-screen.test.tsx"]),
    screen("patient-profile", "authenticated", "Patient Profile", ["no-patient-id", "loading", "active", "archived", "unavailable", "empty-timeline", "populated-timeline", "empty-finalized-records", "filtered-records-empty", "save-pending", "archive-pending"], [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx", "mobile/tests/patients/patient-profile-screen.test.tsx", "mobile/tests/patients/patient-profile-records.test.tsx"]),
    screen("start-session", "authenticated", "Start New Session", ["missing-patient", "loading-patient", "ready", "templates-empty", "templates-suggested-or-recent"], [APP_SOURCE, "mobile/features/intake/screens/StartSessionScreen.tsx", "mobile/tests/intake/start-session-flow.test.tsx"]),
    screen("template-library", "authenticated", "Template Library", ["library", "searching", "preview", "empty-category", "custom-template-actions"], [APP_SOURCE, "mobile/features/intake/screens/TemplateLibraryScreen.tsx", "mobile/tests/intake/template-library-screen.test.tsx"]),
    screen("template-editor", "authenticated", "Create or Edit Template", ["create", "edit", "invalid", "dirty", "discard-confirmation", "saving"], [APP_SOURCE, "mobile/features/notes/screens/TemplateEditorScreen.tsx", "mobile/tests/notes/template-editor-unsaved-warning.test.tsx"]),
    screen("voice-capture", "authenticated", "Audio Capture", ["clinic-context-loading", "clinic-context-error", "clinic-context-unavailable", "permission-requesting", "permission-denied", "idle-ready-to-record", "recording", "paused", "stopped", "short-recording", "playback", "uploading", "uploaded", "consent-required", "consent-confirming", "recording-error", "file-missing", "upload-error"], [APP_SOURCE, "mobile/features/voice/screens/VoiceCaptureScreen.tsx", "mobile/tests/voice/voice-capture-screen.test.tsx"]),
    screen("transcript-review", "authenticated", "Session Audio Review", ["clinic-context-loading", "clinic-context-error", "clinic-context-unavailable", "loading", "waiting-for-transcript", "ready", "editing", "saving-edit", "transcription-failed", "soap-failed", "summary-failed", "retrying", "playback", "delete-confirmation"], [APP_SOURCE, "mobile/features/voice/screens/TranscriptReviewScreen.tsx", "mobile/tests/voice/transcript-review-screen.test.tsx"]),
    screen("prior-session", "authenticated", "Prior Session", ["loading", "loaded", "unavailable", "no-sections-selected", "sections-selected", "copying"], [APP_SOURCE, "mobile/features/patients/screens/PriorSessionScreen.tsx", "mobile/features/patients/components/PriorSessionPanel.tsx", "mobile/tests/patients/patient-profile-screen.test.tsx"]),
    screen("note", "authenticated", "Manual SOAP Note", ["patient-unselected", "patient-searching", "draft-not-started", "draft-in-progress", "draft-saved", "saved-offline", "generating-soap", "section-regenerating", "summary-generating", "summary-saving", "finalize-confirmation", "finalized-locked", "reopen-confirmation", "reopened-editable", "save-error"], [APP_SOURCE, "mobile/features/notes/screens/ManualSoapComposerScreen.tsx", "mobile/features/notes/components/SoapSectionEditor.tsx", "mobile/tests/notes/manual-soap-composer-screen.test.tsx", "mobile/tests/offline/draft-persistence.test.tsx"]),
    screen("settings", "authenticated", "Clinical Settings", ["loading-profile", "profile-ready", "saving-profile", "error", "retention-preferences-loading", "retention-forever-warning", "action-pending"], [APP_SOURCE, "mobile/app/(app)/settings/index.tsx", "mobile/tests/settings/clinical-settings-screen.test.tsx"]),
    screen("settings-password", "authenticated", "Change Password", ["code-not-sent", "code-sent", "resend-cooldown", "resend-limit", "invalid-code", "password-hidden", "submitting", "error", "success"], [APP_SOURCE, "mobile/app/(app)/settings/password.tsx", "mobile/tests/settings/password-change-screen.test.tsx"]),
    screen("calendar", "authenticated", "Clinical Calendar", ["loading", "selected-day", "today", "empty-day", "populated-day", "refetching"], [APP_SOURCE, "mobile/features/appointments/screens/CalendarScreen.tsx", "mobile/tests/calendar/calendar-screen.test.tsx"]),
    screen("new-appointment", "authenticated", "New Appointment", ["patient-searching", "no-matching-patients", "patient-selected", "prefilled-patient", "date-picker", "time-picker", "create-disabled", "creating"], [APP_SOURCE, "mobile/features/appointments/screens/NewAppointmentScreen.tsx", "mobile/tests/calendar/new-appointment-screen.test.tsx"]),
    screen("appointment-detail", "authenticated", "Appointment", ["loading", "upcoming", "cancelled", "start-session-disabled-too-early", "cancel-confirmation", "cancelling"], [APP_SOURCE, "mobile/features/appointments/screens/AppointmentDetailScreen.tsx", "mobile/tests/calendar/appointment-detail-screen.test.tsx"]),
    screen("read-only-preview", "authenticated", "Finalized Note Preview", ["loading", "finalized", "no-final-note", "no-summary", "export-ready", "copy-forward-ready"], [APP_SOURCE, "mobile/features/exports/screens/ReadOnlyNotePreviewScreen.tsx", "mobile/tests/exports/read-only-note-preview-screen.test.tsx"]),
    screen("export-share", "authenticated", "Export & Share", ["clinic-context-loading", "clinic-context-error", "clinic-context-unavailable", "not-finalized-blocked", "full-note-mode", "patient-summary-mode", "full-note-unavailable", "summary-unavailable", "action-pending", "saved", "error"], [APP_SOURCE, "mobile/features/exports/screens/ExportShareScreen.tsx", "mobile/tests/exports/export-share-screen.test.tsx"]),
    screen("audit", "authenticated", "Audit History", ["loading", "populated", "empty", "error"], [APP_SOURCE, "mobile/features/audit/screens/AuditHistoryScreen.tsx", "mobile/tests/audit/audit-history-screen.test.tsx"]),
  ],
  transitions: [
    transition("app-loading", "sign-in", "auth-bootstrap", [APP_SOURCE], "AuthProvider settles unauthenticated."),
    transition("app-loading", "patients", "auth-bootstrap", [APP_SOURCE], "AuthProvider settles authenticated."),
    transition("sign-in", "forgot-password", "forgot-password", [APP_SOURCE, "mobile/app/(auth)/sign-in.tsx"]),
    transition("sign-in", "sign-up", "create-account", [APP_SOURCE]),
    transition("sign-in", "patients", "sign-in-success", [APP_SOURCE, "mobile/features/auth/providers/AuthProvider.tsx"]),
    transition("sign-up", "sign-in", "back-to-sign-in", [APP_SOURCE, "mobile/app/(auth)/sign-up.tsx"]),
    transition("sign-up", "verify-email-otp", "submit-sign-up", [APP_SOURCE, "mobile/app/(auth)/sign-up.tsx"]),
    transition("verify-email-otp", "sign-up", "back", [APP_SOURCE, "mobile/app/(auth)/verify-email-otp.tsx"]),
    transition("verify-email-otp", "patients", "verify-success", [APP_SOURCE, "mobile/features/auth/providers/AuthProvider.tsx"]),
    transition("forgot-password", "sign-in", "back-or-reset-success", [APP_SOURCE, "mobile/app/(auth)/forgot-password.tsx"]),
    transition("sign-in", "sign-in", "sign-in-error", ["mobile/app/(auth)/sign-in.tsx"]),
    transition("sign-up", "sign-up", "validation-or-submit-error", ["mobile/app/(auth)/sign-up.tsx"]),
    transition("verify-email-otp", "verify-email-otp", "resend-or-submit-error", ["mobile/app/(auth)/verify-email-otp.tsx"]),
    transition("forgot-password", "forgot-password", "resend-or-submit-error", ["mobile/app/(auth)/forgot-password.tsx"]),
    transition("calendar", "calendar", "bottom-nav-calendar-or-select-day", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx", "mobile/features/appointments/screens/CalendarScreen.tsx"]),
    transition("calendar", "patients", "bottom-nav-patients", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("calendar", "settings", "bottom-nav-profile", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("calendar", "new-appointment", "new-appointment", [APP_SOURCE, "mobile/features/appointments/screens/CalendarScreen.tsx"]),
    transition("calendar", "appointment-detail", "open-appointment", [APP_SOURCE, "mobile/features/appointments/screens/CalendarScreen.tsx"]),
    transition("new-appointment", "calendar", "back", [APP_SOURCE, "mobile/features/appointments/screens/NewAppointmentScreen.tsx"], "Calendar entry keeps calendar as the return target."),
    transition("new-appointment", "patient-profile", "back", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"], "Patient-profile entry keeps that profile as the return target."),
    transition("new-appointment", "appointment-detail", "appointment-created", [APP_SOURCE, "mobile/features/appointments/screens/NewAppointmentScreen.tsx"], "The appointment detail inherits the creation return target."),
    transition("appointment-detail", "calendar", "back", [APP_SOURCE], "Calendar-created appointments return to calendar."),
    transition("appointment-detail", "patient-profile", "back", [APP_SOURCE], "Patient-profile-created appointments return to that profile."),
    transition("appointment-detail", "start-session", "start-session", [APP_SOURCE, "mobile/features/appointments/screens/AppointmentDetailScreen.tsx"]),
    transition("appointment-detail", "appointment-detail", "cancel-confirmation-or-cancel", ["mobile/features/appointments/screens/AppointmentDetailScreen.tsx"]),
    transition("patients", "patients", "bottom-nav-patients-or-filter", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx", "mobile/features/patients/screens/PatientListScreen.tsx"]),
    transition("patients", "calendar", "bottom-nav-calendar", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("patients", "settings", "bottom-nav-profile", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("patients", "new-patient", "add-patient", [APP_SOURCE, "mobile/features/patients/screens/PatientListScreen.tsx"]),
    transition("patients", "patient-profile", "open-patient", [APP_SOURCE, "mobile/features/patients/screens/PatientListScreen.tsx"]),
    transition("new-patient", "patients", "back", [APP_SOURCE, "mobile/features/patients/screens/CreatePatientScreen.tsx"]),
    transition("new-patient", "patient-profile", "patient-created", [APP_SOURCE, "mobile/features/patients/screens/CreatePatientScreen.tsx"]),
    transition("patient-profile", "patients", "back", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"]),
    transition("patient-profile", "start-session", "start-new-session", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"]),
    transition("patient-profile", "note", "resume-draft", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"]),
    transition("patient-profile", "read-only-preview", "open-finalized-record", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"]),
    transition("patient-profile", "new-appointment", "create-appointment", [APP_SOURCE, "mobile/features/patients/screens/PatientProfileScreen.tsx"]),
    transition("start-session", "patients", "back", [APP_SOURCE, "mobile/features/intake/screens/StartSessionScreen.tsx"], "Default startSessionBackTarget is patients."),
    transition("start-session", "voice-capture", "start-blank-session", [APP_SOURCE, "mobile/features/intake/screens/StartSessionScreen.tsx"]),
    transition("start-session", "note", "use-template", [APP_SOURCE, "mobile/features/intake/screens/StartSessionScreen.tsx"]),
    transition("start-session", "template-library", "open-template-library", [APP_SOURCE, "mobile/features/intake/screens/StartSessionScreen.tsx"]),
    transition("template-library", "start-session", "back", [APP_SOURCE, "mobile/features/intake/screens/TemplateLibraryScreen.tsx"]),
    transition("template-library", "template-library", "preview-template", ["mobile/features/intake/screens/TemplateLibraryScreen.tsx"]),
    transition("template-library", "note", "use-template-or-blank", [APP_SOURCE, "mobile/features/intake/screens/TemplateLibraryScreen.tsx"]),
    transition("template-library", "template-editor", "add-or-edit-template", [APP_SOURCE, "mobile/features/intake/screens/TemplateLibraryScreen.tsx"]),
    transition("template-editor", "template-library", "back-or-save", [APP_SOURCE, "mobile/features/notes/screens/TemplateEditorScreen.tsx"]),
    transition("voice-capture", "start-session", "back", [APP_SOURCE, "mobile/features/voice/screens/VoiceCaptureScreen.tsx"]),
    transition("voice-capture", "transcript-review", "upload-complete", [APP_SOURCE, "mobile/features/voice/screens/VoiceCaptureScreen.tsx"]),
    transition("transcript-review", "voice-capture", "back-or-delete-recording", [APP_SOURCE, "mobile/features/voice/screens/TranscriptReviewScreen.tsx"]),
    transition("transcript-review", "note", "generate-soap-note", [APP_SOURCE, "mobile/features/voice/screens/TranscriptReviewScreen.tsx"]),
    transition("prior-session", "patient-profile", "back", [APP_SOURCE, "mobile/features/patients/screens/PriorSessionScreen.tsx"]),
    transition("prior-session", "read-only-preview", "back-to-finalized-preview", [APP_SOURCE], "priorSessionBackTarget preserves the finalized preview origin."),
    transition("prior-session", "note", "copy-forward-complete", [APP_SOURCE, "mobile/features/patients/screens/PriorSessionScreen.tsx"]),
    transition("note", "patients", "back-to-patients", [APP_SOURCE], "noteBackTarget defaults to patients for the patient-first shell."),
    transition("note", "start-session", "back-to-start-session", [APP_SOURCE], "noteBackTarget is start-session for patient entry."),
    transition("note", "template-library", "back-to-template-library", [APP_SOURCE], "noteBackTarget is template-library for library entry."),
    transition("note", "patient-profile", "back-to-patient-profile", [APP_SOURCE], "noteBackTarget is patient-profile for profile/history entry."),
    transition("note", "appointment-detail", "back-to-appointment", [APP_SOURCE], "noteBackTarget is appointment-detail for appointment entry."),
    transition("note", "voice-capture", "back-to-voice-capture", [APP_SOURCE], "noteBackTarget is voice-capture after transcript review."),
    transition("note", "export-share", "open-export-share", [APP_SOURCE, "mobile/features/notes/screens/ManualSoapComposerScreen.tsx"]),
    transition("note", "audit", "view-history", [APP_SOURCE, "mobile/features/notes/screens/ManualSoapComposerScreen.tsx"]),
    transition("audit", "note", "back", [APP_SOURCE, "mobile/features/audit/screens/AuditHistoryScreen.tsx"], "Final-review history restores the composer to final review; the generic audit return remains review."),
    transition("read-only-preview", "patient-profile", "back", [APP_SOURCE, "mobile/features/exports/screens/ReadOnlyNotePreviewScreen.tsx"]),
    transition("read-only-preview", "prior-session", "create-new-draft-from-session", [APP_SOURCE, "mobile/features/exports/screens/ReadOnlyNotePreviewScreen.tsx"]),
    transition("read-only-preview", "export-share", "open-export-share", [APP_SOURCE, "mobile/features/exports/screens/ReadOnlyNotePreviewScreen.tsx"]),
    transition("export-share", "note", "back-to-note", [APP_SOURCE], "exportShareSourceScreen is note for manual-note exports."),
    transition("export-share", "read-only-preview", "back-to-finalized-preview", [APP_SOURCE], "exportShareSourceScreen is read-only-preview for finalized-record exports."),
    transition("settings", "settings", "bottom-nav-profile-or-settings-action", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("settings", "calendar", "bottom-nav-calendar", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("settings", "patients", "bottom-nav-patients", [APP_SOURCE, "mobile/features/ui/meridian/shell.tsx"]),
    transition("settings", "settings-password", "change-password", [APP_SOURCE, "mobile/app/(app)/settings/index.tsx"]),
    transition("settings-password", "settings", "back-or-password-success", [APP_SOURCE, "mobile/app/(app)/settings/password.tsx"]),
    transition("settings", "sign-in", "logout", [APP_SOURCE, "mobile/app/(app)/settings/index.tsx"]),
    transition("calendar", "patients", "hardware-back", [APP_SOURCE]),
    transition("new-appointment", "calendar", "hardware-back", [APP_SOURCE], "Calendar entry keeps calendar as the return target."),
    transition("new-appointment", "patient-profile", "hardware-back", [APP_SOURCE], "Patient-profile entry keeps that profile as the return target."),
    transition("appointment-detail", "calendar", "hardware-back", [APP_SOURCE], "Default appointmentDetailBackTarget is calendar."),
    transition("appointment-detail", "patient-profile", "hardware-back", [APP_SOURCE], "Patient-profile appointment creation preserves its profile return target."),
    transition("appointment-detail", "patients", "hardware-back", [APP_SOURCE], "Dashboard opens appointment detail with patients back target."),
    transition("patient-profile", "patients", "hardware-back", [APP_SOURCE]),
    transition("new-patient", "patients", "hardware-back", [APP_SOURCE]),
    transition("patients", "patients", "hardware-back-native-default", [APP_SOURCE], "AppShell has no patients branch, so it returns false and leaves the native default to handle back."),
    transition("start-session", "patients", "hardware-back", [APP_SOURCE], "Default startSessionBackTarget is patients."),
    transition("start-session", "patient-profile", "hardware-back", [APP_SOURCE], "Patient profile entry sets startSessionBackTarget to patient-profile."),
    transition("template-library", "start-session", "hardware-back", [APP_SOURCE]),
    transition("template-editor", "template-library", "hardware-back", [APP_SOURCE], "Default templateEditorBackTarget is template-library."),
    transition("voice-capture", "start-session", "hardware-back", [APP_SOURCE]),
    transition("transcript-review", "voice-capture", "hardware-back", [APP_SOURCE]),
    transition("prior-session", "patient-profile", "hardware-back", [APP_SOURCE]),
    transition("prior-session", "read-only-preview", "hardware-back-to-finalized-preview", [APP_SOURCE], "priorSessionBackTarget preserves the finalized preview origin."),
    transition("note", "patients", "hardware-back", [APP_SOURCE], "Default noteBackTarget is patients."),
    transition("note", "patient-profile", "hardware-back", [APP_SOURCE], "Patient profile and prior-session entries use patient-profile."),
    transition("note", "voice-capture", "hardware-back", [APP_SOURCE], "Voice entry sets noteBackTarget to voice-capture."),
    transition("note", "start-session", "hardware-back", [APP_SOURCE], "Patient intake entry sets noteBackTarget to start-session."),
    transition("note", "template-library", "hardware-back", [APP_SOURCE], "Template library entry sets noteBackTarget to template-library."),
    transition("note", "appointment-detail", "hardware-back", [APP_SOURCE], "Appointment entry sets noteBackTarget to appointment-detail."),
    transition("audit", "note", "hardware-back", [APP_SOURCE], "Final-review history restores the composer to final review; generic audit return remains review."),
    transition("read-only-preview", "patient-profile", "hardware-back", [APP_SOURCE]),
    transition("export-share", "note", "hardware-back", [APP_SOURCE], "Source screen controls exportShareSourceScreen."),
    transition("export-share", "read-only-preview", "hardware-back", [APP_SOURCE], "Source screen controls exportShareSourceScreen."),
    transition("settings", "patients", "hardware-back", [APP_SOURCE]),
    transition("settings-password", "settings", "hardware-back", [APP_SOURCE]),
    transition("voice-capture", "voice-capture", "recording-state", ["mobile/features/voice/screens/VoiceCaptureScreen.tsx"], "idle -> recording -> paused/resumed -> stopped; restart returns to idle."),
    transition("voice-capture", "voice-capture", "upload-state", ["mobile/features/voice/screens/VoiceCaptureScreen.tsx"], "stopped -> uploading -> uploaded, consent-required, or upload-error."),
    transition("transcript-review", "transcript-review", "transcript-state", ["mobile/features/voice/screens/TranscriptReviewScreen.tsx"], "loading -> waiting/ready; ready -> editing -> saved; failed stages -> retrying."),
    transition("note", "note", "note-lifecycle", ["mobile/features/notes/screens/ManualSoapComposerScreen.tsx"], "draft-not-started -> draft-in-progress/saved-offline -> finalized-locked -> reopened-editable."),
    transition("appointment-detail", "appointment-detail", "cancel-state", ["mobile/features/appointments/screens/AppointmentDetailScreen.tsx"], "upcoming -> cancel-confirmation -> cancelled."),
    transition("template-library", "template-library", "template-preview-state", ["mobile/features/intake/screens/TemplateLibraryScreen.tsx"], "library -> preview -> library or use-template."),
    transition("forgot-password", "forgot-password", "reset-state", ["mobile/app/(auth)/forgot-password.tsx"], "initiate -> reset after a code is sent."),
  ],
} satisfies ClinicalFlowMap;
