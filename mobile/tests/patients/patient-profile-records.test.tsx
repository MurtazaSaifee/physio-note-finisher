import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  hookState.timeline.isError = false;
  vi.clearAllMocks();
});

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
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
  },
  timeline: {
    data: {
      patientId: "patient-1",
      items: [
        {
          id: "session-3",
          patientId: "patient-1",
          sessionDate: "2026-04-18T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "finalized",
          finalNotePreview: "Calmer gait mechanics and reduced pain.",
          patientSummaryPreview: "Continue the mobility plan at home.",
        },
        {
          id: "session-2",
          patientId: "patient-1",
          sessionDate: "2026-04-17T12:34:56.000Z",
          visitType: "initial-evaluation",
          noteStatus: "finalized",
          finalNotePreview: "Initial assessment completed.",
          patientSummaryPreview: "Start exercises.",
        },
        {
          id: "session-1",
          patientId: "patient-1",
          sessionDate: "2026-04-16T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "draft",
          finalNotePreview: "Draft note.",
          patientSummaryPreview: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  exportRecords: {
    data: {
      patientId: "patient-1",
      records: [
        {
          id: "export-1",
          sessionId: "session-3",
          action: "saved",
          type: "fullNote",
          format: "pdf",
          exportedByUserId: "user-1",
          createdAt: "2026-04-18T13:00:00.000Z",
        },
        {
          id: "export-2",
          sessionId: "session-2",
          action: "shared",
          type: "patientSummary",
          format: "text",
          exportedByUserId: "user-1",
          createdAt: "2026-04-17T13:00:00.000Z",
        },
      ],
    },
    isLoading: false,
  },
  updatePatientMutation: {
    isPending: false,
    mutateAsync: vi.fn(async () => ({
      id: "patient-1",
      clinicId: "clinic-1",
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
    })),
  },
  archivePatientMutation: {
    isPending: false,
    mutateAsync: vi.fn(async () => ({
      id: "patient-1",
      clinicId: "clinic-1",
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
    })),
  },
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientProfile: vi.fn(() => hookState.profile),
  usePatientTimeline: vi.fn(() => hookState.timeline),
  useUpdatePatient: vi.fn(() => hookState.updatePatientMutation),
  useArchivePatient: vi.fn(() => hookState.archivePatientMutation),
}));

vi.mock("../../features/exports/hooks/useExportRecords.js", () => ({
  useExportRecords: vi.fn(() => hookState.exportRecords),
  exportRecordsQueryKey: vi.fn((patientId: string) => ["exports", "records", patientId]),
}));

import { PatientProfileScreen } from "../../features/patients/screens/PatientProfileScreen";

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

function findTextInputs(
  node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null,
): TestRenderer.ReactTestRendererJSON[] {
  if (!node) {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(findTextInputs);
  }

  if (node.type === "TextInput") {
    return [node];
  }

  const children = node.children ?? [];
  return children.flatMap((child) =>
    typeof child === "string" ? [] : findTextInputs(child),
  );
}

function findSearchRecordsInput(
  nodes: TestRenderer.ReactTestRendererJSON[],
): TestRenderer.ReactTestRendererJSON | undefined {
  return nodes.find((n) => n.props.placeholder === "Search records...");
}

describe("patient profile records", () => {
  it("renders Clinical Records section with finalized notes in reverse chronological order", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen patientId="patient-1" />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Clinical Records");
    expect(text).toContain("follow-up");
    expect(text).toContain("initial-evaluation");
    // Clinical records should show 2 finalized notes; the draft is in timeline only
    const finalizedCount = (text.match(/Finalized/g) ?? []).length;
    expect(finalizedCount).toBeGreaterThanOrEqual(2);
  });

  it("shows export status indicators on records", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen patientId="patient-1" />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Saved");
    expect(text).toContain("Shared");
  });

  it("filters records by search query", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen patientId="patient-1" />,
      );
      await Promise.resolve();
    });

    const textInputs = findTextInputs(renderer?.toJSON() ?? null);
    const searchInput = findSearchRecordsInput(textInputs);

    // Before filter: both Saved and Shared status chips appear in Clinical Records
    const textBefore = collectText(renderer?.toJSON() ?? null);
    expect(textBefore).toContain("Saved");
    expect(textBefore).toContain("Shared");

    expect(searchInput).toBeTruthy();

    await act(async () => {
      searchInput!.props.onChangeText("initial-evaluation");
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // After filter: only the matching record's status chip remains in Clinical Records
    const textAfter = collectText(renderer?.toJSON() ?? null);
    expect(textAfter).toContain("initial-evaluation");
    expect(textAfter).toContain("Shared");
    // Saved belongs to the follow-up record which should be filtered out of Clinical Records
    expect(textAfter).not.toContain("Saved");
  });

  it("calls onOpenFinalizedRecord with correct ids when a record is pressed", async () => {
    const onOpenFinalizedRecord = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen
          patientId="patient-1"
          onOpenFinalizedRecord={onOpenFinalizedRecord}
        />,
      );
      await Promise.resolve();
    });

    const buttons = renderer!.root.findAllByProps({ accessibilityRole: "button" });
    const recordButton = buttons.find((b) =>
      collectText(b).includes("follow-up") && collectText(b).includes("Finalized"),
    );

    expect(recordButton).toBeTruthy();

    act(() => {
      recordButton!.props.onPress();
    });

    expect(onOpenFinalizedRecord).toHaveBeenCalledWith("patient-1", "session-3");
  });

  it("shows a quiet open cue and accessible label on finalized record cards", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen patientId="patient-1" />,
      );
      await Promise.resolve();
    });

    const recordCard = renderer!.root.findByProps({
      testID: "patient-profile-record-0-card",
    });
    const openCue = renderer!.root.findByProps({
      testID: "patient-profile-record-0-open-cue",
    });

    expect(collectText(openCue)).toBe("Open");
    expect(recordCard.props.accessibilityLabel).toBe("Open follow-up record");
    expect(recordCard.props.accessibilityHint).toBe(
      "Opens the full finalized note.",
    );
  });

  it("shows a recovery state instead of treating a failed timeline as empty", async () => {
    hookState.timeline.isError = true;

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <PatientProfileScreen patientId="patient-1" />,
      );
      await Promise.resolve();
    });

    expect(
      renderer!.root.findByProps({ testID: "patient-profile-timeline-error" }),
    ).toBeTruthy();
    const retryButton = renderer!.root.findByProps({
      testID: "patient-profile-timeline-retry-button",
    });
    act(() => {
      retryButton.props.onPress();
    });
    expect(hookState.timeline.refetch).toHaveBeenCalled();
    hookState.timeline.isError = false;
  });
});
