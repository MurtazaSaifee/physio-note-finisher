import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reactNativeHarness = vi.hoisted(() => ({
  hardwareBackHandler: null as null | (() => boolean),
  hardwareBackHandlers: [] as Array<() => boolean>,
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  Keyboard: { dismiss: vi.fn() },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      reactNativeHarness.hardwareBackHandlers.push(handler);
      reactNativeHarness.hardwareBackHandler = handler;
      return {
        remove: () => {
          reactNativeHarness.hardwareBackHandlers = reactNativeHarness.hardwareBackHandlers.filter(
            (registeredHandler) => registeredHandler !== handler,
          );
          reactNativeHarness.hardwareBackHandler = reactNativeHarness.hardwareBackHandlers.at(-1) ?? null;
        },
      };
    },
  },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  Modal: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children),
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

const draftSections = {
  subjective: "Pain with stairs",
  objective: "Mild swelling",
  assessment: "Improving strength",
  plan: "Continue progressive loading",
};

const hookState = vi.hoisted(() => ({
  patients: { data: { items: [{ id: "patient-1", fullName: "Ada Lovelace" }] }, isLoading: false },
  patientProfile: { data: { id: "patient-1", fullName: "Ada Lovelace" }, isLoading: false },
  templates: {
    data: {
      templates: [{
        key: "knee", label: "Knee rehabilitation", category: "Knee", description: "Knee rehab template",
        conditionTags: ["Knee"], sections: {
          subjective: "Pain with stairs", objective: "Mild swelling", assessment: "Improving strength", plan: "Continue progressive loading",
        },
      }],
      suggestedTemplates: [], recentTemplates: [], categories: ["Knee"],
    },
    isLoading: false,
  },
  manualNote: { data: null as any, isLoading: false },
  createManualNote: { isPending: false, createManualNote: vi.fn() },
  saveManualNote: { isPending: false, saveManualNote: vi.fn() },
  finalizeManualNote: { isPending: false, finalizeManualNote: vi.fn() },
  reopenManualNote: { isPending: false, reopenManualNote: vi.fn() },
  regenerateSoapSection: { isPending: false, regenerateSoapSection: vi.fn() },
  generatePatientSummary: { isPending: false, generatePatientSummary: vi.fn() },
  savePatientSummary: { isPending: false, savePatientSummary: vi.fn() },
  generateSoapDraft: { isPending: false, generateSoapDraft: vi.fn() },
}));

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1", patientId: "patient-1", sessionId: "session-1", startedAt: "2026-04-19T08:30:00.000Z",
    visitType: "manual SOAP note", noteStatus: "draft", sections: draftSections, templateKey: null,
    createdAt: "2026-04-19T08:30:00.000Z", updatedAt: "2026-04-19T08:30:00.000Z", ...overrides,
  };
}

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => hookState.patients),
  usePatientProfile: vi.fn(() => hookState.patientProfile),
}));
vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: vi.fn(() => hookState.templates),
  useManualNote: vi.fn(() => hookState.manualNote),
  useCreateManualNote: vi.fn(() => hookState.createManualNote),
  useSaveManualNote: vi.fn(() => hookState.saveManualNote),
  useFinalizeManualNote: vi.fn(() => hookState.finalizeManualNote),
  useReopenManualNote: vi.fn(() => hookState.reopenManualNote),
  useRegenerateSoapSection: vi.fn(() => hookState.regenerateSoapSection),
}));
vi.mock("../../features/voice/hooks/useSoapGeneration.js", () => ({
  useGenerateSoapDraft: vi.fn(() => hookState.generateSoapDraft),
  useRegenerateSoapSection: vi.fn(() => hookState.regenerateSoapSection),
}));
vi.mock("../../features/voice/hooks/usePatientSummary.js", () => ({
  useGeneratePatientSummary: vi.fn(() => hookState.generatePatientSummary),
  useSavePatientSummary: vi.fn(() => hookState.savePatientSummary),
}));

import { ManualSoapComposerScreen } from "../../features/notes/screens/ManualSoapComposerScreen";
import { BackHandler } from "react-native";
import {
  clearDraft,
  clearOfflinePhiData,
  clearQueue,
  findDraftByIdPrefix,
  getDraft,
  getQueuedChanges,
  saveDraft,
} from "../../features/offline/storage/queueStore";

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

function text(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  return (node.children ?? []).map((child) => typeof child === "string" ? child : text(child)).join(" ");
}

function dispatchHardwareBack(): boolean {
  for (const handler of [...reactNativeHarness.hardwareBackHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

async function openSection(
  renderer: TestRenderer.ReactTestRenderer,
  section: "subjective" | "objective" | "assessment" | "plan",
) {
  await act(async () => {
    renderer.root.findByProps({ testID: `note-${section}-row` }).props.onPress();
  });
  return renderer.root.findByProps({ testID: `note-${section}-input` });
}

async function returnToReview(renderer: TestRenderer.ReactTestRenderer): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-19T08:30:00.000Z"));
  hookState.patients.data = { items: [{ id: "patient-1", fullName: "Ada Lovelace" }] };
  hookState.patientProfile.data = { id: "patient-1", fullName: "Ada Lovelace" };
  hookState.manualNote.data = null;
  hookState.createManualNote.createManualNote.mockImplementation(async (input: any) => {
    const note = makeNote({ sections: input.input.sections, templateKey: input.input.templateKey ?? null });
    hookState.manualNote.data = note;
    return note;
  });
  hookState.saveManualNote.saveManualNote.mockImplementation(async (input: any) => {
    const note = makeNote({ ...hookState.manualNote.data, sections: input.input.sections });
    hookState.manualNote.data = note;
    return note;
  });
  hookState.finalizeManualNote.finalizeManualNote.mockImplementation(async () => {
    hookState.manualNote.data = makeNote({ ...hookState.manualNote.data, noteStatus: "finalized" });
    return hookState.manualNote.data;
  });
  hookState.reopenManualNote.reopenManualNote.mockImplementation(async () => {
    hookState.manualNote.data = makeNote({ ...hookState.manualNote.data, noteStatus: "reopened" });
    return hookState.manualNote.data;
  });
  hookState.generateSoapDraft.generateSoapDraft.mockResolvedValue({ patientId: "patient-1", sessionId: "session-1", sections: { ...draftSections } });
  hookState.regenerateSoapSection.regenerateSoapSection.mockImplementation(async (input: any) => {
    const note = makeNote({ ...hookState.manualNote.data, sections: { ...(hookState.manualNote.data?.sections ?? draftSections), [input.section]: `Regenerated ${input.section}` } });
    hookState.manualNote.data = note;
    return note;
  });
  hookState.generatePatientSummary.generatePatientSummary.mockResolvedValue({ patientId: "patient-1", sessionId: "session-1", patientSummary: "Generated patient summary" });
  hookState.savePatientSummary.savePatientSummary.mockImplementation(async ({ patientSummary }: any) => ({ patientId: "patient-1", sessionId: "session-1", patientSummary }));
  reactNativeHarness.hardwareBackHandler = null;
  reactNativeHarness.hardwareBackHandlers = [];
  clearQueue();
  clearDraft("manual-note-draft:patient-1");
  clearOfflinePhiData();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ManualSoapComposerScreen guided workflow", () => {
  it("shows the selected patient from the patient profile when the list page does not contain them", async () => {
    hookState.patients.data = { items: [{ id: "patient-1", fullName: "Ada Lovelace" }] };
    hookState.patientProfile.data = { id: "patient-2", fullName: "Grace Hopper" };

    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-2" />);

    expect(text(renderer.toJSON())).toContain("Grace Hopper");
  });

  it("keeps a newly created appointment session on capture until a draft exists", async () => {
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-new" />,
    );

    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-review-stage" })).toThrow();
    expect(text(renderer.toJSON())).toContain("Not started");
  });

  it("shows the blank-note path when manual is the initial source", async () => {
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSource="manual" />,
    );

    expect(
      renderer.root.findByProps({ testID: "note-source-manual-button" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(renderer.root.findByProps({ testID: "note-start-manual-button" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-visit-recap-input" })).toThrow();
  });

  it("keeps manual selection on capture until the clinician explicitly starts a blank note", async () => {
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: "note-source-ai-button" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(renderer.root.findByProps({ testID: "note-visit-recap-input" })).toBeTruthy();
    await act(async () => renderer.root.findByProps({ testID: "note-source-manual-button" }).props.onPress());
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-start-manual-button" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-review-stage" })).toThrow();
    await act(async () => renderer.root.findByProps({ testID: "note-start-manual-button" }).props.onPress());
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-subjective-row" })).toBeTruthy();
  });

  it("resets a new note when the clinician switches patient", async () => {
    hookState.patients.data = {
      items: [
        { id: "patient-1", fullName: "Ada Lovelace" },
        { id: "patient-2", fullName: "Grace Hopper" },
      ],
    };
    const renderer = await render(<ManualSoapComposerScreen />);

    await act(async () => {
      renderer.root.findByProps({ testID: "note-patient-0-pill" }).props.onPress();
      renderer.root.findByProps({ testID: "note-source-manual-button" }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-start-manual-button" }).props.onPress();
    });
    expect(text(renderer.toJSON())).toContain("Draft in progress");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-patient-1-pill" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(text(renderer.toJSON())).toContain("Not started");
    expect(renderer.root.findByProps({ testID: "note-stage-review-button" }).props.disabled).toBe(true);
  });

  it("shows every documentation source and requires confirmation before manual entry", async () => {
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);

    expect(renderer.root.findByProps({ testID: "note-stage-capture-button" }).props.focusable).toBe(true);
    expect(renderer.root.findByProps({ testID: "note-source-ai-button" }).props.focusable).toBe(true);
    expect(renderer.root.findByProps({ testID: "note-source-voice-button" }).props.focusable).toBe(true);
    expect(renderer.root.findByProps({ testID: "note-source-manual-button" }).props.focusable).toBe(true);
    expect(renderer.root.findByProps({ testID: "note-source-template-button" }).props.focusable).toBe(true);

    await act(async () => {
      renderer.root.findByProps({ testID: "note-source-manual-button" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-start-manual-button" })).toBeTruthy();
    await act(async () => {
      renderer.root.findByProps({ testID: "note-start-manual-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
  });

  it("hands off the voice source only after the clinician starts recording", async () => {
    const onStartVoiceCapture = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        onStartVoiceCapture={onStartVoiceCapture}
      />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-source-voice-button" }).props.onPress();
    });
    expect(onStartVoiceCapture).not.toHaveBeenCalled();
    await act(async () => {
      renderer.root.findByProps({ testID: "note-start-voice-button" }).props.onPress();
    });
    expect(onStartVoiceCapture).toHaveBeenCalledTimes(1);
  });

  it("applies a chosen template from capture before review", async () => {
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);

    await act(async () => {
      renderer.root.findByProps({ testID: "note-source-template-button" }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-capture-template-0-card" }).props.onPress();
    });

    await openSection(renderer, "subjective");
    expect(renderer.root.findByProps({ testID: "note-subjective-input" }).props.value).toBe("Pain with stairs");
  });

  it("uses the stage controls and local Back before leaving the note", async () => {
    hookState.manualNote.data = makeNote();
    const onBack = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        onBack={onBack}
      />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-capture-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-review-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("returns a profile-resumed draft from final review to the patient profile without reopening capture", async () => {
    hookState.manualNote.data = makeNote();
    const onBack = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        initialEntryMode="review"
        onBack={onBack}
      />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-final-review-stage" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(() => renderer.root.findByProps({ testID: "note-capture-stage" })).toThrow();
  });

  it("restores a saved session directly to final review with its summary and actions", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Keep walking daily and use the stairs as tolerated." });
    const onViewHistory = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        initialEntryMode="finish"
        onViewHistory={onViewHistory}
      />,
    );

    expect(renderer.root.findByProps({ testID: "note-final-review-stage" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value).toBe(
      "Keep walking daily and use the stairs as tolerated.",
    );
    expect(renderer.root.findByProps({ testID: "note-finalize-action-button" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-final-review-back-button" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-view-history-button" }).props.onPress();
    });
    expect(onViewHistory).toHaveBeenCalledWith("session-1");
  });

  it("uses Android Back to close the section editor before leaving the note", async () => {
    hookState.manualNote.data = makeNote();
    const onBack = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        onBack={onBack}
      />,
    );

    await openSection(renderer, "subjective");
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps dirty patient-summary edits through local Back navigation and confirms before leaving", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    const onBack = vi.fn();
    const shellBackHandler = vi.fn(() => false);
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        initialEntryMode="finish"
        onBack={onBack}
      />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.onChangeText("Edited patient summary.");
    });
    BackHandler.addEventListener("hardwareBackPress", shellBackHandler);

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(shellBackHandler).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Edited patient summary.");
    expect(renderer.root.findByProps({ testID: "note-save-summary-button" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-review-button" }).props.onPress();
    });
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(renderer.root.findByProps({ testID: "note-cancel-discard-summary-button" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-cancel-discard-summary-button" }).props.onPress();
      renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Edited patient summary.");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-review-button" }).props.onPress();
    });
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-confirm-discard-summary-button" }).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("asks before replacing an existing SOAP draft from a changed recap", async () => {
    hookState.manualNote.data = makeNote();
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-stage-capture-button" }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-visit-recap-input" }).props.onChangeText("Pain is now lower on stairs.");
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-create-soap-draft-button" }).props.onPress();
    });

    expect(text(renderer.toJSON())).toContain("Replace current SOAP draft?");
    expect(hookState.generateSoapDraft.generateSoapDraft).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-confirm-replace-draft-button" }).props.onPress();
    });
    expect(hookState.generateSoapDraft.generateSoapDraft).toHaveBeenCalledWith(expect.objectContaining({
      transcriptText: "Pain is now lower on stairs.",
    }));
  });

  it("generates an AI draft from a short recap and advances to review", async () => {
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);
    await act(async () => renderer.root.findByProps({ testID: "note-visit-recap-input" }).props.onChangeText("Pain is lower on stairs."));
    await act(async () => renderer.root.findByProps({ testID: "note-create-soap-draft-button" }).props.onPress());
    expect(hookState.generateSoapDraft.generateSoapDraft).toHaveBeenCalledWith({ patientId: "patient-1", sessionId: "session-1", transcriptText: "Pain is lower on stairs." });
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
  });

  it("keeps a failed AI generation in capture so the clinician can continue manually", async () => {
    hookState.generateSoapDraft.generateSoapDraft.mockRejectedValueOnce(new Error("Generation unavailable"));
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);
    await act(async () => renderer.root.findByProps({ testID: "note-visit-recap-input" }).props.onChangeText("Brief recap"));
    await act(async () => renderer.root.findByProps({ testID: "note-create-soap-draft-button" }).props.onPress());
    expect(renderer.root.findByProps({ testID: "note-capture-stage" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "note-source-manual-button" })).toBeTruthy();
    expect(text(renderer.toJSON())).toContain("Could not generate SOAP draft. Try again.");
  });

  it("turns an AI empty-section marker into an empty editable field", async () => {
    hookState.generateSoapDraft.generateSoapDraft.mockResolvedValueOnce({
      patientId: "patient-1",
      sessionId: "session-1",
      sections: { ...draftSections, plan: "Not mentioned" },
    });
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);
    await act(async () => renderer.root.findByProps({ testID: "note-visit-recap-input" }).props.onChangeText("Brief recap"));
    await act(async () => renderer.root.findByProps({ testID: "note-create-soap-draft-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-plan-row" }).props.onPress());
    expect(renderer.root.findByProps({ testID: "note-plan-input" }).props.value).toBe("");
  });

  it("keeps history and duplicate navigation out of a focused section editor", async () => {
    hookState.manualNote.data = makeNote();
    const onBack = vi.fn();
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialSessionId="session-1"
        onBack={onBack}
        onViewHistory={vi.fn()}
      />,
    );

    await openSection(renderer, "subjective");

    expect(() => renderer.root.findByProps({ testID: "note-view-history-button" })).toThrow();
    expect(() => renderer.root.findByProps({ testID: "note-section-editor-back-button" })).toThrow();

    await act(async () => {
      renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("edits and regenerates only the selected SOAP section", async () => {
    hookState.manualNote.data = makeNote();
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" initialTranscriptText="Walking with less pain." />);
    await act(async () => renderer.root.findByProps({ testID: "note-plan-row" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-hint-input" }).props.onChangeText("Mention gait"));
    await act(async () => renderer.root.findByProps({ testID: "note-regenerate-plan-button" }).props.onPress());
    expect(renderer.root.findByProps({ testID: "note-plan-editor" })).toBeTruthy();
    expect(text(renderer.toJSON())).toMatch(/Use a visit recap to replace\s+Plan\s+only\./);
    expect(hookState.regenerateSoapSection.regenerateSoapSection).toHaveBeenCalledWith(expect.objectContaining({ section: "plan", hint: "Mention gait" }));
  });

  it("saves local edits before regenerating another section", async () => {
    hookState.manualNote.data = makeNote();
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    const subjectiveInput = await openSection(renderer, "subjective");
    await act(async () => subjectiveInput.props.onChangeText("Updated subjective finding"));
    await returnToReview(renderer);
    await openSection(renderer, "plan");

    await act(async () => {
      renderer.root.findByProps({ testID: "note-section-recap-input" }).props.onChangeText("Pain is improving with stairs.");
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-regenerate-plan-button" }).props.onPress();
    });

    expect(hookState.saveManualNote.saveManualNote).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        sections: expect.objectContaining({ subjective: "Updated subjective finding" }),
      }),
    }));
    await returnToReview(renderer);
    expect((await openSection(renderer, "subjective")).props.value).toBe("Updated subjective finding");
  });

  it("keeps an existing note in review when its server save fails", async () => {
    hookState.manualNote.data = makeNote();
    hookState.saveManualNote.saveManualNote.mockRejectedValueOnce(new Error("Server save failed"));
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-final-review-stage" })).toThrow();
    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
  });

  it("queues an existing note edit without entering final review", async () => {
    hookState.manualNote.data = makeNote();
    hookState.saveManualNote.saveManualNote.mockRejectedValueOnce(new Error("Network unavailable"));
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress();
    });

    expect(getQueuedChanges()).toEqual([expect.objectContaining({ type: "noteEdit", sessionId: "session-1" })]);
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-final-review-stage" })).toThrow();
    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
  });

  it("starts a routed template note in review without an in-page template library", async () => {
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" initialTemplateKey="knee" />);
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-template-0-card" })).toThrow();
  });

  it("hydrates a copy-forward scaffold into a new editable draft", async () => {
    hookState.createManualNote.createManualNote.mockResolvedValueOnce(
      makeNote({ sessionId: "session-new", noteStatus: "draft" }),
    );
    const renderer = await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialEntryMode="review"
        copyForwardScaffold={{
          patientId: "patient-1",
          sourceSessionId: "session-finalized",
          selectedSections: ["priorPlan", "carryForwardContext"],
          priorPlan: "Continue progressive loading.",
          carryForwardContext: "Review tolerance after the last visit.",
          sourceSessionDate: "2026-04-17T12:34:56.000Z",
        }}
        copyForwardToken="copy-forward-1"
      />,
    );

    const subjectiveInput = await openSection(renderer, "subjective");
    expect(subjectiveInput.props.value).toBe("Review tolerance after the last visit.");
    await returnToReview(renderer);
    const planInput = await openSection(renderer, "plan");
    expect(planInput.props.value).toBe("Continue progressive loading.");
    await returnToReview(renderer);

    await act(async () => {
      renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress();
    });

    expect(hookState.createManualNote.createManualNote).toHaveBeenCalledWith({
      patientId: "patient-1",
      input: expect.objectContaining({
        sections: {
          subjective: "Review tolerance after the last visit.",
          objective: null,
          assessment: null,
          plan: "Continue progressive loading.",
        },
        templateKey: null,
      }),
    });
    expect(hookState.saveManualNote.saveManualNote).not.toHaveBeenCalled();
  });

  it("keeps an existing local draft when copy-forward starts a new draft", async () => {
    const existingDraftId = "manual-note-draft:patient-1:existing-draft";
    const existingSections = {
      subjective: "Existing unsaved subjective",
      objective: "Existing unsaved objective",
      assessment: "Existing unsaved assessment",
      plan: "Existing unsaved plan",
    };
    saveDraft(existingDraftId, existingSections);

    await render(
      <ManualSoapComposerScreen
        initialPatientId="patient-1"
        initialEntryMode="review"
        copyForwardScaffold={{
          patientId: "patient-1",
          sourceSessionId: "session-finalized",
          selectedSections: ["priorPlan", "carryForwardContext"],
          priorPlan: "Continue progressive loading.",
          carryForwardContext: "Review tolerance after the last visit.",
          sourceSessionDate: "2026-04-17T12:34:56.000Z",
        }}
        copyForwardToken="copy-forward-1"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(getDraft(existingDraftId)).toEqual(existingSections);
    const copyForwardDraft = findDraftByIdPrefix("manual-note-draft:patient-1:");
    expect(copyForwardDraft?.draftId).not.toBe(existingDraftId);
    expect(copyForwardDraft?.sections).toEqual({
      subjective: "Review tolerance after the last visit.",
      objective: null,
      assessment: null,
      plan: "Continue progressive loading.",
    });
  });

  it("restores a saved session summary without regenerating it when final review is reopened", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Keep walking daily and report any falls." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());

    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Keep walking daily and report any falls.");
    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();

    await act(async () => renderer.root.findByProps({ testID: "note-final-review-back-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());

    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
  });

  it("shows saved-summary feedback exactly once in final review", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Keep walking daily and report any falls." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());

    expect(text(renderer.toJSON()).split("Summary saved for this session.").length - 1).toBe(1);
    await act(async () => renderer.root.findByProps({ testID: "note-final-review-back-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());

    expect(text(renderer.toJSON()).split("Summary saved for this session.").length - 1).toBe(1);
  });

  it("clears generated-summary feedback when the summary becomes dirty", async () => {
    hookState.manualNote.data = makeNote();
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());

    expect(text(renderer.toJSON())).toContain("Summary generated.");
    await act(async () => renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.onChangeText("Edited patient summary."));

    expect(text(renderer.toJSON())).toContain("Changes need to be saved.");
    expect(text(renderer.toJSON())).not.toContain("Summary generated.");
    expect(renderer.root.findByProps({ testID: "note-save-summary-button" }).props.label)
      .toBe("Save changes");
  });

  it("does not regenerate a saved summary when the stage buttons switch from Review back to Finish", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Keep walking daily and report any falls." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-stage-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress());

    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Keep walking daily and report any falls.");
    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
  });

  it("keeps unsaved summary edits while switching between Review and Finish", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );

    await act(async () => renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.onChangeText("Custom patient instructions."));
    await act(async () => renderer.root.findByProps({ testID: "note-stage-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-stage-finish-button" }).props.onPress());

    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Custom patient instructions.");
    expect(renderer.root.findByProps({ testID: "note-save-summary-button" }).props.label)
      .toBe("Save changes");
  });

  it("shows Save changes instead of finalization while the saved summary has unsaved edits", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.onChangeText("Edited patient summary."));

    expect(renderer.root.findByProps({ testID: "note-save-summary-button" }).props.label)
      .toBe("Save changes");
    expect(() => renderer.root.findByProps({ testID: "note-finalize-action-button" })).toThrow();
    expect(text(renderer.toJSON())).not.toContain("Summary saved for this session.");
  });

  it("asks before replacing a saved patient summary", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-generate-summary-button" }).props.onPress());

    expect(renderer.root.findByProps({ testID: "note-confirm-replace-summary-button" })).toBeTruthy();
    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
  });

  it("keeps the current summary when replacement is cancelled and replaces it only after confirmation", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-generate-summary-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-cancel-replace-summary-button" }).props.onPress());

    expect(hookState.generatePatientSummary.generatePatientSummary).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Saved patient summary.");

    await act(async () => renderer.root.findByProps({ testID: "note-generate-summary-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-confirm-replace-summary-button" }).props.onPress());

    expect(hookState.generatePatientSummary.generatePatientSummary).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Generated patient summary");
  });

  it("keeps summary edits and blocks finalization when their save fails", async () => {
    hookState.manualNote.data = makeNote({ patientSummary: "Saved patient summary." });
    hookState.savePatientSummary.savePatientSummary.mockRejectedValueOnce(new Error("Network unavailable"));
    const renderer = await render(
      <ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" />,
    );
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.onChangeText("Edited patient summary."));
    await act(async () => renderer.root.findByProps({ testID: "note-save-summary-button" }).props.onPress());

    expect(renderer.root.findByProps({ testID: "note-patient-summary-input" }).props.value)
      .toBe("Edited patient summary.");
    expect(() => renderer.root.findByProps({ testID: "note-finalize-action-button" })).toThrow();
  });

  it("generates a summary, finalizes before exporting, and can reopen", async () => {
    hookState.manualNote.data = makeNote();
    const onOpenExportShare = vi.fn();
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" initialSessionId="session-1" onOpenExportShare={onOpenExportShare} />);
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    expect(hookState.generatePatientSummary.generatePatientSummary).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: "note-final-review-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-export-share-button" })).toThrow();
    await act(async () => renderer.root.findByProps({ testID: "note-finalize-action-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-confirm-action-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-export-share-button" }).props.onPress());
    expect(onOpenExportShare).toHaveBeenCalledWith(expect.objectContaining({ noteStatus: "finalized" }));
    await act(async () => renderer.root.findByProps({ testID: "note-reopen-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-confirm-action-button" }).props.onPress());
    expect(hookState.reopenManualNote.reopenManualNote).toHaveBeenCalledWith({ patientId: "patient-1", sessionId: "session-1" });
  });

  it("queues a manual draft when the first server save is unavailable", async () => {
    hookState.createManualNote.createManualNote.mockRejectedValueOnce(new Error("Network unavailable"));
    const renderer = await render(<ManualSoapComposerScreen initialPatientId="patient-1" />);
    await act(async () => renderer.root.findByProps({ testID: "note-source-manual-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-start-manual-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-subjective-row" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-subjective-input" }).props.onChangeText("Offline clinical detail"));
    await act(async () => renderer.root.findByProps({ testID: "note-back-button" }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: "note-continue-final-review-button" }).props.onPress());
    expect(getQueuedChanges()).toEqual([expect.objectContaining({ type: "noteCreate", patientId: "patient-1" })]);
    expect(renderer.root.findByProps({ testID: "note-review-stage" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "note-final-review-stage" })).toThrow();
    expect(text(renderer.toJSON())).toContain("Saved offline. Will sync when online.");
  });
});
