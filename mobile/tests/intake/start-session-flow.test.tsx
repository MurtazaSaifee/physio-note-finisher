import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { BackHandler, Pressable, Text, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";

const reactNativeMocks = vi.hoisted(() => ({
  hardwareBackHandler: null as null | (() => boolean),
  hardwareBackHandlers: [] as Array<() => boolean>,
}));

type ShellDestination = "calendar" | "patients" | "profile";

const shellHarness = vi.hoisted(() => ({
  currentDestination: undefined as ShellDestination | undefined,
  onNavigate: undefined as ((key: ShellDestination) => void) | undefined,
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StatusBar: "StatusBar",
  useColorScheme: () => "light",
  ScrollView: "ScrollView",
  RefreshControl: "RefreshControl",
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data?: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
  }) => (
    <View testID="mock-flat-list">
      {ListHeaderComponent}
      {(data ?? []).map((item, index) => {
        const key =
          item && typeof item === "object" && "key" in item && typeof item.key === "string"
            ? item.key
            : item && typeof item === "object" && "id" in item && typeof item.id === "string"
              ? item.id
              : String(index);
        return <View key={key}>{renderItem({ item, index })}</View>;
      })}
    </View>
  ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      reactNativeMocks.hardwareBackHandlers.push(handler);
      reactNativeMocks.hardwareBackHandler = handler;
      return {
        remove: () => {
          reactNativeMocks.hardwareBackHandlers = reactNativeMocks.hardwareBackHandlers.filter(
            (registeredHandler) => registeredHandler !== handler,
          );
          reactNativeMocks.hardwareBackHandler = reactNativeMocks.hardwareBackHandlers.at(-1) ?? null;
        },
      };
    },
  },
  Share: {
    share: vi.fn(),
    sharedAction: "sharedAction",
    dismissedAction: "dismissedAction",
  },
}));

const hooks = vi.hoisted(() => ({
  patientList: {
    data: {
      items: [
        {
          id: "patient-1",
          fullName: "Ada Lovelace",
          dateOfBirth: null,
          sex: null,
          phone: "555-0101",
          email: null,
          addressLine: null,
          conditionTags: ["knee", "balance"],
          lastVisitDate: "2026-04-24T10:00:00.000Z",
          unfinishedNoteCount: 1,
          recentSessionStatus: "draft",
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-20T10:00:00.000Z",
          updatedAt: "2026-04-24T10:00:00.000Z",
        },
        {
          id: "patient-2",
          fullName: "Grace Hopper",
          dateOfBirth: null,
          sex: null,
          phone: "555-0102",
          email: null,
          addressLine: null,
          conditionTags: ["neck"],
          lastVisitDate: "2026-04-26T10:00:00.000Z",
          unfinishedNoteCount: 0,
          recentSessionStatus: "finalized",
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-20T10:00:00.000Z",
          updatedAt: "2026-04-26T10:00:00.000Z",
        },
        {
          id: "patient-3",
          fullName: "Margaret Hamilton",
          dateOfBirth: null,
          sex: null,
          phone: "555-0103",
          email: null,
          addressLine: null,
          conditionTags: ["spine"],
          lastVisitDate: null,
          unfinishedNoteCount: 0,
          recentSessionStatus: null,
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-20T10:00:00.000Z",
          updatedAt: "2026-04-20T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    },
    isLoading: false,
  },
  createPatient: {
    isPending: false,
    mutateAsync: vi.fn(async () => ({
      id: "patient-new",
      fullName: "New Patient",
      dateOfBirth: null,
      sex: null,
      phone: "555-0104",
      email: null,
      addressLine: null,
      conditionTags: ["ankle"],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-26T10:00:00.000Z",
      updatedAt: "2026-04-26T10:00:00.000Z",
    })),
  },
  patientProfile: {
    data: {
      id: "patient-1",
      fullName: "Ada Lovelace",
      dateOfBirth: null,
      sex: null,
      phone: "555-0101",
      email: null,
      addressLine: null,
      clinicalNotes: null,
      conditionTags: ["knee", "balance"],
      lastVisitDate: "2026-04-24T10:00:00.000Z",
      unfinishedNoteCount: 1,
      recentSessionStatus: "draft",
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-24T10:00:00.000Z",
    },
    isLoading: false,
  },
  templateQuery: {
    data: {
      suggestedTemplates: [
        {
          key: "knee",
          label: "Knee pain",
          category: "Knee",
          description: "Knee pain follow-up with swelling and load tolerance checks.",
          conditionTags: ["Knee"],
          sections: {
            subjective: "Subjective template",
            objective: "Objective template",
            assessment: "Assessment template",
            plan: "Plan template",
          },
        },
      ],
      recentTemplates: [
        {
          key: "post_op",
          label: "Post-operative rehab",
          category: "Post-op",
          description: "Post-op progress review.",
          conditionTags: ["Post-op"],
          sections: {
            subjective: "Recent subjective",
            objective: "Recent objective",
            assessment: "Recent assessment",
            plan: "Recent plan",
          },
        },
      ],
      templates: [
        {
          key: "knee",
          label: "Knee pain",
          category: "Knee",
          description: "Knee pain follow-up with swelling and load tolerance checks.",
          conditionTags: ["Knee"],
          sections: {
            subjective: "Subjective template",
            objective: "Objective template",
            assessment: "Assessment template",
            plan: "Plan template",
          },
        },
        {
          key: "balance_gait",
          label: "Balance and gait",
          category: "Balance/Gait",
          description: "Balance and gait progression.",
          conditionTags: ["Balance", "Gait"],
          sections: {
            subjective: "Balance subjective",
            objective: "Balance objective",
            assessment: "Balance assessment",
            plan: "Balance plan",
          },
        },
      ],
    },
    isLoading: false,
  },
  lastComposerProps: null as null | {
    initialPatientId?: string;
    initialSessionId?: string;
    initialTemplateKey?: string | null;
    initialTranscriptText?: string;
    initialEntryMode?: "capture" | "review" | "finish";
    initialSource?: "ai" | "voice" | "manual" | "template";
  },
  composerHardwareBackCalls: 0,
}));

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => hooks.patientList),
  useCreatePatient: vi.fn(() => hooks.createPatient),
  usePatientProfile: vi.fn(() => hooks.patientProfile),
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: vi.fn(() => hooks.templateQuery),
}));

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(() => ({
    status: "authenticated",
    signIn: vi.fn(),
    applyTokens: vi.fn(),
  })),
}));

vi.mock("../../features/auth/services/authApi", () => ({
  createAuthApi: vi.fn(() => ({})),
}));

vi.mock("../../features/auth/services/sessionManager", () => ({
  SessionManager: class {
    signIn = vi.fn();
    applyTokens = vi.fn();
    signOut = vi.fn();
    restoreSession = vi.fn(async () => "authenticated");
    runAuthenticatedRequest = vi.fn();
  },
}));

vi.mock("../../features/runtime/apiBaseUrl", () => ({
  resolveApiBaseUrl: vi.fn(() => "http://127.0.0.1:3000"),
}));

vi.mock("../../features/ui/meridian/MeridianProvider", () => ({
  MeridianProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../features/ui/meridian/shell", () => ({
  MeridianProtectedShell: ({
    children,
    currentDestination,
    onNavigate,
  }: {
    children: React.ReactNode;
    currentDestination: "calendar" | "patients" | "profile";
    onNavigate: (key: "calendar" | "patients" | "profile") => void;
  }) => {
    shellHarness.currentDestination = currentDestination;
    shellHarness.onNavigate = onNavigate;
    return <View>{children}</View>;
  },
}));

vi.mock("../../features/patients/screens/PatientListScreen", () => ({
  PatientListScreen: ({
    onOpenPatient,
  }: {
    onOpenPatient: (patientId: string) => void;
  }) => (
    <View>
      <Text>Patient List</Text>
      <Pressable
        accessibilityLabel="open-patient-profile"
        onPress={() => onOpenPatient("patient-1")}
      >
        <Text>Open patient</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/patients/screens/PatientProfileScreen", () => ({
  PatientProfileScreen: ({
    onBack,
    onStartNewSession,
    onOpenSession,
    onCreateAppointment,
  }: {
    onBack?: () => void;
    onStartNewSession?: (patientId: string) => void;
    onOpenSession?: (patientId: string, sessionId: string) => void;
    onCreateAppointment?: (patientId: string) => void;
  }) => (
    <View>
      <Text>Patient profile</Text>
      {onBack ? (
        <Pressable testID="patient-profile-back-button" onPress={onBack}>
          <Text>Back</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="patient-start-documentation"
        testID="patient-profile-new-session-button"
        onPress={() => onStartNewSession?.("patient-1")}
      >
        <Text>Start documentation</Text>
      </Pressable>
      <Pressable
        testID="patient-profile-resume-latest-draft-button"
        onPress={() => onOpenSession?.("patient-1", "session-1")}
      >
        <Text>Resume latest draft</Text>
      </Pressable>
      <Pressable testID="patient-profile-create-appointment-button" onPress={() => onCreateAppointment?.("patient-1")}>
        <Text>Schedule a visit</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/patients/screens/PriorSessionScreen", () => ({
  PriorSessionScreen: ({
    onScaffoldReady,
  }: {
    onScaffoldReady: () => void;
  }) => (
    <View>
      <Text>Prior Session</Text>
      <Pressable accessibilityLabel="open-note-from-prior" onPress={onScaffoldReady}>
        <Text>Open note</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/dashboard/screens/DashboardScreen", () => ({
  DashboardScreen: ({
    onOpenSession,
  }: {
    onOpenSession: (patientId: string, sessionId: string) => void;
  }) => (
    <Pressable
      testID="dashboard-open-session-button"
      onPress={() => onOpenSession("patient-1", "session-from-dashboard")}
    >
      <Text>Open session</Text>
    </Pressable>
  ),
}));

vi.mock("../../features/appointments/screens/CalendarScreen", () => ({
  CalendarScreen: ({ onOpenAppointment, onNewAppointment }: { onOpenAppointment: (appointmentId: string) => void; onNewAppointment: () => void }) => (
    <View>
      <Text>Calendar</Text>
      <Pressable testID="calendar-open-appointment-button" onPress={() => onOpenAppointment("appointment-1")}>
        <Text>Open appointment</Text>
      </Pressable>
      <Pressable testID="calendar-new-appointment-button" onPress={onNewAppointment}>
        <Text>New appointment</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/appointments/screens/AppointmentDetailScreen", () => ({
  AppointmentDetailScreen: ({ onBack, onStartSession }: { onBack: () => void; onStartSession: (patientId: string, sessionId: string) => void }) => (
    <View>
      <Text>Appointment detail</Text>
      <Pressable testID="appointment-detail-back-button" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
      <Pressable testID="appointment-detail-start-session-button" onPress={() => onStartSession("patient-1", "session-from-appointment")}>
        <Text>Start Session</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/appointments/screens/NewAppointmentScreen", () => ({
  NewAppointmentScreen: ({ onBack, onCreated }: { onBack: () => void; onCreated: (appointmentId: string) => void }) => (
    <View>
      <Text>New appointment</Text>
      <Pressable testID="new-appointment-back-button" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
      <Pressable testID="new-appointment-create-button" onPress={() => onCreated("appointment-new")}>
        <Text>Create appointment</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/intake/screens/TemplateLibraryScreen", () => ({
  TemplateLibraryScreen: ({
    onStartBlank,
    onUseTemplate,
  }: {
    onStartBlank: (patientId: string) => void;
    onUseTemplate: (patientId: string, templateKey: "knee" | "neck") => void;
  }) => (
    <View>
      <Text>Template Library</Text>
      <Pressable accessibilityLabel="View Library" onPress={() => undefined}>
        <Text>View Library</Text>
      </Pressable>
      <Pressable accessibilityLabel="template-use-neck" onPress={() => onUseTemplate("patient-1", "neck")}>
        <Text>Use template</Text>
      </Pressable>
      <Pressable accessibilityLabel="template-start-blank" onPress={() => onStartBlank("patient-1")}>
        <Text>Start blank</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/notes/screens/ManualSoapComposerScreen", () => ({
  ManualSoapComposerScreen: ({
    initialPatientId,
    initialSessionId,
    initialTemplateKey,
    initialTranscriptText,
    initialEntryMode,
    initialSource,
    onBack,
    onStartVoiceCapture,
    onViewHistory,
  }: {
    initialPatientId?: string;
    initialSessionId?: string;
    initialTemplateKey?: string | null;
    initialTranscriptText?: string;
    initialEntryMode?: "capture" | "review" | "finish";
    initialSource?: "ai" | "voice" | "manual" | "template";
    onBack?: () => void;
    onStartVoiceCapture?: () => void;
    onViewHistory?: (sessionId: string) => void;
  }) => {
    hooks.lastComposerProps = {
      initialPatientId,
      initialSessionId,
      initialTemplateKey,
      initialTranscriptText,
      initialEntryMode,
      initialSource,
    };
    React.useEffect(() => {
      if (!onBack) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        hooks.composerHardwareBackCalls += 1;
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [onBack]);
    return (
      <View>
        <Text>{initialEntryMode === "finish" ? "Final review" : "Manual SOAP note"}</Text>
        <Text>Subjective</Text>
        <Text>Objective</Text>
        <Text>Assessment</Text>
        <Text>Plan</Text>
        {onStartVoiceCapture ? (
          <Pressable testID="note-start-voice-capture-button" onPress={onStartVoiceCapture}>
            <Text>Start voice capture</Text>
          </Pressable>
        ) : null}
        {onBack ? (
          <Pressable
            accessibilityLabel="note-back"
            testID="note-back-button"
            onPress={onBack}
          >
            <Text>Back</Text>
          </Pressable>
        ) : null}
        {onViewHistory ? (
          <Pressable testID="note-view-history-button" onPress={() => onViewHistory(initialSessionId ?? "session-1")}>
            <Text>History</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
}));

vi.mock("../../features/voice/screens/VoiceCaptureScreen", () => ({
  VoiceCaptureScreen: ({
    onBack,
    onUploadComplete,
  }: {
    onBack?: () => void;
    onUploadComplete?: (result: { transcriptionJobId?: string }) => void;
  }) => (
    <View>
      <Text>Audio Capture</Text>
      <Pressable testID="voice-capture-back-button" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="complete-voice-upload"
        onPress={() => onUploadComplete?.({ transcriptionJobId: "job-1" })}
      >
        <Text>Stop & Process Note</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/voice/screens/TranscriptReviewScreen", () => ({
  TranscriptReviewScreen: ({ onGenerateSoap }: { onGenerateSoap: (text: string) => void }) => (
    <View>
      <Text>Review Transcription</Text>
      <Pressable accessibilityLabel="generate-soap-draft" onPress={() => onGenerateSoap("Transcript text")}>
        <Text>Generate SOAP Draft</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/audit/screens/AuditHistoryScreen", () => ({
  AuditHistoryScreen: ({ onBack }: { onBack: () => void }) => (
    <View>
      <Text>Audit history</Text>
      <Pressable testID="audit-back-button" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/exports/screens/ExportShareScreen", () => ({
  ExportShareScreen: () => (
    <View>
      <Text>Export Share</Text>
    </View>
  ),
}));

vi.mock("../../app/(auth)/sign-in", () => ({
  SignInScreen: () => <View />,
}));

vi.mock("../../app/(auth)/sign-up", () => ({
  SignUpScreen: () => <View />,
}));

vi.mock("../../app/(auth)/verify-email-otp", () => ({
  VerifyEmailOtpScreen: () => <View />,
}));

vi.mock("../../app/(auth)/forgot-password", () => ({
  ForgotPasswordScreen: () => <View />,
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
}));

vi.mock("../../app/(app)/settings", () => ({
  ClinicalSettingsScreen: () => <View />,
}));

vi.mock("../../app/(app)/settings/password", () => ({
  PasswordChangeScreen: () => <View />,
}));

vi.mock("../../features/settings/api/useGetProfile", () => ({
  useGetProfile: vi.fn(() => ({
    data: {
      id: "user-1",
      clinicId: "clinic-1",
      firstName: "Mira",
      lastName: "Shah",
      email: "mira@clinic.com",
      emailVerified: true,
      tokenVersion: 1,
      audioRetentionPeriod: "30d",
    },
    isLoading: false,
  })),
}));

import { SelectPatientScreen } from "../../features/intake/screens/SelectPatientScreen";
import { StartSessionScreen } from "../../features/intake/screens/StartSessionScreen";

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });

  if (!renderer) {
    throw new Error("Failed to render");
  }

  return renderer;
}

function collectText(
  node:
    | TestRenderer.ReactTestRendererJSON
    | TestRenderer.ReactTestRendererJSON[]
    | null,
): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  const children = node.children ?? [];
  return [
    typeof node === "string" ? node : "",
    ...children.map((child) =>
      typeof child === "string" ? child : collectText(child),
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

function indexOfOrFail(text: string, token: string): number {
  const index = text.indexOf(token);
  if (index < 0) {
    throw new Error(`Expected token "${token}" in rendered output.`);
  }

  return index;
}

function dispatchHardwareBack(): boolean {
  for (const handler of [...reactNativeMocks.hardwareBackHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

afterEach(() => {
  vi.clearAllMocks();
  hooks.lastComposerProps = null;
  hooks.composerHardwareBackCalls = 0;
  reactNativeMocks.hardwareBackHandler = null;
  reactNativeMocks.hardwareBackHandlers = [];
  shellHarness.currentDestination = undefined;
  shellHarness.onNavigate = undefined;
});

function navigateThroughShell(destination: "calendar" | "patients" | "profile") {
  if (!shellHarness.onNavigate) {
    throw new Error("App did not pass a shell navigation callback.");
  }

  shellHarness.onNavigate(destination);
}

describe("intake start-session flow", () => {
  it("renders Select Patient in required order and recent patients by lastVisitDate descending", async () => {
    const onPatientSelected = vi.fn();
    const renderer = await render(
      <SelectPatientScreen
        onBack={() => undefined}
        onPatientSelected={onPatientSelected}
      />,
    );

    const content = collectText(renderer.toJSON());
    expect(renderer.root.findAllByProps({ testID: "mock-flat-list" })).toHaveLength(0);
    expect(content).toContain("Add patient");
    expect(content).toContain("Recent Patients");
    expect(content).toContain("A-Z");

    const textInputs = renderer.root.findAllByType("TextInput");
    expect(textInputs[0]?.props.placeholder).toBe("Search by name or contact");

    const addIdx = indexOfOrFail(content, "Add patient");
    const recentIdx = indexOfOrFail(content, "Recent Patients");
    const alphaIdx = indexOfOrFail(content, "A-Z");
    expect(addIdx).toBeLessThan(recentIdx);
    expect(recentIdx).toBeLessThan(alphaIdx);

    const openRecentButtons = renderer.root.findAllByProps({
      accessibilityLabel: "Open recent patient",
    });
    expect(openRecentButtons).toHaveLength(2);

    const recentNames = openRecentButtons.map((node) =>
      String(node.props["data-patient-name"]),
    );
    expect(recentNames).toEqual(["Grace Hopper", "Ada Lovelace"]);
    expect(recentNames).not.toContain("Margaret Hamilton");
  });

  it("selects an existing patient and calls onPatientSelected", async () => {
    const onPatientSelected = vi.fn();
    const renderer = await render(
      <SelectPatientScreen
        onBack={() => undefined}
        onPatientSelected={onPatientSelected}
      />,
    );

    const existingPatientButton = renderer.root.findByProps({
      accessibilityLabel: "Open recent patient",
      "data-patient-id": "patient-1",
    });

    await act(async () => {
      existingPatientButton.props.onPress();
      await Promise.resolve();
    });

    expect(onPatientSelected).toHaveBeenCalledWith("patient-1");
  });

  it("adds a patient and selects the newly created id", async () => {
    const onPatientSelected = vi.fn();
    const renderer = await render(
      <SelectPatientScreen
        onBack={() => undefined}
        onPatientSelected={onPatientSelected}
      />,
    );

    const addPatientButton = renderer.root.findByProps({
      accessibilityLabel: "Add New Patient",
    });

    await act(async () => {
      addPatientButton.props.onPress();
      await Promise.resolve();
    });

    const revealedAddPatientButton = renderer.root.findByProps({
      accessibilityLabel: "Add New Patient",
    });

    const textInputs = renderer.root.findAllByType("TextInput");
    const fullNameInput = textInputs.find(
      (node) => node.props.placeholder === "Full name",
    );
    const phoneInput = textInputs.find(
      (node) => node.props.placeholder === "Phone",
    );
    const conditionTagsInput = textInputs.find(
      (node) => node.props.placeholder === "Condition tags",
    );
    expect(fullNameInput).toBeTruthy();
    expect(phoneInput).toBeTruthy();
    expect(conditionTagsInput).toBeTruthy();

    await act(async () => {
      fullNameInput?.props.onChangeText("New Patient");
      phoneInput?.props.onChangeText("555-0104");
      conditionTagsInput?.props.onChangeText("ankle, rehab");
      await Promise.resolve();
    });

    await act(async () => {
      await revealedAddPatientButton.props.onPress();
    });

    expect(hooks.createPatient.mutateAsync).toHaveBeenCalledWith({
      fullName: "New Patient",
      phone: "555-0104",
      conditionTags: ["ankle", "rehab"],
    });
    expect(onPatientSelected).toHaveBeenCalledWith("patient-new");
  });

  it("renders Start New Session with known patient context and template actions", async () => {
    const renderer = await render(
      <StartSessionScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={() => undefined}
        onStartManual={() => undefined}
        onUseTemplate={() => undefined}
        onOpenTemplateLibrary={() => undefined}
      />,
    );

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Voice recap");
    expect(content).toContain("Write manually");
    expect(content).toContain("Use a Template");
    expect(content).toContain("View Library");
    expect(content).toContain("Ada Lovelace");
    expect(content).not.toContain("ID:");
    expect(content).not.toContain("patient-1");
  });

  it("uses the visible template card directly instead of bouncing to the template library", async () => {
    const onUseTemplate = vi.fn();
    const onOpenTemplateLibrary = vi.fn();
    const renderer = await render(
      <StartSessionScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={() => undefined}
        onStartManual={() => undefined}
        onUseTemplate={onUseTemplate}
        onOpenTemplateLibrary={onOpenTemplateLibrary}
      />,
    );

    const templateCard = renderer.root.findByProps({
      testID: "start-session-template-0-card",
    });

    await act(async () => {
      templateCard.props.onPress();
      await Promise.resolve();
    });

    expect(onUseTemplate).toHaveBeenCalledWith("patient-1", "knee");
    expect(onOpenTemplateLibrary).not.toHaveBeenCalled();
  });

  it("does not create a session until Voice recap or Write manually is chosen", async () => {
    const onStartBlank = vi.fn();
    const onStartManual = vi.fn();
    const renderer = await render(
      <StartSessionScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={onStartBlank}
        onStartManual={onStartManual}
        onUseTemplate={() => undefined}
        onOpenTemplateLibrary={() => undefined}
      />,
    );

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Voice recap");
    expect(content).toContain("Write manually");
    expect(content).not.toContain("Start Fresh / Blank Note");
    expect(onStartBlank).not.toHaveBeenCalled();

    const voiceRecapButton = renderer.root.findByProps({
      testID: "start-session-voice-recap-button",
    });
    const writeManuallyButton = renderer.root.findByProps({
      testID: "start-session-write-manually-button",
    });

    await act(async () => {
      writeManuallyButton.props.onPress();
      await Promise.resolve();
    });

    expect(onStartManual).toHaveBeenCalledWith("patient-1");

    await act(async () => {
      voiceRecapButton.props.onPress();
      await Promise.resolve();
    });

    expect(onStartBlank).toHaveBeenCalledWith("patient-1");
  });

  it("opens the authenticated shell on Patients", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Patient List");
    expect(content).not.toContain("Sessions");
    expect(content).not.toContain("Clinical Dashboard");
    expect(shellHarness.currentDestination).toBe("patients");
  });

  it("returns patient-profile appointment creation to the profile with visible and Android Back", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-create-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patient profile");

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-create-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patient profile");

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-create-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-create-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "appointment-detail-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patient profile");

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-create-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-create-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patient profile");
  });

  it("keeps calendar appointment creation returning to Calendar", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-new-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Calendar");

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-new-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Calendar");

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-new-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-create-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "appointment-detail-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Calendar");

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-new-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "new-appointment-create-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Calendar");
  });

  it("restores final review after history through visible and Android Back", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: "patient-profile-resume-latest-draft-button" })
        .props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-view-history-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "audit-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(hooks.lastComposerProps?.initialEntryMode).toBe("finish");
    expect(collectText(renderer.toJSON())).toContain("Final review");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-view-history-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(hooks.lastComposerProps?.initialEntryMode).toBe("finish");
    expect(collectText(renderer.toJSON())).toContain("Final review");
  });

  it("routes an appointment-linked session through Start Session without losing its session id", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-open-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "appointment-detail-start-session-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: "start-session-write-manually-button" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-write-manually-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialSessionId: "session-from-appointment",
      initialEntryMode: "capture",
      initialSource: "manual",
    });
  });

  it("preserves an appointment-linked session when a template is chosen from Template Library", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-open-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "appointment-detail-start-session-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-view-library-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "template-use-neck" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialSessionId: "session-from-appointment",
      initialTemplateKey: "neck",
      initialEntryMode: "review",
      initialSource: "template",
    });
  });

  it("preserves an appointment-linked session when a blank note is chosen from Template Library", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-open-appointment-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "appointment-detail-start-session-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-view-library-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "template-start-blank" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialSessionId: "session-from-appointment",
      initialTemplateKey: null,
      initialEntryMode: "capture",
      initialSource: "ai",
    });
  });

  it("opens Start Session from a patient profile before choosing documentation mode", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("patients");
      await Promise.resolve();
    });
    expect(shellHarness.currentDestination).toBe("patients");

    renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-new-session-button" }).props.onPress();
      await Promise.resolve();
    });

    renderer.root.findByProps({ testID: "start-session-write-manually-button" });
    expect(hooks.lastComposerProps).toBeNull();

    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-write-manually-button" }).props.onPress();
      await Promise.resolve();
    });

    renderer.root.findByProps({ testID: "note-back-button" });
    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialEntryMode: "capture",
      initialSource: "manual",
    });

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });

    expect(hooks.composerHardwareBackCalls).toBe(1);
    expect(collectText(renderer.toJSON())).toContain("Start Session");
    renderer.root.findByProps({ testID: "start-session-back-button" });

    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-back-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Patient profile");
  });

  it("returns from manual-origin voice capture with the default AI source", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("patients");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-new-session-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-write-manually-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps?.initialSource).toBe("manual");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-start-voice-capture-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "voice-capture-back-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps?.initialSource).toBe("ai");
  });

  it("resumes a draft session directly in the editable composer", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("patients");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root
        .findByProps({ testID: "patient-profile-resume-latest-draft-button" })
        .props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Manual SOAP note");
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patient profile");
  });

  it("opens a saved draft in review", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("patients");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: "patient-profile-resume-latest-draft-button" })
        .props.onPress();
      await Promise.resolve();
    });
    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialSessionId: "session-1",
      initialEntryMode: "review",
      initialTranscriptText: "",
    });
  });

  it("clears a previously selected template when resuming a saved draft from the profile", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-new-session-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-template-0-card" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps?.initialTemplateKey).toBe("knee");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "start-session-back-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: "patient-profile-resume-latest-draft-button" })
        .props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps).toMatchObject({
      initialPatientId: "patient-1",
      initialSessionId: "session-1",
      initialTemplateKey: null,
      initialEntryMode: "review",
    });
  });

  it("keeps the composer closed until a patient selects a documentation mode", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("patients");
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "open-patient-profile" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-new-session-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(hooks.lastComposerProps).toBeNull();
    expect(renderer.root.findByProps({ testID: "start-session-write-manually-button" })).toBeTruthy();
  });

});
