import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  Keyboard: { dismiss: vi.fn() },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children),
  Platform: { OS: "android" },
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: () => React.createElement("Text", null, "<"),
}));

vi.mock("../../features/ui/meridian/tokens", () => ({
  meridian: {
    color: {
      primary: "#007A8A",
      surface: "#FFFFFF",
      text: "#0F172A",
      textSubtle: "#64748B",
      surfaceMuted: "#F1F5F9",
      primarySoft: "#E0F2F1",
      destructive: "#B91C1C",
      border: "#E2E8F0",
      warning: "#D97706",
    },
    spacing: { sm: 8, md: 16, lg: 24, xs: 4 },
    radius: { card: 16, chip: 12 },
    shadow: { card: {} },
  },
}));

vi.mock("../../features/ui/meridian/typography", () => ({
  typography: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: "600" },
    heading: { fontSize: 18, fontWeight: "600" },
  },
}));

vi.mock("../../features/ui/meridian/primitives", () => ({
  MeridianInput: (props: Record<string, unknown>) =>
    React.createElement("TextInput", props),
  MeridianButton: (props: { label: string; onPress?: () => void }) =>
    React.createElement("Pressable", { onPress: props.onPress }, props.label),
  MeridianChip: (props: { label: string; onPress?: () => void }) =>
    React.createElement("Pressable", { onPress: props.onPress }, props.label),
  MeridianStatusPill: () => React.createElement("View"),
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => ({
    data: {
      items: [
        {
          id: "patient-1",
          fullName: "Test Patient",
          dateOfBirth: "1990-01-01",
          sex: "female",
          phone: "555-0101",
          email: "test@example.com",
          addressLine: "123 Main St",
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    },
    isLoading: false,
  })),
  usePatientProfile: vi.fn(() => ({
    data: { id: "patient-1", fullName: "Test Patient" },
    isLoading: false,
  })),
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: vi.fn(() => ({
    data: { templates: [], suggestedTemplates: [], recentTemplates: [], categories: [] },
    isLoading: false,
  })),
  useManualNote: vi.fn(() => ({ data: null, isLoading: false })),
  useCreateManualNote: vi.fn(() => ({
    isPending: false,
    createManualNote: vi.fn(async (input: { patientId: string; input: unknown }) => ({
      id: "note-1",
      patientId: input.patientId,
      sessionId: "session-1",
      startedAt: "2026-04-19T08:30:00.000Z",
      visitType: "manual SOAP note",
      noteStatus: "draft" as const,
      sections: { subjective: "", objective: "", assessment: "", plan: "" },
      templateKey: null,
      createdAt: "2026-04-19T08:30:00.000Z",
      updatedAt: "2026-04-19T08:30:00.000Z",
    })),
  })),
  useSaveManualNote: vi.fn(() => ({
    isPending: false,
    saveManualNote: vi.fn(async () => ({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-19T08:30:00.000Z",
      visitType: "manual SOAP note",
      noteStatus: "draft" as const,
      sections: { subjective: "", objective: "", assessment: "", plan: "" },
      templateKey: null,
      createdAt: "2026-04-19T08:30:00.000Z",
      updatedAt: "2026-04-19T08:30:00.000Z",
    })),
  })),
  useFinalizeManualNote: vi.fn(() => ({ isPending: false, finalizeManualNote: vi.fn() })),
  useReopenManualNote: vi.fn(() => ({ isPending: false, reopenManualNote: vi.fn() })),
  useRegenerateSoapSection: vi.fn(() => ({ isPending: false, regenerateSoapSection: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/useSoapGeneration.js", () => ({
  useGenerateSoapDraft: vi.fn(() => ({ isPending: false, generateSoapDraft: vi.fn() })),
  useRegenerateSoapSection: vi.fn(() => ({ isPending: false, regenerateSoapSection: vi.fn() })),
}));

vi.mock("../../features/voice/hooks/usePatientSummary.js", () => ({
  useGeneratePatientSummary: vi.fn(() => ({ isPending: false, generatePatientSummary: vi.fn() })),
  useSavePatientSummary: vi.fn(() => ({ isPending: false, savePatientSummary: vi.fn() })),
}));

vi.mock("../../features/offline/services/connectivity.js", () => ({
  getConnectivityState: vi.fn(() => true),
}));

import {
  clearDraft,
  clearQueue,
  getDraft,
  saveDraft,
  setMmkvImplementation,
} from "../../features/offline/storage/queueStore";
import { ManualSoapComposerScreen } from "../../features/notes/screens/ManualSoapComposerScreen";

async function openSection(renderer: TestRenderer.ReactTestRenderer, section: "subjective" | "objective" | "assessment" | "plan") {
  await act(async () => {
    renderer.root.findByProps({ testID: `note-${section}-row` }).props.onPress();
  });
  return renderer.root.findByProps({ testID: `note-${section}-input` });
}

async function returnToReview(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    renderer.root.findByProps({ testID: "note-back-button" }).props.onPress();
  });
}

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

describe("queueStore draft operations", () => {
  beforeEach(() => {
    setMmkvImplementation(null as unknown as Parameters<typeof setMmkvImplementation>[0]);
    clearQueue();
    clearDraft("session-1");
  });

  it("saves draft sections for a session and retrieves them", () => {
    const sections = {
      subjective: "Back pain",
      objective: "Stiffness",
      assessment: "Mild strain",
      plan: "Rest and ice",
    };

    saveDraft("session-1", sections);
    const draft = getDraft("session-1");

    expect(draft).toEqual(sections);
  });

  it("returns null after clearing draft", () => {
    saveDraft("session-1", {
      subjective: "Pain",
      objective: "Swelling",
      assessment: "Sprain",
      plan: "RICE",
    });

    clearDraft("session-1");
    expect(getDraft("session-1")).toBeNull();
  });
});

describe("ManualSoapComposerScreen draft hydration", () => {
  beforeEach(() => {
    setMmkvImplementation(null as unknown as Parameters<typeof setMmkvImplementation>[0]);
    clearQueue();
    clearDraft("session-1");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates composer state from draft on mount", async () => {
    saveDraft("session-1", {
      subjective: "Draft subjective",
      objective: "Draft objective",
      assessment: "Draft assessment",
      plan: "Draft plan",
    });

    const renderer = await render(
      React.createElement(ManualSoapComposerScreen, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
      }),
    );

    expect((await openSection(renderer, "subjective")).props.value).toBe("Draft subjective");
    await returnToReview(renderer);
    expect((await openSection(renderer, "objective")).props.value).toBe("Draft objective");
    await returnToReview(renderer);
    expect((await openSection(renderer, "assessment")).props.value).toBe("Draft assessment");
    await returnToReview(renderer);
    expect((await openSection(renderer, "plan")).props.value).toBe("Draft plan");
  });

  it("saves draft on unmount with updated sections", async () => {
    const renderer = await render(
      React.createElement(ManualSoapComposerScreen, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
      }),
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "note-source-manual-button" }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "note-start-manual-button" }).props.onPress();
    });
    const subjectiveInput = await openSection(renderer, "subjective");
    await act(async () => {
      subjectiveInput.props.onChangeText("Updated subjective");
    });
    await returnToReview(renderer);
    const objectiveInput = await openSection(renderer, "objective");
    await act(async () => {
      objectiveInput.props.onChangeText("Updated objective");
    });

    // Unmount triggers useEffect cleanup that saves draft
    await act(async () => {
      renderer.unmount();
    });

    const draft = getDraft("session-1");
    expect(draft).not.toBeNull();
    expect(draft?.subjective).toBe("Updated subjective");
    expect(draft?.objective).toBe("Updated objective");
  });

  it("survives a screen remount with draft intact", async () => {
    saveDraft("session-1", {
      subjective: "Survived restart",
      objective: "Still here",
      assessment: "Good",
      plan: "Continue",
    });

    // First mount
    const renderer1 = await render(
      React.createElement(ManualSoapComposerScreen, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
      }),
    );

    expect((await openSection(renderer1, "subjective")).props.value).toBe("Survived restart");

    // Unmount (simulate restart)
    await act(async () => {
      renderer1.unmount();
    });

    // Remount (simulate restart)
    const renderer2 = await render(
      React.createElement(ManualSoapComposerScreen, {
        initialPatientId: "patient-1",
        initialSessionId: "session-1",
      }),
    );

    expect((await openSection(renderer2, "subjective")).props.value).toBe("Survived restart");
    await returnToReview(renderer2);
    expect((await openSection(renderer2, "objective")).props.value).toBe("Still here");
  });
});
