import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

import { PatientListScreen } from "../../features/patients/screens/PatientListScreen";
import { PatientProfileScreen } from "../../features/patients/screens/PatientProfileScreen";

const hookState = vi.hoisted(() => ({
  list: {
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
          conditionTags: ["Mobility", "Strength", "Pain", "Compliance"],
          lastVisitDate: "2026-04-20T12:00:00.000Z",
          unfinishedNoteCount: 2,
          recentSessionStatus: "reopened",
          nextAppointment: null,
        },
      ],
    },
    isLoading: false,
  },
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
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
      conditionTags: ["Mobility", "Strength", "Pain", "Compliance"],
      lastVisitDate: "2026-04-20T12:00:00.000Z",
      unfinishedNoteCount: 2,
      recentSessionStatus: "reopened",
      nextAppointment: null,
    },
    isLoading: false,
  },
  timeline: {
    data: {
      patientId: "patient-1",
      items: [],
    },
    isLoading: false,
  },
  updateMutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  archiveMutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => hookState.list),
  usePatientProfile: vi.fn(() => hookState.profile),
  usePatientTimeline: vi.fn(() => hookState.timeline),
  useCreatePatient: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useUpdatePatient: vi.fn(() => hookState.updateMutation),
  useArchivePatient: vi.fn(() => hookState.archiveMutation),
}));

vi.mock("../../features/exports/hooks/useExportRecords.js", () => ({
  useExportRecords: vi.fn(() => ({ data: { patientId: "patient-1", records: [] }, isLoading: false })),
  exportRecordsQueryKey: vi.fn((patientId: string) => ["exports", "records", patientId]),
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

  return (node.children ?? [])
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("patient workspace screens", () => {
  it("renders a compact patient directory with record context instead of condition-tag clutter", async () => {
    const renderer = await render(<PatientListScreen onAddPatient={vi.fn()} onOpenPatient={vi.fn()} />);
    const text = collectText(renderer.toJSON());

    expect(text).toContain("Patients");
    expect(text).toContain("Today");
    expect(renderer.root.findByProps({ testID: "patient-list-add-patient-button" }).props.accessibilityLabel).toBe("Add patient");
    expect(text).toContain("Unfinished notes");
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Born Jan 23, 1990");
    expect(text).not.toContain("Pain");
    expect(text).not.toContain("Compliance");
  });

  it("renders a focused patient workspace and keeps editing out of the primary decision area", async () => {
    const onStartNewSession = vi.fn();
    const onCreateAppointment = vi.fn();
    const renderer = await render(
      <PatientProfileScreen
        patientId="patient-1"
        onStartNewSession={onStartNewSession}
        onCreateAppointment={onCreateAppointment}
      />,
    );
    const text = collectText(renderer.toJSON());

    expect(text).toContain("No upcoming visit");
    expect(text).toContain("Start documentation");
    expect(text).toContain("View history");
    expect(text).toContain("Schedule a visit");
    expect(text).toContain("Edit patient");
    expect(text).not.toContain("Save changes");

    await act(async () => {
      renderer.root
        .findByProps({ testID: "patient-profile-new-session-button" })
        .props.onPress();
      renderer.root
        .findByProps({ testID: "patient-profile-view-history-row" })
        .props.onPress();
      renderer.root
        .findByProps({ testID: "patient-profile-create-appointment-row" })
        .props.onPress();
      await Promise.resolve();
    });

    expect(onStartNewSession).toHaveBeenCalledWith("patient-1");
    expect(onCreateAppointment).toHaveBeenCalledWith("patient-1");

    const editRow = renderer.root.findByProps({ testID: "patient-profile-edit-row" });
    await act(async () => {
      editRow.props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).toContain("Save changes");

    await act(async () => {
      renderer.update(<PatientProfileScreen patientId="patient-2" />);
      await Promise.resolve();
    });

    expect(collectText(renderer.toJSON())).not.toContain("Save changes");
  });
});
