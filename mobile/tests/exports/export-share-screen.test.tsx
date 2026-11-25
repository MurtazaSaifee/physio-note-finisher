import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const printToFileAsync = vi.fn();
const copyAsync = vi.fn();
const deleteAsync = vi.fn();
const makeDirectoryAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
const createAssetAsync = vi.fn();
const createAlbumAsync = vi.fn();
const shareAsync = vi.fn();
const share = vi.fn();
const setString = vi.fn();
const getString = vi.fn();
const alert = vi.fn();

vi.mock("expo-print", () => ({
  printToFileAsync,
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  copyAsync,
  deleteAsync,
  makeDirectoryAsync,
}));

vi.mock("expo-media-library", () => ({
  requestPermissionsAsync,
  createAssetAsync,
  createAlbumAsync,
}));

vi.mock("expo-sharing", () => ({
  shareAsync,
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: setString,
  getStringAsync: getString,
}));

vi.mock("react-native", () => ({
  Alert: {
    alert,
  },
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  Keyboard: { dismiss: vi.fn() },
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children),
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Clipboard: {
    setString,
  },
  Share: {
    share,
    sharedAction: "sharedAction",
    dismissedAction: "dismissedAction",
  },
}));

const composerHookState = vi.hoisted(() => ({
  patients: {
    data: {
      items: [
        {
          id: "patient-1",
          fullName: "Ada Lovelace",
          dateOfBirth: "1990-01-23",
          sex: "female",
          phone: "555-0101",
          email: "ada@example.com",
          addressLine: "1 Circuit Lane",
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    },
    isLoading: false,
  },
  templates: {
    data: {
      templates: [],
      suggestedTemplates: [],
      recentTemplates: [],
      categories: [],
    },
    isLoading: false,
  },
  manualNote: {
    data: {
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-19T08:30:00.000Z",
      visitType: "follow-up",
      noteStatus: "finalized" as const,
      sections: {
        subjective: "Pain improving.",
        objective: "Gait steadier.",
        assessment: "Progressing.",
        plan: "Continue home exercise plan.",
      },
      templateKey: null,
      createdAt: "2026-04-19T08:30:00.000Z",
      updatedAt: "2026-04-19T08:30:00.000Z",
    },
    isLoading: false,
  },
}));

const exportScreenHookState = vi.hoisted(() => ({
  patientDateOfBirth: "1990-01-23" as string | null,
  sessionDate: "2026-04-30" as string | null,
}));

const exportRecordsHookState = vi.hoisted(() => ({
  createExportRecord: vi.fn(async ({ input }: { input: unknown }) => input),
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: "ChevronLeft",
}));

vi.mock("../../features/ui/meridian/tokens.js", () => ({
  meridian: {
    color: {
      surface: "#fff",
      surfaceMuted: "#f5f5f5",
      text: "#111",
      textSubtle: "#666",
      primary: "#007A8A",
      primarySoft: "#d7ecef",
      destructive: "#ba1a1a",
      border: "#ddd",
    },
    spacing: {
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
    },
    radius: {
      card: 16,
      dock: 24,
    },
    shadow: {
      card: {},
    },
  },
}));

vi.mock("../../features/ui/meridian/typography.js", () => ({
  typography: {},
}));

vi.mock("../../features/ui/meridian/primitives.js", async () => {
  const ReactModule = await import("react");

  return {
    MeridianInput: (props: Record<string, unknown>) => ReactModule.createElement("TextInput", props),
    MeridianButton: ({
      label,
      onPress,
      disabled,
      testID,
      variant = "primary",
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      variant?: "primary" | "secondary" | "ghost" | "destructive";
    }) =>
      ReactModule.createElement(
        "Pressable",
        { onPress, disabled, testID, variant, accessibilityRole: "button" },
        ReactModule.createElement("Text", null, label),
      ),
    MeridianChip: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      ReactModule.createElement(
        "Pressable",
        { onPress, accessibilityRole: "button" },
        ReactModule.createElement("Text", null, label),
      ),
    MeridianStatusPill: ({ label }: { label: string }) => ReactModule.createElement("Text", null, label),
  };
});

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => composerHookState.patients),
  usePatientProfile: vi.fn(() => ({
    data: {
      id: "patient-1",
      fullName: "Ada Lovelace",
      dateOfBirth: exportScreenHookState.patientDateOfBirth,
    },
  })),
  usePriorSession: vi.fn(() => ({
    data: {
      id: "session-1",
      patientId: "patient-1",
      sessionDate: exportScreenHookState.sessionDate,
      visitType: "Follow-up",
      noteStatus: "finalized",
      finalNote: "Stored final note",
      patientSummary: "Keep moving every hour and continue your home plan.",
      priorPlan: null,
      carryForwardContext: null,
      createdAt: "2026-04-30T08:00:00.000Z",
      updatedAt: "2026-04-30T08:00:00.000Z",
    },
  })),
}));

vi.mock("../../features/settings/api/useGetProfile", () => ({
  useGetProfile: vi.fn(() => ({
    data: {
      firstName: "Elena",
      lastName: "Rostova",
    },
  })),
}));

vi.mock("../../features/notes/templates/templates.js", () => ({
  applyTemplateToSections: vi.fn((sections: unknown) => sections),
}));

vi.mock("../../features/notes/components/SoapSectionEditor.js", () => ({
  SoapSectionEditor: "SoapSectionEditor",
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: vi.fn(() => composerHookState.templates),
  useCreateManualNote: vi.fn(() => ({ isPending: false, createManualNote: vi.fn() })),
  useFinalizeManualNote: vi.fn(() => ({ isPending: false, finalizeManualNote: vi.fn() })),
  useManualNote: vi.fn(() => composerHookState.manualNote),
  useReopenManualNote: vi.fn(() => ({ isPending: false, reopenManualNote: vi.fn() })),
  useSaveManualNote: vi.fn(() => ({ isPending: false, saveManualNote: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/useSoapGeneration.js", () => ({
  useGenerateSoapDraft: vi.fn(() => ({ isPending: false, generateSoapDraft: vi.fn() })),
  useRegenerateSoapSection: vi.fn(() => ({ isPending: false, regenerateSoapSection: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/usePatientSummary.js", () => ({
  useGeneratePatientSummary: vi.fn(() => ({ isPending: false, generatePatientSummary: vi.fn() })),
  useSavePatientSummary: vi.fn(() => ({ isPending: false, savePatientSummary: vi.fn() })),
}));

vi.mock("../../features/exports/hooks/useExportRecords", () => ({
  useCreateExportRecord: vi.fn(() => ({
    isPending: false,
    createExportRecord: exportRecordsHookState.createExportRecord,
  })),
}));

async function render(element: React.ReactElement) {
  let renderer: any;

  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });

  if (!renderer) {
    throw new Error("Failed to render");
  }

  return renderer;
}

function collectText(node: any): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  return (node.children ?? [])
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

describe("export document service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    exportRecordsHookState.createExportRecord.mockReset().mockImplementation(
      async ({ input }: { input: unknown }) => input,
    );
    exportScreenHookState.patientDateOfBirth = "1990-01-23";
    exportScreenHookState.sessionDate = "2026-04-30";

    printToFileAsync.mockResolvedValue({ uri: "file:///cache/export.pdf" });
    copyAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);
    makeDirectoryAsync.mockResolvedValue(undefined);
    alert.mockReset();
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    createAssetAsync.mockResolvedValue({ id: "asset-1", uri: "file:///documents/Physio Note Finisher/export.pdf" });
    createAlbumAsync.mockResolvedValue({ id: "album-1" });
    shareAsync.mockResolvedValue(undefined);
    share.mockResolvedValue({ action: "sharedAction" });
  });

  it("renders a rich full-note PDF template with clinical header SOAP sections bullets and sign-off", async () => {
    const { buildFullNoteExportHtml } = await import("../../features/exports/exportTemplates");

    const html = buildFullNoteExportHtml({
      patientName: "Ada Lovelace",
      patientDateOfBirth: "1990-01-23",
      patientRecordId: "PT-109",
      visitDate: "2026-04-30",
      visitType: "Follow-up",
      clinicianName: "Dr. Elena Rostova, DPT",
      clinicianLicense: "PT-8839201",
      sections: {
        subjective: "Pain settles after mobility work.",
        objective: "Lumbar flexion to 45°.\nCore stability 3/5.\nGluteal strength 4-/5 bilaterally.",
        assessment: "Improving tolerance for desk work.",
        plan: "Continue progressive loading and posture cues.",
      },
    });

    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("DOB: 1990-01-23");
    expect(html).toContain("Record: PT-109");
    expect(html).toContain("Subjective");
    expect(html).toContain("Objective");
    expect(html).toContain("Assessment");
    expect(html).toContain("Plan");
    expect(html).toContain("<li>");
    expect(html).toContain("Dr. Elena Rostova, DPT");
    expect(html).toContain("PT-8839201");
  });

  it("omits the record line when there is no clinic-facing record number", async () => {
    const { buildFullNoteExportHtml } = await import("../../features/exports/exportTemplates");

    const html = buildFullNoteExportHtml({
      patientName: "Ada Lovelace",
      patientDateOfBirth: "1990-01-23",
      visitDate: "2026-04-30",
      visitType: "Follow-up",
      clinicianName: "Dr. Elena Rostova, DPT",
      clinicianLicense: "PT-8839201",
      sections: {
        subjective: "Pain settles after mobility work.",
        objective: "Lumbar flexion to 45°.",
        assessment: "Improving tolerance for desk work.",
        plan: "Continue progressive loading and posture cues.",
      },
    });

    expect(html).toContain("DOB: 1990-01-23");
    expect(html).not.toContain("Record:");
  });

  it("copies the stored final note string unchanged, records the copy action, and clears the clipboard", async () => {
    vi.useFakeTimers();
    const recordExportAction = vi.fn().mockResolvedValue({
      id: "export-3",
      sessionId: "session-1",
      action: "copied",
      type: "fullNote",
      format: "text",
      exportedByUserId: "user-1",
      createdAt: "2026-04-30T11:32:00.000Z",
    });

    const { copyFinalNote } = await import("../../features/exports/exportDocumentService");
    const finalNote = "S: Better pain control\nO: Improved gait\nA: Progressing\nP: Continue HEP";
    getString.mockResolvedValue(finalNote);

    const copied = await copyFinalNote({
      finalNote,
      patientId: "patient-1",
      sessionId: "session-1",
      recordExportAction,
    });

    expect(copied).toBe(finalNote);
    expect(setString).toHaveBeenCalledWith(finalNote);
    expect(recordExportAction).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      action: "copied",
      type: "fullNote",
      format: "text",
    });

    await vi.advanceTimersByTimeAsync(120000);
    expect(setString).toHaveBeenLastCalledWith("");
    vi.useRealTimers();
  });

  it("saves a generated PDF privately before recording the export action", async () => {
    vi.stubEnv("APP_VARIANT", "production");

    const recordExportAction = vi.fn().mockResolvedValue({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      createdAt: "2026-04-30T11:30:00.000Z",
    });

    const { saveFullNotePdfToRecord } = await import("../../features/exports/exportDocumentService");

    await saveFullNotePdfToRecord({
      patientId: "patient-1",
      sessionId: "session-1",
      noteStatus: "finalized",
      finalNote: "Stored final note",
      patientName: "Ada Lovelace",
      patientDateOfBirth: "1990-01-23",
      patientRecordId: "PT-109",
      visitDate: "2026-04-30",
      visitType: "Follow-up",
      clinicianName: "Dr. Elena Rostova, DPT",
      clinicianLicense: "PT-8839201",
      sections: {
        subjective: "Pain settles after mobility work.",
        objective: "Lumbar flexion to 45°.",
        assessment: "Improving tolerance for desk work.",
        plan: "Continue progressive loading and posture cues.",
      },
      recordExportAction,
    });

    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(createAssetAsync).not.toHaveBeenCalled();
    expect(createAlbumAsync).not.toHaveBeenCalled();
    expect(makeDirectoryAsync).toHaveBeenCalledWith("file:///documents/Physio Note Finisher", { intermediates: true });
    expect(copyAsync).toHaveBeenCalledWith(expect.objectContaining({
      from: "file:///cache/export.pdf",
      to: expect.stringMatching(/^file:\/\/\/documents\/Physio Note Finisher\/export-session-1-\d+\.pdf$/),
    }));
    expect(deleteAsync).toHaveBeenCalledWith("file:///cache/export.pdf", { idempotent: true });
    expect(recordExportAction).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
    });
  });

  it("excludes the saved note export folder from Android backup while keeping the private save path", async () => {
    const manifestPath = fileURLToPath(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url));
    const backupRulesPath = fileURLToPath(new URL("../../android/app/src/main/res/xml/backup_rules.xml", import.meta.url));
    const dataExtractionRulesPath = fileURLToPath(
      new URL("../../android/app/src/main/res/xml/data_extraction_rules.xml", import.meta.url),
    );

    const manifest = readFileSync(manifestPath, "utf8");
    const backupRules = readFileSync(backupRulesPath, "utf8");
    const dataExtractionRules = readFileSync(dataExtractionRulesPath, "utf8");

    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
    expect(backupRules).toContain('domain="file"');
    expect(backupRules).toContain('path="Physio Note Finisher"');
    expect(dataExtractionRules).toContain('<cloud-backup>');
    expect(dataExtractionRules).toContain('<device-transfer>');
    expect(dataExtractionRules).toContain('domain="file"');
    expect(dataExtractionRules).toContain('path="Physio Note Finisher"');
    expect(backupRules).toContain('domain="sharedpref"');
    expect(backupRules).toContain('path="SecureStore"');
    expect(dataExtractionRules).toContain('domain="sharedpref"');
    expect(dataExtractionRules).toContain('path="SecureStore"');
  });

  it("skips MediaLibrary writes in non-production builds while still saving and recording", async () => {
    vi.stubEnv("APP_VARIANT", "development");

    const recordExportAction = vi.fn().mockResolvedValue({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      createdAt: "2026-04-30T11:30:00.000Z",
    });

    const { saveFullNotePdfToRecord } = await import("../../features/exports/exportDocumentService");

    await saveFullNotePdfToRecord({
      patientId: "patient-1",
      sessionId: "session-1",
      noteStatus: "finalized",
      finalNote: "Stored final note",
      patientName: "Ada Lovelace",
      patientDateOfBirth: "1990-01-23",
      patientRecordId: "PT-109",
      visitDate: "2026-04-30",
      visitType: "Follow-up",
      clinicianName: "Dr. Elena Rostova, DPT",
      clinicianLicense: "PT-8839201",
      sections: {
        subjective: "Pain settles after mobility work.",
        objective: "Lumbar flexion to 45°.",
        assessment: "Improving tolerance for desk work.",
        plan: "Continue progressive loading and posture cues.",
      },
      recordExportAction,
    });

    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(createAssetAsync).not.toHaveBeenCalled();
    expect(createAlbumAsync).not.toHaveBeenCalled();
    expect(copyAsync).toHaveBeenCalledWith({
      from: "file:///cache/export.pdf",
      to: expect.stringMatching(/^file:\/\/\/documents\/Physio Note Finisher\/export-session-1-\d+\.pdf$/),
    });
    expect(deleteAsync).toHaveBeenCalledWith("file:///cache/export.pdf", { idempotent: true });
    expect(recordExportAction).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
    });
  });

  it("shares patient summaries as plain text or lightweight PDF", async () => {
    const recordExportAction = vi.fn().mockResolvedValue({
      id: "export-2",
      sessionId: "session-1",
      action: "shared",
      type: "patientSummary",
      format: "text",
      exportedByUserId: "user-1",
      createdAt: "2026-04-30T11:31:00.000Z",
    });

    share.mockResolvedValue({ action: "sharedAction" });

    const { sharePatientSummaryText, sharePatientSummaryPdf } = await import("../../features/exports/exportDocumentService");

    await sharePatientSummaryText({
      patientId: "patient-1",
      sessionId: "session-1",
      noteStatus: "finalized",
      patientName: "Ada Lovelace",
      visitDate: "2026-04-30",
      patientSummary: "Keep moving every hour and continue your home plan.",
      recordExportAction,
    });

    await sharePatientSummaryPdf({
      patientId: "patient-1",
      sessionId: "session-1",
      noteStatus: "finalized",
      patientName: "Ada Lovelace",
      visitDate: "2026-04-30",
      patientSummary: "Keep moving every hour and continue your home plan.",
      recordExportAction,
    });

    expect(share).toHaveBeenCalledWith({
      message: "Keep moving every hour and continue your home plan.",
    });
    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/export.pdf");
    expect(deleteAsync).toHaveBeenCalledWith("file:///cache/export.pdf", { idempotent: true });
    expect(recordExportAction).toHaveBeenNthCalledWith(1, {
      patientId: "patient-1",
      sessionId: "session-1",
      action: "shared",
      type: "patientSummary",
      format: "text",
    });
    expect(recordExportAction).toHaveBeenNthCalledWith(2, {
      patientId: "patient-1",
      sessionId: "session-1",
      action: "shared",
      type: "patientSummary",
      format: "pdf",
    });
  });

  it("does not record a share action when the user dismisses the share sheet", async () => {
    const recordExportAction = vi.fn().mockResolvedValue({
      id: "export-4",
      sessionId: "session-1",
      action: "shared",
      type: "patientSummary",
      format: "text",
      exportedByUserId: "user-1",
      createdAt: "2026-04-30T11:33:00.000Z",
    });

    share.mockResolvedValue({ action: "dismissedAction" });

    const { sharePatientSummaryText } = await import("../../features/exports/exportDocumentService");

    await sharePatientSummaryText({
      patientId: "patient-1",
      sessionId: "session-1",
      noteStatus: "finalized",
      patientName: "Ada Lovelace",
      visitDate: "2026-04-30",
      patientSummary: "Keep moving every hour and continue your home plan.",
      recordExportAction,
    });

    expect(recordExportAction).not.toHaveBeenCalled();
  });
});

describe("export share screen", () => {
  it("shows an Export & Share action only for finalized notes", async () => {
    const onOpenExportShare = vi.fn();
    const { ManualSoapComposerScreen } = await import("../../features/notes/screens/ManualSoapComposerScreen");
    const ManualSoapComposerScreenAny = ManualSoapComposerScreen as any;

    const finalizedRenderer = await render(
      React.createElement(ManualSoapComposerScreenAny, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
        onOpenExportShare,
      }),
    );

    expect(collectText(finalizedRenderer.toJSON())).toContain("Export & Share");

    composerHookState.manualNote.data = {
      ...composerHookState.manualNote.data,
      noteStatus: "draft" as const,
    } as any;

    const draftRenderer = await render(
      React.createElement(ManualSoapComposerScreenAny, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
        onOpenExportShare,
      }),
    );

    expect(collectText(draftRenderer.toJSON())).not.toContain("Export & Share");
  });

  it("explains the finalization gate and keeps a return path from blocked export", async () => {
    const onBack = vi.fn();
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");

    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="draft"
        onBack={onBack}
      />,
    );

    expect(collectText(renderer.toJSON())).toContain("Export & Share is only available after finalization.");

    renderer.root.findByProps({ testID: "export-share-back-button" }).props.onPress();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("formats raw date props with the clinical date convention", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");

    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="finalized"
        patientDateOfBirth="1990-01-23"
        visitDate="2026-04-30"
        finalNote="Stored final note"
      />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("DOB: Jan 23, 1990");
    expect(text).toContain("Apr 30, 2026");
    expect(text).not.toContain("1990-01-23");
    expect(text).not.toContain("2026-04-30");
  });

  it("formats hook-provided dates and safely omits invalid or missing dates", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");

    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="finalized"
        finalNote="Stored final note"
      />,
    );

    const formattedText = collectText(renderer.toJSON());
    expect(formattedText).toContain("DOB: Jan 23, 1990");
    expect(formattedText).toContain("Apr 30, 2026");

    for (const [patientDateOfBirth, sessionDate] of [
      ["not-a-date", "not-a-date"],
      [null, null],
    ] as const) {
      exportScreenHookState.patientDateOfBirth = patientDateOfBirth;
      exportScreenHookState.sessionDate = sessionDate;

      const invalidRenderer = await render(
        <ExportShareScreen
          patientId="patient-1"
          sessionId="session-1"
          noteStatus="finalized"
          finalNote="Stored final note"
        />,
      );

      const invalidText = collectText(invalidRenderer.toJSON());
      expect(invalidText).not.toContain("Invalid Date");
      expect(invalidText).not.toContain("not-a-date");
    }
  });

  it("switches between full note and patient summary modes with mode-specific actions", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");
    const ExportShareScreenAny = ExportShareScreen as any;
    const renderer = await render(
      React.createElement(ExportShareScreenAny, {
        patientId: "patient-1",
        sessionId: "session-1",
        noteStatus: "finalized",
        patientName: "Ada Lovelace",
        patientDateOfBirth: "1990-01-23",
        patientRecordId: "PT-109",
        visitDate: "2026-04-30",
        visitType: "Follow-up",
        clinicianName: "Dr. Elena Rostova, DPT",
        clinicianLicense: "PT-8839201",
        finalNote: "Stored final note",
        patientSummary: "Keep moving every hour and continue your home plan.",
        sections: {
          subjective: "Pain improving.",
          objective: "Gait steadier.",
          assessment: "Progressing.",
          plan: "Continue home exercise plan.",
        },
      }),
    );

    expect(collectText(renderer.toJSON())).toContain("Full Note");
    expect(collectText(renderer.toJSON())).toContain("Record: PT-109");
    const fullNoteActions = renderer.root
      .findAllByType("Pressable")
      .filter((instance) => [
        "export-share-share-pdf-button",
        "export-share-copy-note-button",
        "export-share-export-pdf-button",
      ].includes(instance.props.testID));

    expect(fullNoteActions.map((action) => action.props.testID)).toEqual([
      "export-share-share-pdf-button",
      "export-share-copy-note-button",
      "export-share-export-pdf-button",
    ]);
    expect(fullNoteActions.map((action) => collectText(action))).toEqual([
      "Share PDF",
      "Copy Note",
      "Save as PDF",
    ]);
    expect(fullNoteActions.map((action) => action.props.variant)).toEqual([
      "primary",
      "secondary",
      "secondary",
    ]);
    expect(collectText(renderer.toJSON())).not.toContain("Save to Record");

    const patientSummaryButton = renderer.root.findAllByType("Pressable").find((instance) =>
      instance.findAllByType("Text").some((textNode) => textNode.children.join("") === "Patient Summary"),
    );

    if (!patientSummaryButton) {
      throw new Error("Missing Patient Summary button");
    }

    await act(async () => {
      patientSummaryButton.props.onPress?.();
    });

    expect(collectText(renderer.toJSON())).toContain("Share Summary Text");
    expect(collectText(renderer.toJSON())).toContain("Export Summary PDF");
    expect(collectText(renderer.toJSON())).not.toContain("Copy Note");
    expect(collectText(renderer.toJSON())).not.toContain("Save to Record");
  });

  it("routes the first full-note action through the native PDF share path", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");
    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="finalized"
        patientName="Ada Lovelace"
        patientDateOfBirth="1990-01-23"
        patientRecordId="PT-109"
        visitDate="2026-04-30"
        visitType="Follow-up"
        clinicianName="Dr. Elena Rostova, DPT"
        clinicianLicense="PT-8839201"
        finalNote="Stored final note"
        patientSummary="Keep moving every hour and continue your home plan."
        sections={{
          subjective: "Pain improving.",
          objective: "Gait steadier.",
          assessment: "Progressing.",
          plan: "Continue home exercise plan.",
        }}
      />,
    );

    const sharePdfButton = renderer.root.findByProps({ testID: "export-share-share-pdf-button" });

    await act(async () => {
      await sharePdfButton.props.onPress?.();
    });

    expect(shareAsync).toHaveBeenCalledWith("file:///cache/export.pdf");
    expect(exportRecordsHookState.createExportRecord).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      input: {
        action: "shared",
        type: "fullNote",
        format: "pdf",
      },
    });
  });

  it("routes Save as PDF through the private saved-PDF path", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");
    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="finalized"
        patientName="Ada Lovelace"
        patientDateOfBirth="1990-01-23"
        patientRecordId="PT-109"
        visitDate="2026-04-30"
        visitType="Follow-up"
        clinicianName="Dr. Elena Rostova, DPT"
        clinicianLicense="PT-8839201"
        finalNote="Stored final note"
        patientSummary="Keep moving every hour and continue your home plan."
        sections={{
          subjective: "Pain improving.",
          objective: "Gait steadier.",
          assessment: "Progressing.",
          plan: "Continue home exercise plan.",
        }}
      />,
    );

    const savePdfButton = renderer.root.findByProps({ testID: "export-share-export-pdf-button" });
    vi.clearAllMocks();

    await act(async () => {
      await savePdfButton.props.onPress?.();
    });

    expect(copyAsync).toHaveBeenCalledWith(expect.objectContaining({
      from: "file:///cache/export.pdf",
      to: expect.stringMatching(/^file:\/\/\/documents\/Physio Note Finisher\/export-session-1-\d+\.pdf$/),
    }));
    expect(shareAsync).not.toHaveBeenCalled();
    expect(exportRecordsHookState.createExportRecord).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      input: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });
  });

  it("does not fall back to internal patient identifiers in export preview metadata", async () => {
    const { ExportShareScreen } = await import("../../features/exports/screens/ExportShareScreen");
    const renderer = await render(
      <ExportShareScreen
        patientId="patient-1"
        sessionId="session-1"
        noteStatus="finalized"
        patientName="Ada Lovelace"
        patientDateOfBirth="1990-01-23"
        visitDate="2026-04-30"
        visitType="Follow-up"
        clinicianName="Dr. Elena Rostova, DPT"
        clinicianLicense="PT-8839201"
        finalNote="Stored final note"
        patientSummary="Keep moving every hour and continue your home plan."
        sections={{
          subjective: "Pain improving.",
          objective: "Gait steadier.",
          assessment: "Progressing.",
          plan: "Continue home exercise plan.",
        }}
      />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).not.toContain("Record:");
    expect(text).not.toContain("patient-1");
    expect(text).not.toContain("session-1");
  });
});
