import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./features/ui/meridian/ErrorBoundary";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SignInScreen } from "./app/(auth)/sign-in";
import { SignUpScreen } from "./app/(auth)/sign-up";
import { VerifyEmailOtpScreen } from "./app/(auth)/verify-email-otp";
import { ForgotPasswordScreen } from "./app/(auth)/forgot-password";
import { ClinicalSettingsScreen } from "./app/(app)/settings";
import { PasswordChangeScreen } from "./app/(app)/settings/password";
import { useGetProfile } from "./features/settings/api/useGetProfile";
import { clearOfflinePhiData } from "./features/offline/storage/queueStore";
import {
  AuthProvider,
  useAuth,
  type ProviderSessionManager,
} from "./features/auth/providers/AuthProvider";
import {
  createAuthApi,
  isEmailVerificationRequiredError,
} from "./features/auth/services/authApi";
import { SessionManager } from "./features/auth/services/sessionManager";
import {
  ManualSoapComposerScreen,
  type ComposerEntryMode,
  type DocumentationSource,
} from "./features/notes/screens/ManualSoapComposerScreen";
import { TemplateEditorScreen } from "./features/notes/screens/TemplateEditorScreen";
import type { TemplateKey } from "../shared/contracts/notes";
import type { CopyForwardScaffold } from "../shared/contracts/sessions";
import type { VoiceUploadCompleteResponse } from "../shared/contracts/voice";
import { StartSessionScreen } from "./features/intake/screens/StartSessionScreen";
import { TemplateLibraryScreen } from "./features/intake/screens/TemplateLibraryScreen";
import { PatientListScreen } from "./features/patients/screens/PatientListScreen";
import { CreatePatientScreen } from "./features/patients/screens/CreatePatientScreen";
import { PatientProfileScreen } from "./features/patients/screens/PatientProfileScreen";
import { PriorSessionScreen } from "./features/patients/screens/PriorSessionScreen";
import { resolveApiBaseUrl } from "./features/runtime/apiBaseUrl";
import { MeridianProvider } from "./features/ui/meridian/MeridianProvider";
import { MeridianButton } from "./features/ui/meridian/primitives";
import { meridian } from "./features/ui/meridian/tokens";
import { MeridianProtectedShell, MeridianDestinationKey } from "./features/ui/meridian/shell";
import { AppSyncOverlay } from "./features/offline/components/AppSyncOverlay";
import { TranscriptReviewScreen } from "./features/voice/screens/TranscriptReviewScreen";
import { VoiceCaptureScreen } from "./features/voice/screens/VoiceCaptureScreen";
import { useDeleteRecording } from "./features/voice/hooks/useDeleteRecording";
import { CalendarScreen } from "./features/appointments/screens/CalendarScreen";
import { NewAppointmentScreen } from "./features/appointments/screens/NewAppointmentScreen";
import { AppointmentDetailScreen } from "./features/appointments/screens/AppointmentDetailScreen";
import { ExportShareScreen } from "./features/exports/screens/ExportShareScreen";
import { ReadOnlyNotePreviewScreen } from "./features/exports/screens/ReadOnlyNotePreviewScreen";
import { AuditHistoryScreen } from "./features/audit/screens/AuditHistoryScreen";

type ScreenKey =
  | "patients"
  | "new-patient"
  | "patient-profile"
  | "start-session"
  | "template-library"
  | "template-editor"
  | "voice-capture"
  | "transcript-review"
  | "prior-session"
  | "note"
  | "settings"
  | "settings-password"
  | "calendar"
  | "new-appointment"
  | "appointment-detail"
  | "export-share"
  | "read-only-preview"
  | "audit";
type AuthScreenKey =
  | "sign-in"
  | "sign-up"
  | "verify-email-otp"
  | "forgot-password";
type VerifyEmailBackTarget = "sign-in" | "sign-up";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function createSessionManager(): ProviderSessionManager {
  const sessionManager = new SessionManager({
    authApi: createAuthApi(resolveApiBaseUrl()),
  });

  return {
    signIn: (email, password) => sessionManager.signIn(email, password),
    applyTokens: (tokens) => sessionManager.applyTokens(tokens),
    signOut: () => sessionManager.signOut(),
    restoreSession: async () =>
      (await sessionManager.restoreSession()) === "authenticated"
        ? "authenticated"
        : "unauthenticated",
    runAuthenticatedRequest: (request) =>
      sessionManager.runAuthenticatedRequest(request),
  };
}

function ShellPanel({
  active,
  persist = false,
  children,
}: {
  active: boolean;
  persist?: boolean;
  children: React.ReactNode;
}): React.JSX.Element | null {
  if (!active && !persist) {
    return null;
  }
  return (
    <View
      pointerEvents={active ? "auto" : "none"}
      style={[styles.panel, !active && persist && styles.panelHidden]}
    >
      {children}
    </View>
  );
}

function MissingClinicState({
  isLoading,
  isError,
  onRetry,
  onBack,
  backLabel,
}: {
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
  onBack: () => void;
  backLabel: string;
}): React.JSX.Element {
  const title = isLoading
    ? "Loading clinic context"
    : isError
      ? "Clinic context could not load"
      : "Clinic context unavailable";
  const body = isLoading
    ? "Preparing secure clinic context..."
    : isError
      ? "We couldn't load your clinic details. Check your connection and try again, or go back safely."
      : "Clinic details are required for voice capture, transcription review, and export. Try again or go back safely.";
  return (
    <View style={styles.loadingScreen}>
      <Text style={styles.loadingTitle}>{title}</Text>
      <Text style={styles.loadingText}>{body}</Text>
      <View style={styles.clinicStateActions}>
        <MeridianButton
          label={isLoading ? "Loading..." : "Try again"}
          onPress={onRetry}
          {...(isLoading ? { disabled: true } : {})}
          testID="clinic-context-retry-button"
        />
        <MeridianButton
          label={backLabel}
          variant="secondary"
          onPress={onBack}
          testID="clinic-context-back-button"
        />
      </View>
    </View>
  );
}

function AppShell(): React.JSX.Element {
  const { status, signIn, applyTokens } = useAuth();
  const profileQuery = useGetProfile();
  const [screen, setScreenRaw] = useState<ScreenKey>("patients");
  const setScreen = useCallback((next: ScreenKey) => {
    setScreenRaw(next);
  }, []);
  const [authScreen, setAuthScreen] = useState<AuthScreenKey>("sign-in");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verifyEmailBackTarget, setVerifyEmailBackTarget] =
    useState<VerifyEmailBackTarget>("sign-up");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [copyForwardDraft, setCopyForwardDraft] = useState<null | {
    token: string;
    scaffold: CopyForwardScaffold;
  }>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<TemplateKey | null>(null);
  const [selectedVoiceJobId, setSelectedVoiceJobId] = useState<string>("");
  const [selectedTranscriptText, setSelectedTranscriptText] = useState<string>("");
  const [soapGenerationRequest, setSoapGenerationRequest] = useState<null | {
    id: string;
    transcriptText: string;
  }>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>("");
  const [newAppointmentBackTarget, setNewAppointmentBackTarget] =
    useState<ScreenKey>("calendar");
  const [appointmentDetailBackTarget, setAppointmentDetailBackTarget] =
    useState<ScreenKey>("calendar");
  const [noteBackTarget, setNoteBackTarget] = useState<ScreenKey>("patients");
  const [priorSessionBackTarget, setPriorSessionBackTarget] =
    useState<ScreenKey>("patient-profile");
  const [noteEntryMode, setNoteEntryMode] = useState<ComposerEntryMode>("capture");
  const [auditReturnEntryMode, setAuditReturnEntryMode] =
    useState<ComposerEntryMode>("review");
  const [noteInitialSource, setNoteInitialSource] = useState<DocumentationSource>("ai");
  const [voiceCaptureBackTarget, setVoiceCaptureBackTarget] =
    useState<ScreenKey>("start-session");
  const [startSessionBackTarget, setStartSessionBackTarget] =
    useState<ScreenKey>("patients");
  const [templateEditorBackTarget, setTemplateEditorBackTarget] =
    useState<ScreenKey>("template-library");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedExportContext, setSelectedExportContext] = useState<null | {
    patientSummary: string;
    sections: {
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
    };
  }>(null);
  const [exportShareSourceScreen, setExportShareSourceScreen] = useState<ScreenKey>("note");
  const deleteRecording = useDeleteRecording();
  const clinicId = profileQuery.data?.clinicId ?? "";
  const voiceCaptureBackLabel =
    voiceCaptureBackTarget === "note" ? "Back to note" : "Back to session setup";
  const previousAuthStatus = useRef(status);
  const statusBar = (
    <StatusBar style="dark" backgroundColor={meridian.color.background} />
  );
  const retryClinicContext = useCallback(() => {
    void profileQuery.refetch();
  }, [profileQuery.refetch]);
  const clearVoiceDraftState = useCallback(() => {
    setSelectedVoiceJobId("");
    setSelectedTranscriptText("");
    setSoapGenerationRequest(null);
  }, []);
  const returnFromAudit = useCallback(() => {
    setNoteEntryMode(auditReturnEntryMode);
    setScreen("note");
  }, [auditReturnEntryMode, setScreen]);

  const navigateTo = useCallback((key: MeridianDestinationKey) => {
    if (key === "calendar") {
      setScreen("calendar");
    } else if (key === "patients") {
      setScreen("patients");
    } else if (key === "profile") {
      setScreen("settings");
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      previousAuthStatus.current = status;
      setScreen("patients");
      return;
    }

    if (status === "loading") {
      previousAuthStatus.current = status;
      return;
    }

    if (previousAuthStatus.current !== "unauthenticated") {
      queryClient.clear();
      clearOfflinePhiData();
    }
    previousAuthStatus.current = status;
    setScreen("patients");
    setAuthScreen("sign-in");
    setVerificationEmail("");
    setVerifyEmailBackTarget("sign-up");
    setSelectedPatientId("");
    setSelectedSessionId("");
    setCopyForwardDraft(null);
    setSelectedTemplateKey(null);
    setNoteInitialSource("ai");
    setSelectedVoiceJobId("");
    setSelectedTranscriptText("");
    setSelectedAppointmentId("");
    setSelectedExportContext(null);
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const backAction = () => {
      if (screen === "voice-capture") {
        if (clinicId) {
          return false;
        }
        setScreen(voiceCaptureBackTarget);
        return true;
      }
      if (screen === "transcript-review") {
        if (clinicId) {
          return false;
        }
        setScreen(voiceCaptureBackTarget);
        return true;
      }
      if (screen === "new-appointment") {
        setScreen(newAppointmentBackTarget);
        return true;
      }
      if (screen === "appointment-detail") {
        setScreen(appointmentDetailBackTarget);
        return true;
      }
      if (screen === "calendar") {
        setScreen("patients");
        return true;
      }
      if (screen === "export-share") {
        setScreen(exportShareSourceScreen);
        return true;
      }
      if (screen === "read-only-preview") {
        setScreen("patient-profile");
        return true;
      }
      if (screen === "note") {
        return false;
      }
      if (screen === "template-editor") {
        setScreen(templateEditorBackTarget);
        return true;
      }
      if (screen === "settings" || screen === "settings-password") {
        setScreen(screen === "settings-password" ? "settings" : "patients");
        return true;
      }
      if (screen === "start-session") {
        setScreen(startSessionBackTarget);
        return true;
      }
      if (screen === "template-library") {
        setScreen("start-session");
        return true;
      }
      if (screen === "prior-session") {
        setScreen(priorSessionBackTarget);
        return true;
      }
      if (screen === "audit") {
        returnFromAudit();
        return true;
      }
      if (screen === "patient-profile") {
        setScreen("patients");
        return true;
      }
      if (screen === "new-patient") {
        setScreen("patients");
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => subscription.remove();
  }, [status, screen, clinicId, exportShareSourceScreen, appointmentDetailBackTarget, newAppointmentBackTarget, noteBackTarget, priorSessionBackTarget, returnFromAudit, startSessionBackTarget, templateEditorBackTarget, voiceCaptureBackTarget]);

  useEffect(() => {
    if (status !== "unauthenticated") return;

    const backAction = () => {
      if (authScreen === "sign-up" || authScreen === "forgot-password") {
        setAuthScreen("sign-in");
        return true;
      }
      if (authScreen === "verify-email-otp") {
        setAuthScreen(verifyEmailBackTarget);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => subscription.remove();
  }, [authScreen, status, verifyEmailBackTarget]);

  if (status === "loading") {
    return (
      <>
        {statusBar}
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingTitle}>Physio Note Finisher</Text>
          <Text style={styles.loadingText}>Restoring local session...</Text>
        </View>
      </>
    );
  }

  if (status !== "authenticated") {
    return (
      <>
        {statusBar}
        <ScrollView contentContainerStyle={styles.authScreen} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Text style={styles.appTitle}>Physio Note Finisher</Text>
            <Text style={styles.appSubtitle}>Secure clinical documentation workspace.</Text>
          </View>

          {authScreen === "sign-in" ? (
            <View style={styles.authCardStack}>
              <SignInScreen
                onSubmit={async (values) => {
                  try {
                    await signIn(values.email, values.password);
                  } catch (error) {
                    if (isEmailVerificationRequiredError(error)) {
                      setVerificationEmail(error.details.email);
                      setVerifyEmailBackTarget("sign-in");
                      setAuthScreen("verify-email-otp");
                      return;
                    }
                    throw error;
                  }
                }}
                onForgotPassword={() => setAuthScreen("forgot-password")}
              />
              <MeridianButton
                label="Create Account"
                variant="secondary"
                onPress={() => setAuthScreen("sign-up")}
                testID="signin-create-account-button"
              />
            </View>
          ) : null}

          {authScreen === "sign-up" ? (
            <SignUpScreen
              onOtpRequired={(email) => {
                setVerificationEmail(email);
                setVerifyEmailBackTarget("sign-up");
                setAuthScreen("verify-email-otp");
              }}
              onBackToSignIn={() => setAuthScreen("sign-in")}
            />
          ) : null}

          {authScreen === "verify-email-otp" ? (
            <VerifyEmailOtpScreen
              email={verificationEmail}
              onVerified={(tokens) => applyTokens(tokens)}
              onBackToSignup={() => setAuthScreen(verifyEmailBackTarget)}
            />
          ) : null}

          {authScreen === "forgot-password" ? (
            <ForgotPasswordScreen
              onSuccess={() => setAuthScreen("sign-in")}
              onBack={() => setAuthScreen("sign-in")}
            />
          ) : null}
        </ScrollView>
      </>
    );
  }

  const currentDestination: MeridianDestinationKey =
    screen === "calendar" ||
    screen === "new-appointment" ||
    screen === "appointment-detail"
      ? "calendar"
      : screen === "settings" || screen === "settings-password"
        ? "profile"
        : "patients";

  const shellTitle =
    screen === "start-session"
        ? "Start New Session"
        : screen === "template-library"
          ? "Select Template"
          : screen === "template-editor"
            ? (selectedTemplateId ? "Edit Template" : "Create Template")
            : screen === "voice-capture"
            ? "Audio Capture"
            : screen === "transcript-review"
              ? "Review Transcription"
              : screen === "note"
                ? "Manual SOAP note"
                : screen === "settings"
                  ? "Clinical Settings"
                  : screen === "settings-password"
                    ? "Change Password"
                    : screen === "calendar"
                      ? "Clinical Calendar"
                      : screen === "new-appointment"
                        ? "New Appointment"
                        : screen === "appointment-detail"
                          ? "Appointment"
                          : "Physio Note Finisher";

  const isTaskFocusedScreen =
     screen === "start-session" ||
     screen === "template-library" ||
     screen === "voice-capture" ||
     screen === "transcript-review" ||
     screen === "note" ||
     screen === "new-appointment" ||
     screen === "appointment-detail" ||
     screen === "prior-session" ||
     screen === "audit" ||
     screen === "template-editor" ||
     screen === "settings-password" ||
     screen === "export-share" ||
     screen === "read-only-preview" ||
     screen === "new-patient";

  return (
    <>
      {statusBar}
      <MeridianProtectedShell
        title={shellTitle}
        currentDestination={currentDestination}
        onNavigate={navigateTo}
        showTopBar={false}
        showBottomNav={!isTaskFocusedScreen}
      >
        <View style={styles.content}>
        <ShellPanel active={screen === "calendar"} persist>
          <CalendarScreen
            isActive={screen === "calendar"}
            onOpenAppointment={(appointmentId) => {
              setSelectedAppointmentId(appointmentId);
              setAppointmentDetailBackTarget("calendar");
              setScreen("appointment-detail");
            }}
            onNewAppointment={() => {
              setSelectedPatientId("");
              setSelectedAppointmentId("");
              setNewAppointmentBackTarget("calendar");
              setScreen("new-appointment");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "new-appointment"}>
          <NewAppointmentScreen
            {...(selectedPatientId ? { prefillPatientId: selectedPatientId } : {})}
            onBack={() => setScreen(newAppointmentBackTarget)}
            onCreated={(appointmentId) => {
              setSelectedAppointmentId(appointmentId);
              setAppointmentDetailBackTarget(newAppointmentBackTarget);
              setScreen("appointment-detail");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "appointment-detail"}>
          <AppointmentDetailScreen
            appointmentId={selectedAppointmentId}
            onBack={() => setScreen(appointmentDetailBackTarget)}
            onStartSession={(patientId, sessionId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedSessionId(sessionId);
              setSelectedTemplateKey(null);
              setNoteEntryMode("capture");
              setNoteInitialSource("ai");
              setStartSessionBackTarget("appointment-detail");
              setScreen("start-session");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "patients"} persist>
          <PatientListScreen
            isActive={screen === "patients"}
            onAddPatient={() => {
              setSelectedSessionId("");
              setSelectedTemplateKey(null);
              setScreen("new-patient");
            }}
            onOpenPatient={(patientId) => {
              setSelectedPatientId(patientId);
              setSelectedSessionId("");
              setSelectedTemplateKey(null);
              setScreen("patient-profile");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "new-patient"}>
          <CreatePatientScreen
            onBack={() => setScreen("patients")}
            onCreated={(patientId) => {
              setSelectedPatientId(patientId);
              setSelectedSessionId("");
              setSelectedTemplateKey(null);
              setScreen("patient-profile");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "patient-profile"}>
          <PatientProfileScreen
            patientId={selectedPatientId}
            clinicId={clinicId}
            onBack={() => setScreen("patients")}
            onStartNewSession={(patientId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedSessionId("");
              setSelectedTemplateKey(null);
              setNoteEntryMode("capture");
              setNoteInitialSource("ai");
              setStartSessionBackTarget("patient-profile");
              setScreen("start-session");
            }}
            onOpenSession={(patientId, sessionId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedSessionId(sessionId);
              setSelectedTemplateKey(null);
              setNoteEntryMode("review");
              setNoteInitialSource("ai");
              setNoteBackTarget("patient-profile");
              setScreen("note");
            }}
            onOpenFinalizedRecord={(patientId, sessionId) => {
              setSelectedPatientId(patientId);
              setSelectedSessionId(sessionId);
              setScreen("read-only-preview");
            }}
            onCreateAppointment={(patientId) => {
              setSelectedPatientId(patientId);
              setSelectedAppointmentId("");
              setNewAppointmentBackTarget("patient-profile");
              setScreen("new-appointment");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "start-session"}>
          <StartSessionScreen
            patientId={selectedPatientId}
            onBack={() => setScreen(startSessionBackTarget)}
            onStartBlank={(patientId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedTemplateKey(null);
              setNoteEntryMode("capture");
              setNoteInitialSource("ai");
              setVoiceCaptureBackTarget("start-session");
              setScreen("voice-capture");
            }}
            onStartManual={(patientId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedTemplateKey(null);
              setNoteEntryMode("capture");
              setNoteInitialSource("manual");
              setNoteBackTarget("start-session");
              setScreen("note");
            }}
            onUseTemplate={(patientId, templateKey) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedTemplateKey(templateKey);
              setNoteEntryMode("review");
              setNoteInitialSource("template");
              setNoteBackTarget("start-session");
              setScreen("note");
            }}
            onOpenTemplateLibrary={(patientId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setScreen("template-library");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "template-library"}>
          <TemplateLibraryScreen
            patientId={selectedPatientId}
            onBack={() => setScreen("start-session")}
            onStartBlank={(patientId) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedTemplateKey(null);
              setNoteEntryMode("capture");
              setNoteInitialSource("ai");
              setNoteBackTarget("template-library");
              setScreen("note");
            }}
            onUseTemplate={(patientId, templateKey) => {
              clearVoiceDraftState();
              setSelectedPatientId(patientId);
              setSelectedTemplateKey(templateKey);
              setNoteEntryMode("review");
              setNoteInitialSource("template");
              setNoteBackTarget("template-library");
              setScreen("note");
            }}
            onAddTemplate={() => {
              setSelectedTemplateId("");
              setTemplateEditorBackTarget("template-library");
              setScreen("template-editor");
            }}
            onEditTemplate={(templateId) => {
              setSelectedTemplateId(templateId);
              setTemplateEditorBackTarget("template-library");
              setScreen("template-editor");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "template-editor"}>
          <TemplateEditorScreen
            templateId={selectedTemplateId || undefined}
            onBack={() => setScreen(templateEditorBackTarget)}
          />
        </ShellPanel>

        <ShellPanel active={screen === "voice-capture"}>
          {clinicId ? (
            <VoiceCaptureScreen
              clinicId={clinicId}
              patientId={selectedPatientId}
              onBack={() => setScreen(voiceCaptureBackTarget)}
              onUploadComplete={(result: VoiceUploadCompleteResponse) => {
                setSelectedVoiceJobId(result.transcriptionJobId ?? "");
                setSelectedTranscriptText("");
                setScreen("transcript-review");
              }}
            />
          ) : (
            <MissingClinicState
              isLoading={profileQuery.isLoading}
              isError={profileQuery.isError}
              onRetry={retryClinicContext}
              onBack={() => setScreen(voiceCaptureBackTarget)}
              backLabel={voiceCaptureBackLabel}
            />
          )}
        </ShellPanel>

        <ShellPanel active={screen === "transcript-review"}>
          {clinicId ? (
            <TranscriptReviewScreen
              clinicId={clinicId}
              jobId={selectedVoiceJobId}
              onBack={() => setScreen("voice-capture")}
              onGenerateSoap={(transcriptText) => {
                setSelectedTranscriptText(transcriptText);
                setSoapGenerationRequest({
                  id: `${selectedVoiceJobId}:${Date.now()}`,
                  transcriptText,
                });
                // After the voice workflow opens the note, Back should leave the
                // review flow rather than bounce back into the review screen.
                setNoteBackTarget("voice-capture");
                setNoteEntryMode("capture");
                setNoteInitialSource("ai");
                setScreen("note");
              }}
              onDeleteRecording={() => {
                deleteRecording
                  .mutateAsync({ jobId: selectedVoiceJobId })
                  .then(() => {
                    setSelectedVoiceJobId("");
                    setSelectedTranscriptText("");
                    setScreen("voice-capture");
                  })
                  .catch(() => {
                    // Error handled by hook
                  });
              }}
            />
          ) : (
            <MissingClinicState
              isLoading={profileQuery.isLoading}
              isError={profileQuery.isError}
              onRetry={retryClinicContext}
              onBack={() => setScreen(voiceCaptureBackTarget)}
              backLabel={voiceCaptureBackLabel}
            />
          )}
        </ShellPanel>

        <ShellPanel active={screen === "prior-session"}>
          <PriorSessionScreen
            patientId={selectedPatientId}
            sessionId={selectedSessionId}
            onBack={() => setScreen(priorSessionBackTarget)}
            onScaffoldReady={(scaffold) => {
              clearVoiceDraftState();
              setSelectedSessionId("");
              setCopyForwardDraft({
                token: `copy-forward:${Date.now()}`,
                scaffold,
              });
              setSelectedTemplateKey(null);
              setNoteEntryMode("review");
              setNoteInitialSource("ai");
              setNoteBackTarget("patient-profile");
              setScreen("note");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "note"}>
          <ManualSoapComposerScreen
            initialPatientId={selectedPatientId}
            initialSessionId={selectedSessionId}
            initialEntryMode={noteEntryMode}
            initialSource={noteInitialSource}
            initialTemplateKey={selectedTemplateKey}
            initialTranscriptText={selectedTranscriptText}
            {...(copyForwardDraft
              ? {
                  copyForwardScaffold: copyForwardDraft.scaffold,
                  copyForwardToken: copyForwardDraft.token,
                }
              : {})}
            {...(soapGenerationRequest ? { soapGenerationRequest } : {})}
            onCopyForwardScaffoldHandled={(token) => {
              setCopyForwardDraft((current) =>
                current?.token === token ? null : current,
              );
            }}
            onSoapGenerationRequestHandled={(requestId) => {
              setSoapGenerationRequest((current) =>
                current?.id === requestId ? null : current,
              );
            }}
            onBack={() => setScreen(noteBackTarget)}
            onStartVoiceCapture={() => {
              setNoteInitialSource(selectedTemplateKey ? "template" : "ai");
              setVoiceCaptureBackTarget("note");
              setScreen("voice-capture");
            }}
            onOpenExportShare={(input) => {
              setSelectedPatientId(input.patientId);
              setSelectedSessionId(input.sessionId);
              setSelectedExportContext({
                patientSummary: input.patientSummary,
                sections: input.sections,
              });
              setExportShareSourceScreen("note");
              setScreen("export-share");
            }}
            onViewHistory={(sessionId) => {
              setSelectedSessionId(sessionId);
              setAuditReturnEntryMode("finish");
              setScreen("audit");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "audit"}>
          <AuditHistoryScreen
            sessionId={selectedSessionId}
            onBack={returnFromAudit}
          />
        </ShellPanel>

        <ShellPanel active={screen === "read-only-preview"}>
          <ReadOnlyNotePreviewScreen
            patientId={selectedPatientId}
            sessionId={selectedSessionId}
            onBack={() => setScreen("patient-profile")}
            onCreateNewDraftFromSession={() => {
              clearVoiceDraftState();
              setPriorSessionBackTarget("read-only-preview");
              setScreen("prior-session");
            }}
            onOpenExportShare={(input) => {
              setSelectedPatientId(input.patientId);
              setSelectedSessionId(input.sessionId);
              setSelectedExportContext({
                patientSummary: input.patientSummary,
                sections: input.sections,
              });
              setExportShareSourceScreen("read-only-preview");
              setScreen("export-share");
            }}
          />
        </ShellPanel>

        <ShellPanel active={screen === "export-share"}>
          {clinicId ? (
            <ExportShareScreen
              patientId={selectedPatientId}
              sessionId={selectedSessionId}
              clinicId={clinicId}
              noteStatus="finalized"
              {...(selectedExportContext?.patientSummary
                ? { patientSummary: selectedExportContext.patientSummary }
                : {})}
              {...(selectedExportContext?.sections
                ? { sections: selectedExportContext.sections }
                : {})}
              onBack={() => setScreen(exportShareSourceScreen)}
            />
          ) : (
            <MissingClinicState
              isLoading={profileQuery.isLoading}
              isError={profileQuery.isError}
              onRetry={retryClinicContext}
              onBack={() => setScreen(exportShareSourceScreen)}
              backLabel={
                exportShareSourceScreen === "read-only-preview"
                  ? "Back to note preview"
                  : "Back to note"
              }
            />
          )}
        </ShellPanel>

        <ShellPanel active={screen === "settings"}>
          <ClinicalSettingsScreen
            onOpenPasswordChange={() => setScreen("settings-password")}
          />
        </ShellPanel>

        <ShellPanel active={screen === "settings-password"}>
          <PasswordChangeScreen onBack={() => setScreen("settings")} />
        </ShellPanel>
        <AppSyncOverlay />
        </View>
      </MeridianProtectedShell>
    </>
  );
}

export default function App(): React.JSX.Element {
  const sessionManager = useMemo(() => createSessionManager(), []);

  useEffect(() => {
    try {
      if (!SecureStore || typeof SecureStore.setItemAsync !== "function") {
        // eslint-disable-next-line no-console
        console.warn(
          "[App] SecureStore is not available. Session persistence will be degraded across app restarts.",
        );
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn(
        "[App] SecureStore initialization failed. Session persistence will be degraded across app restarts.",
      );
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <MeridianProvider>
            <AuthProvider sessionManager={sessionManager} secureStore={SecureStore}>
              <AppShell />
            </AuthProvider>
          </MeridianProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appScreen: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: meridian.color.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  loadingTitle: {
    color: meridian.color.text,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
  loadingText: {
    color: meridian.color.textSubtle,
    fontSize: 15,
    textAlign: "center",
  },
  clinicStateActions: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  authScreen: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
    backgroundColor: meridian.color.background,
  },
  authCardStack: {
    gap: 8,
  },
  brandBlock: {
    gap: 8,
    paddingTop: 12,
  },
  appTitle: {
    color: meridian.color.text,
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: 0,
  },
  appSubtitle: {
    color: meridian.color.textSubtle,
    fontSize: 15,
    lineHeight: 21,
  },
  content: {
    flex: 1,
  },
  panel: {
    flex: 1,
  },
  panelHidden: {
    display: "none",
  },
});
