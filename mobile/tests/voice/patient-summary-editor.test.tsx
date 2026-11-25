import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  Keyboard: {
    dismiss: vi.fn(),
  },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children),
  Platform: { OS: "android" },
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const state = vi.hoisted(() => ({
  patients: {
    data: {
      items: [{ id: "patient-1", fullName: "Ada Lovelace" }],
    },
    isLoading: false,
  },
  templates: { data: { templates: [] }, isLoading: false },
  manualNote: {
    data: {
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-28T12:00:00.000Z",
      visitType: "manual SOAP note",
      noteStatus: "draft" as const,
      sections: {
        subjective: "S",
        objective: "O",
        assessment: "A",
        plan: "P",
      },
      templateKey: null,
      createdAt: "2026-04-28T12:00:00.000Z",
      updatedAt: "2026-04-28T12:00:00.000Z",
    },
    isLoading: false,
  },
  generatePatientSummary: vi.fn(async () => ({
    patientId: "patient-1",
    sessionId: "session-1",
    patientSummary: "You are improving steadily with better movement control.",
  })),
  savePatientSummary: vi.fn(async () => ({
    patientId: "patient-1",
    sessionId: "session-1",
    patientSummary: "Edited summary",
  })),
  saveManualNote: vi.fn(),
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => state.patients),
  usePatientProfile: vi.fn(() => ({
    data: state.patients.data.items[0],
    isLoading: false,
  })),
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: vi.fn(() => state.templates),
  useManualNote: vi.fn(() => state.manualNote),
  useCreateManualNote: vi.fn(() => ({ isPending: false, createManualNote: vi.fn() })),
  useSaveManualNote: vi.fn(() => ({ isPending: false, saveManualNote: state.saveManualNote })),
  useFinalizeManualNote: vi.fn(() => ({ isPending: false, finalizeManualNote: vi.fn() })),
  useReopenManualNote: vi.fn(() => ({ isPending: false, reopenManualNote: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/useSoapGeneration.js", () => ({
  useGenerateSoapDraft: vi.fn(() => ({ isPending: false, generateSoapDraft: vi.fn() })),
  useRegenerateSoapSection: vi.fn(() => ({ isPending: false, regenerateSoapSection: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/usePatientSummary.js", () => ({
  useGeneratePatientSummary: vi.fn(() => ({
    isPending: false,
    generatePatientSummary: state.generatePatientSummary,
  })),
  useSavePatientSummary: vi.fn(() => ({
    isPending: false,
    savePatientSummary: state.savePatientSummary,
  })),
}));

import { ManualSoapComposerScreen } from "../../features/notes/screens/ManualSoapComposerScreen";

function text(instance: TestRenderer.ReactTestInstance): string {
  return instance.children.map((child) => (typeof child === "string" ? child : text(child))).join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.saveManualNote.mockImplementation(async ({ input }) => ({
    ...state.manualNote.data,
    sections: input.sections,
  }));
});

describe("ManualSoapComposerScreen patient summary", () => {
  it("allows in-place summary generation, editing, and save in the same composer workspace", async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
      );
      await Promise.resolve();
    });

    // @ts-expect-error initialized in act
    const root = renderer!.root;
    await act(async () => {
      root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress();
      await Promise.resolve();
    });
    const summaryInput = root.findByProps({ testID: "note-patient-summary-input" });
    expect(summaryInput).toBeTruthy();

    const generateButton = root.findByProps({ testID: "note-generate-summary-button" });
    expect(generateButton).toBeTruthy();

    await act(async () => {
      generateButton?.props.onPress();
      await Promise.resolve();
    });

    expect(state.generatePatientSummary).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
    });

    await act(async () => {
      summaryInput?.props.onChangeText("Edited summary");
    });

    const saveButton = root.findByProps({ testID: "note-save-summary-button" });
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.props.onPress();
      await Promise.resolve();
    });

    expect(state.savePatientSummary).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      patientSummary: "Edited summary",
    });
  });

  it("shows a generic summary failure message", async () => {
    state.generatePatientSummary.mockRejectedValue(new Error("LLM response has no message content"));

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
      );
      await Promise.resolve();
    });

    // @ts-expect-error initialized in act
    const root = renderer!.root;
    await act(async () => {
      root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress();
      await Promise.resolve();
    });
    const generateButton = root.findByProps({ testID: "note-generate-summary-button" });
    expect(generateButton).toBeTruthy();

    await act(async () => {
      generateButton?.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(text(root)).toContain("Could not generate summary. Try again.");
  });
});
