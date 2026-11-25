import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Pressable: "Pressable",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const hookState = vi.hoisted(() => ({
  profile: {
    data: {
      id: "patient-1",
      fullName: "Ada Lovelace",
      dateOfBirth: "1990-01-23",
      sex: "female",
      phone: "555-0101",
      email: "ada@example.com",
      addressLine: "1 Circuit Lane",
      clinicalNotes: "Mobility follow-up",
      conditionTags: ["spine"],
      lastVisitDate: "2026-04-16T08:00:00.000Z",
      unfinishedNoteCount: 1,
      recentSessionStatus: "finalized",
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  priorSession: {
    data: {
      id: "session-1",
      patientId: "patient-1",
      sessionDate: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "finalized",
      finalNote: "Full note text",
      patientSummary: "Summary text",
      priorPlan: "Plan",
      carryForwardContext: "Context",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:40:00.000Z",
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  manualNote: {
    data: {
      sections: {
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientProfile: vi.fn(() => hookState.profile),
  usePriorSession: vi.fn(() => hookState.priorSession),
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useManualNote: vi.fn(() => hookState.manualNote),
}));

import { ReadOnlyNotePreviewScreen } from "../../features/exports/screens/ReadOnlyNotePreviewScreen";

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
    .join(" ");
}

afterEach(() => {
  hookState.priorSession.data.sessionDate = "2026-04-17T12:34:56.000Z";
  hookState.profile.isError = false;
  hookState.priorSession.isError = false;
  hookState.manualNote.isError = false;
  vi.clearAllMocks();
});

describe("read-only note preview", () => {
  it("renders patient name, visit metadata, and finalized status", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("follow-up");
    expect(text).toContain("finalized");
    expect(text).toContain("Apr 17, 2026");
    expect(text).not.toContain("4/17/2026");
    expect(text).toContain("Full note text");
    expect(text).toContain("Summary text");
    expect(text).not.toContain("patient-1");
    expect(text).not.toContain("session-1");
  });

  it("shows Export & Share button for finalized notes", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Export & Share");
  });

  it("offers a new draft from a finalized session through the carry-forward workflow", async () => {
    const onCreateNewDraftFromSession = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
          onCreateNewDraftFromSession={onCreateNewDraftFromSession}
        />,
      );
      await Promise.resolve();
    });

    const createDraftButton = renderer!.root.findByProps({
      testID: "read-only-preview-create-draft-button",
    });

    expect(createDraftButton.props.accessibilityLabel).toBe("Create new draft from this session");
    await act(async () => {
      createDraftButton.props.onPress();
    });
    expect(onCreateNewDraftFromSession).toHaveBeenCalledOnce();
  });

  it.each(["not-a-date", null] as const)(
    "uses the em dash for a %s session date",
    async (sessionDate) => {
      (hookState.priorSession.data as { sessionDate: string | null }).sessionDate = sessionDate;

      let renderer: TestRenderer.ReactTestRenderer | undefined;

      await act(async () => {
        renderer = TestRenderer.create(
          <ReadOnlyNotePreviewScreen
            patientId="patient-1"
            sessionId="session-1"
          />,
        );
        await Promise.resolve();
      });

      const text = collectText(renderer?.toJSON() ?? null);
      expect(text).toContain("Session date —");
      expect(text).not.toContain("Invalid Date");
    },
  );

  it("calls onOpenExportShare with correct context when Export & Share is pressed", async () => {
    const onOpenExportShare = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
          onOpenExportShare={onOpenExportShare}
        />,
      );
      await Promise.resolve();
    });

    const buttons = renderer!.root.findAllByProps({ accessibilityRole: "button" });
    const exportButton = buttons.find((b) =>
      collectText(b).includes("Export & Share"),
    );

    expect(exportButton).toBeTruthy();

    act(() => {
      exportButton!.props.onPress();
    });

    expect(onOpenExportShare).toHaveBeenCalledWith({
      patientId: "patient-1",
      sessionId: "session-1",
      patientSummary: "Summary text",
      sections: {
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      },
    });
  });

  it("calls onBack when Back is pressed", async () => {
    const onBack = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
          onBack={onBack}
        />,
      );
      await Promise.resolve();
    });

    const backButton = renderer!.root.findByProps({
      testID: "read-only-preview-back-button",
    });

    expect(backButton).toBeTruthy();

    act(() => {
      backButton!.props.onPress();
    });

    expect(onBack).toHaveBeenCalled();
  });

  it("shows a recovery state instead of placeholder metadata when loading fails", async () => {
    hookState.priorSession.isError = true;

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <ReadOnlyNotePreviewScreen
          patientId="patient-1"
          sessionId="session-1"
        />,
      );
      await Promise.resolve();
    });

    expect(
      renderer!.root.findByProps({ testID: "read-only-preview-error" }),
    ).toBeTruthy();
    const retryButton = renderer!.root.findByProps({
      testID: "read-only-preview-retry-button",
    });
    act(() => {
      retryButton.props.onPress();
    });
    expect(hookState.priorSession.refetch).toHaveBeenCalled();
  });
});
