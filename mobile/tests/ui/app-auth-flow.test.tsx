import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { BackHandler, Pressable, Text, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  status: "unauthenticated" as "authenticated" | "unauthenticated" | "loading",
  backHandler: undefined as (() => boolean) | undefined,
  backHandlers: [] as Array<() => boolean>,
  signIn: vi.fn(),
}));

const shellHarness = vi.hoisted(() => ({
  currentDestination: undefined as string | undefined,
  onNavigate: undefined as ((key: string) => void) | undefined,
  showBottomNav: undefined as boolean | undefined,
}));

const profileHarness = vi.hoisted(() => ({
  data: { clinicId: "clinic-test" } as { clinicId: string } | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
}));

const voiceHarness = vi.hoisted(() => ({
  onUploadComplete: undefined as
    | ((result: { transcriptionJobId?: string }) => void)
    | undefined,
}));

const transcriptHarness = vi.hoisted(() => ({
  childBackCalls: 0,
  unsavedBackCalls: 0,
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFillObject: {},
  },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      authState.backHandlers.push(handler);
      authState.backHandler = handler;
      return {
        remove: () => {
          authState.backHandlers = authState.backHandlers.filter(
            (registeredHandler) => registeredHandler !== handler,
          );
          authState.backHandler = authState.backHandlers.at(-1);
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

vi.mock("expo-status-bar", () => ({
  StatusBar: "StatusBar",
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(),
}));

vi.mock("../../features/ui/meridian/MeridianProvider", () => ({
  MeridianProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../features/ui/meridian/primitives", () => ({
  MeridianButton: ({
    label,
    onPress,
    testID,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    testID?: string;
    disabled?: boolean;
  }) => (
    <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} testID={testID}>
      <Text>{label}</Text>
    </Pressable>
  ),
  MeridianCard: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  MeridianInput: (props: Record<string, unknown>) => <View {...props} />,
}));

vi.mock("../../features/ui/meridian/shell", () => ({
  MeridianProtectedShell: ({
    children,
    currentDestination,
    onNavigate,
    showBottomNav,
  }: {
    children: React.ReactNode;
    currentDestination?: string;
    onNavigate?: (key: string) => void;
    showBottomNav?: boolean;
  }) => {
    shellHarness.currentDestination = currentDestination;
    shellHarness.onNavigate = onNavigate;
    shellHarness.showBottomNav = showBottomNav;
    return <View>{children}</View>;
  },
}));

vi.mock("../../features/offline/components/AppSyncOverlay", () => ({
  AppSyncOverlay: () => <View testID="app-sync-overlay" />,
}));

vi.mock("../../features/settings/api/useGetProfile", () => ({
  useGetProfile: vi.fn(() => profileHarness),
}));

vi.mock("../../features/runtime/apiBaseUrl", () => ({
  resolveApiBaseUrl: vi.fn(() => "http://127.0.0.1:3000"),
  describeBackendConnection: vi.fn(() => "local backend"),
}));

vi.mock("../../features/auth/services/authApi", () => ({
  createAuthApi: vi.fn(() => ({})),
  isEmailVerificationRequiredError: (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      "details" in error &&
      (error as { details?: { error?: string } }).details?.error ===
        "email_verification_required",
    ),
}));

vi.mock("../../features/auth/services/sessionManager", () => ({
  SessionManager: class {
    signIn = vi.fn();
    applyTokens = vi.fn();
    signOut = vi.fn();
    restoreSession = vi.fn(async () => "unauthenticated");
    runAuthenticatedRequest = vi.fn();
  },
}));

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(() => ({
    status: authState.status,
    signIn: authState.signIn,
    applyTokens: vi.fn(),
    signOut: vi.fn(),
    runProtectedAction: vi.fn(),
  })),
}));

vi.mock("../../app/(auth)/sign-in", () => ({
  SignInScreen: ({
    onSubmit,
    onForgotPassword,
  }: {
    onSubmit: (values: { email: string; password: string }) => Promise<void>;
    onForgotPassword: () => void;
  }) => (
    <View>
      <Pressable
        testID="test-signin-submit"
        onPress={() => void onSubmit({ email: "unverified@example.com", password: "password123" })}
      >
        <Text>Sign In Screen</Text>
      </Pressable>
      <Pressable testID="test-open-forgot-password" onPress={onForgotPassword}>
        <Text>Forgot Password</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../app/(auth)/sign-up", () => ({
  SignUpScreen: ({
    onOtpRequired,
    onBackToSignIn,
  }: {
    onOtpRequired: (email: string) => void;
    onBackToSignIn: () => void;
  }) => (
    <View>
      <Text>Sign Up Screen</Text>
      <Pressable testID="test-signup-back" onPress={onBackToSignIn}>
        <Text>Back to Sign In</Text>
      </Pressable>
      <Pressable testID="test-signup-open-verify" onPress={() => onOtpRequired("new@example.com")}>
        <Text>Verify Email</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../app/(auth)/verify-email-otp", () => ({
  VerifyEmailOtpScreen: ({
    onBackToSignup,
  }: {
    onBackToSignup: () => void;
  }) => (
    <View>
      <Text>Verify Email Screen</Text>
      <Pressable accessibilityLabel="verify-email-back" onPress={onBackToSignup}>
        <Text>Back</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../app/(auth)/forgot-password", () => ({
  ForgotPasswordScreen: ({ onBack }: { onBack: () => void }) => (
    <View>
      <Text>Forgot Password Screen</Text>
      <Pressable testID="test-forgot-password-back" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../app/(app)/settings", () => ({
  ClinicalSettingsScreen: () => <View />,
}));

vi.mock("../../app/(app)/settings/password", () => ({
  PasswordChangeScreen: () => <View />,
}));

vi.mock("../../features/dashboard/screens/DashboardScreen", () => ({
  DashboardScreen: ({ isActive }: { isActive: boolean }) =>
    isActive ? <Text>Dashboard active</Text> : <View />,
}));

vi.mock("../../features/patients/screens/PatientListScreen", () => ({
  PatientListScreen: ({
    isActive,
    onAddPatient,
    onOpenPatient,
  }: {
    isActive: boolean;
    onAddPatient: () => void;
    onOpenPatient: (patientId: string) => void;
  }) =>
    isActive ? (
      <View>
        <Text>Patients screen</Text>
        <Pressable testID="test-open-patient" onPress={() => onOpenPatient("patient-test")}>
          <Text>Open patient</Text>
        </Pressable>
        <Pressable testID="test-open-create-patient" onPress={onAddPatient}>
          <Text>Add patient</Text>
        </Pressable>
      </View>
    ) : (
      <View />
    ),
}));

vi.mock("../../features/patients/screens/PatientProfileScreen", () => ({
  PatientProfileScreen: ({
    patientId,
    onStartNewSession,
    onOpenFinalizedRecord,
  }: {
    patientId: string;
    onStartNewSession: (patientId: string) => void;
    onOpenFinalizedRecord: (patientId: string, sessionId: string) => void;
  }) => (
    <View testID="test-patient-profile" patientId={patientId}>
      <Pressable testID="test-start-session" onPress={() => onStartNewSession("patient-test")}>
        <Text>Start session</Text>
      </Pressable>
      <Pressable
        testID="test-open-finalized-record"
        onPress={() => onOpenFinalizedRecord("patient-test", "session-finalized")}
      >
        <Text>Open finalized record</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/patients/screens/CreatePatientScreen", () => ({
  CreatePatientScreen: ({
    onBack,
    onCreated,
  }: {
    onBack: () => void;
    onCreated: (patientId: string) => void;
  }) => (
    <View>
      <Text>Create patient screen</Text>
      <Pressable testID="test-create-patient-back" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
      <Pressable testID="test-create-patient-success" onPress={() => onCreated("patient-created")}>
        <Text>Save</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/patients/screens/PriorSessionScreen", () => ({
  PriorSessionScreen: ({
    patientId,
    sessionId,
    onBack,
    onScaffoldReady,
  }: {
    patientId: string;
    sessionId: string;
    onBack: () => void;
    onScaffoldReady: (scaffold: {
      patientId: string;
      sourceSessionId: string;
      selectedSections: Array<"priorPlan" | "carryForwardContext">;
      priorPlan: string | null;
      carryForwardContext: string | null;
      sourceSessionDate: string;
    }) => void;
  }) => (
    <View testID="test-prior-session" patientId={patientId} sessionId={sessionId}>
      <Text>Prior session screen</Text>
      <Pressable testID="test-prior-session-back" onPress={onBack}>
        <Text>Back</Text>
      </Pressable>
      <Pressable
        testID="test-prior-session-copy-forward"
        onPress={() => onScaffoldReady({
          patientId: "patient-test",
          sourceSessionId: "session-finalized",
          selectedSections: ["priorPlan", "carryForwardContext"],
          priorPlan: "Continue progressive loading.",
          carryForwardContext: "Review tolerance after the last visit.",
          sourceSessionDate: "2026-04-17T12:34:56.000Z",
        })}
      >
        <Text>Copy forward</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/intake/screens/SelectPatientScreen", () => ({
  SelectPatientScreen: () => <View />,
}));

vi.mock("../../features/intake/screens/StartSessionScreen", () => ({
  StartSessionScreen: ({
    onStartBlank,
    onUseTemplate,
  }: {
    onStartBlank: (patientId: string) => void;
    onUseTemplate: (patientId: string, templateKey: string) => void;
  }) => (
    <View>
      <Text>Start session screen</Text>
      <Pressable
        testID="test-open-voice-capture"
        onPress={() => onStartBlank("patient-test")}
      >
        <Text>Open voice capture</Text>
      </Pressable>
      <Pressable
        testID="test-open-note"
        onPress={() => onUseTemplate("patient-test", "general")}
      >
        <Text>Open note</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/intake/screens/TemplateLibraryScreen", () => ({
  TemplateLibraryScreen: () => <View />,
}));

vi.mock("../../features/appointments/screens/CalendarScreen", () => ({
  CalendarScreen: ({ isActive }: { isActive: boolean }) =>
    isActive ? <Text>Calendar screen</Text> : <View />,
}));

vi.mock("../../features/voice/screens/VoiceCaptureScreen", () => ({
  VoiceCaptureScreen: ({
    onUploadComplete,
  }: {
    onUploadComplete: (result: { transcriptionJobId?: string }) => void;
  }) => {
    voiceHarness.onUploadComplete = onUploadComplete;
    return <Text>Voice capture screen</Text>;
  },
}));

vi.mock("../../features/voice/screens/TranscriptReviewScreen", () => ({
  TranscriptReviewScreen: ({ onBack }: { onBack: () => void }) => {
    const [hasUnsavedEdit, setHasUnsavedEdit] = React.useState(false);

    React.useEffect(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (hasUnsavedEdit) {
          transcriptHarness.unsavedBackCalls += 1;
          return true;
        }
        transcriptHarness.childBackCalls += 1;
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [hasUnsavedEdit, onBack]);

    return (
      <View>
        <Text>Transcript review screen</Text>
        <Pressable testID="test-transcript-edit" onPress={() => setHasUnsavedEdit(true)}>
          <Text>Edit transcript</Text>
        </Pressable>
        {hasUnsavedEdit ? <Text>Unsaved transcript edit</Text> : null}
      </View>
    );
  },
}));

vi.mock("../../features/notes/screens/ManualSoapComposerScreen", () => ({
  ManualSoapComposerScreen: ({
    initialSessionId,
    copyForwardScaffold,
    onOpenExportShare,
    onStartVoiceCapture,
  }: {
    initialSessionId?: string;
    copyForwardScaffold?: { sourceSessionId: string };
    onOpenExportShare: (input: {
      patientId: string;
      sessionId: string;
      patientSummary: string;
      sections: {
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
      };
    }) => void;
    onStartVoiceCapture?: () => void;
  }) => (
    <View
      testID="test-manual-soap"
      initialSessionId={initialSessionId}
      copyForwardSourceSessionId={copyForwardScaffold?.sourceSessionId}
    >
      <Text>Manual SOAP screen</Text>
      <Pressable testID="test-open-voice-capture" onPress={onStartVoiceCapture}>
        <Text>Open voice capture</Text>
      </Pressable>
      <Pressable
        testID="test-open-export"
        onPress={() =>
          onOpenExportShare({
            patientId: "patient-test",
            sessionId: "session-test",
            patientSummary: "Summary",
            sections: {
              subjective: "Subjective",
              objective: "Objective",
              assessment: "Assessment",
              plan: "Plan",
            },
          })
        }
      >
        <Text>Open export</Text>
      </Pressable>
    </View>
  ),
}));

vi.mock("../../features/exports/screens/ExportShareScreen", () => ({
  ExportShareScreen: () => <Text>Export screen</Text>,
}));

vi.mock("../../features/exports/screens/ReadOnlyNotePreviewScreen", () => ({
  ReadOnlyNotePreviewScreen: ({
    patientId,
    sessionId,
    onCreateNewDraftFromSession,
  }: {
    patientId: string;
    sessionId: string;
    onCreateNewDraftFromSession: () => void;
  }) => (
    <View testID="test-read-only-preview" patientId={patientId} sessionId={sessionId}>
      <Pressable testID="test-create-draft-from-finalized" onPress={onCreateNewDraftFromSession}>
        <Text>Create new draft from this session</Text>
      </Pressable>
    </View>
  ),
}));

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
  return children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .filter(Boolean)
    .join(" ");
}

afterEach(() => {
  authState.status = "unauthenticated";
  authState.backHandler = undefined;
  authState.backHandlers = [];
  shellHarness.currentDestination = undefined;
  shellHarness.onNavigate = undefined;
  shellHarness.showBottomNav = undefined;
  profileHarness.data = { clinicId: "clinic-test" };
  profileHarness.isLoading = false;
  profileHarness.isError = false;
  voiceHarness.onUploadComplete = undefined;
  transcriptHarness.childBackCalls = 0;
  transcriptHarness.unsavedBackCalls = 0;
  authState.signIn.mockReset();
  vi.clearAllMocks();
});

function navigateThroughShell(destination: string) {
  if (!shellHarness.onNavigate) {
    throw new Error("App did not pass a shell navigation callback.");
  }

  shellHarness.onNavigate(destination);
}

function dispatchHardwareBack(): boolean {
  for (const handler of [...authState.backHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

describe("App auth flow", () => {
  it("routes a verified-credential email verification requirement to OTP verification", async () => {
    authState.signIn.mockRejectedValue({
      status: 403,
      details: {
        error: "email_verification_required",
        email: "unverified@example.com",
        otpRequired: true,
      },
    });
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-signin-submit" }).props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Verify Email Screen");
  });

  it("uses dark status-bar icons across loading, auth, and app surfaces", async () => {
    const { default: App } = await import("../../App");

    for (const status of ["loading", "unauthenticated", "authenticated"] as const) {
      authState.status = status;
      const renderer = await render(<App />);
      const statusBar = renderer.root.findAll((node) => node.type === "StatusBar")[0];

      expect(statusBar?.props.style).toBe("dark");
      expect(statusBar?.props.backgroundColor).toBe("#F6F4EF");
      await act(async () => {
        renderer.unmount();
      });
    }
  });

  it("does not expose development credentials or backend details in auth", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    const content = collectText(renderer.toJSON());
    expect(content).not.toMatch(/Dev clinician|clinician@example\.com|password123|Backend:/i);
  });

  it("keeps the auth shell scrollable and keyboard-safe", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);
    const authScrollView = renderer.root.findAll((node) => node.type === "ScrollView")[0];

    expect(authScrollView?.props.keyboardShouldPersistTaps).toBe("handled");
    expect(authScrollView?.props.contentContainerStyle).toMatchObject({ flexGrow: 1 });
  });

  it("shows sign-in without a login-triggered verification branch", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Sign In Screen");
    expect(content).not.toContain("Verify Email Screen");
    expect(content).not.toContain("Sign Up Screen");
  });

  it("makes Android Back match the visible sign-up, verification, and password-reset returns", async () => {
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "signin-create-account-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign Up Screen");
    await act(async () => {
      renderer.root.findByProps({ testID: "test-signup-back" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign In Screen");

    await act(async () => {
      renderer.root.findByProps({ testID: "signin-create-account-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(authState.backHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign In Screen");

    await act(async () => {
      renderer.root.findByProps({ testID: "signin-create-account-button" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-signup-open-verify" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Verify Email Screen");
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "verify-email-back" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign Up Screen");

    await act(async () => {
      renderer.root.findByProps({ testID: "test-signup-open-verify" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(authState.backHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign Up Screen");

    await act(async () => {
      renderer.root.findByProps({ testID: "test-signup-back" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-forgot-password" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Forgot Password Screen");
    await act(async () => {
      renderer.root.findByProps({ testID: "test-forgot-password-back" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign In Screen");

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-forgot-password" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      expect(authState.backHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Sign In Screen");
  });

  it("opens authenticated AppShell on Patients", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Patients screen");
    expect(shellHarness.currentDestination).toBe("patients");
    expect(content).not.toContain("Sessions");
    expect(renderer.root.findByProps({ testID: "app-sync-overlay" })).toBeTruthy();
  });

  it("treats patient creation as a task and routes Android Back and success correctly", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-create-patient" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Create patient screen");
    expect(shellHarness.showBottomNav).toBe(false);

    await act(async () => {
      authState.backHandler?.();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Patients screen");
    expect(shellHarness.showBottomNav).toBe(true);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-create-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-create-patient-success" }).props.onPress();
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "test-patient-profile" }).props.patientId).toBe("patient-created");
  });

  it("keeps sync feedback mounted when moving away from Patients", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Calendar screen");
    expect(renderer.root.findByProps({ testID: "app-sync-overlay" })).toBeTruthy();
  });

  it("keeps the Patients destination while the SOAP note editor is active", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-start-session" }).props.onPress();
      await Promise.resolve();
    });
    expect(shellHarness.currentDestination).toBe("patients");
  });

  it("routes a finalized record into selective carry-forward for a new draft", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-finalized-record" }).props.onPress();
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "test-read-only-preview" }).props.sessionId)
      .toBe("session-finalized");

    await act(async () => {
      renderer.root.findByProps({ testID: "test-create-draft-from-finalized" }).props.onPress();
      await Promise.resolve();
    });

    const priorSession = renderer.root.findByProps({ testID: "test-prior-session" });
    expect(priorSession.props.patientId).toBe("patient-test");
    expect(priorSession.props.sessionId).toBe("session-finalized");

    await act(async () => {
      renderer.root.findByProps({ testID: "test-prior-session-back" }).props.onPress();
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "test-read-only-preview" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "test-create-draft-from-finalized" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      authState.backHandler?.();
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "test-read-only-preview" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "test-create-draft-from-finalized" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-prior-session-copy-forward" }).props.onPress();
      await Promise.resolve();
    });
    const note = renderer.root.findByProps({ testID: "test-manual-soap" });
    expect(note.props.initialSessionId).toBe("");
    expect(note.props.copyForwardSourceSessionId).toBe("session-finalized");
  });

  it("offers retry and safe recovery for missing clinic context in voice, transcript, and export flows", async () => {
    authState.status = "authenticated";
    profileHarness.data = undefined;
    profileHarness.isError = true;
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-start-session" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-voice-capture" }).props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain(
      "We couldn't load your clinic details. Check your connection and try again, or go back safely.",
    );
    expect(renderer.root.findByProps({ testID: "clinic-context-retry-button" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "clinic-context-back-button" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "clinic-context-retry-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(profileHarness.refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.root.findByProps({ testID: "clinic-context-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Start session screen");

    profileHarness.data = { clinicId: "clinic-test" };
    profileHarness.isError = false;
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-voice-capture" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      voiceHarness.onUploadComplete?.({ transcriptionJobId: "job-test" });
      await Promise.resolve();
    });

    profileHarness.data = undefined;
    await act(async () => {
      renderer.update(<App />);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Clinic context unavailable");

    await act(async () => {
      renderer.root.findByProps({ testID: "clinic-context-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Start session screen");

    profileHarness.data = { clinicId: "clinic-test" };
    await act(async () => {
      renderer.update(<App />);
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-note" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-export" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Export screen");

    profileHarness.data = undefined;
    await act(async () => {
      renderer.update(<App />);
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "clinic-context-back-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Manual SOAP screen");
  });

  it("disables clinic retry while loading and returns missing transcript context to session setup on Android Back", async () => {
    authState.status = "authenticated";
    profileHarness.data = undefined;
    profileHarness.isLoading = true;
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-start-session" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-voice-capture" }).props.onPress();
      await Promise.resolve();
    });
    const loadingRetry = renderer.root.findByProps({ testID: "clinic-context-retry-button" });
    expect(loadingRetry.props.disabled).toBe(true);
    expect(loadingRetry.props.label).toBe("Loading...");

    profileHarness.data = { clinicId: "clinic-test" };
    profileHarness.isLoading = false;
    await act(async () => {
      renderer.update(<App />);
      await Promise.resolve();
      voiceHarness.onUploadComplete?.({ transcriptionJobId: "job-test" });
      await Promise.resolve();
    });
    profileHarness.data = undefined;
    await act(async () => {
      renderer.update(<App />);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Clinic context unavailable");

    await act(async () => {
      expect(authState.backHandler?.()).toBe(true);
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Start session screen");
  });

  it("lets the live transcript screen own Android Back, including unsaved edits", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-patient" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-start-session" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-open-voice-capture" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      voiceHarness.onUploadComplete?.({ transcriptionJobId: "job-test" });
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Transcript review screen");
    const appShellBack = authState.backHandlers.at(-1);
    expect(appShellBack?.()).toBe(false);
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });
    expect(transcriptHarness.childBackCalls).toBe(1);
    expect(collectText(renderer.toJSON())).toContain("Voice capture screen");

    await act(async () => {
      voiceHarness.onUploadComplete?.({ transcriptionJobId: "job-test" });
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "test-transcript-edit" }).props.onPress();
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Unsaved transcript edit");

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
      await Promise.resolve();
    });
    expect(transcriptHarness.unsavedBackCalls).toBe(1);
    expect(collectText(renderer.toJSON())).toContain("Transcript review screen");
  });

  it("returns Calendar back to Patients without leaving Dashboard active under the Patients tab", async () => {
    authState.status = "authenticated";
    const { default: App } = await import("../../App");
    const renderer = await render(<App />);

    expect(shellHarness.currentDestination).toBe("patients");

    await act(async () => {
      navigateThroughShell("calendar");
      await Promise.resolve();
    });
    expect(collectText(renderer.toJSON())).toContain("Calendar screen");
    expect(shellHarness.currentDestination).toBe("calendar");

    await act(async () => {
      authState.backHandler?.();
      await Promise.resolve();
    });

    const content = collectText(renderer.toJSON());
    expect(content).toContain("Patients screen");
    expect(content).not.toContain("Dashboard active");
    expect(shellHarness.currentDestination).toBe("patients");
  });
});
