import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const scrollMocks = vi.hoisted(() => ({
  scrollToEnd: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: React.forwardRef(
    ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToEnd: scrollMocks.scrollToEnd }));
      return React.createElement("ScrollView", props, children);
    },
  ),
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  Alert: { alert: vi.fn() },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

import { TimelineCard } from "../../features/patients/components/TimelineCard";
import { MeridianButton } from "../../features/ui/meridian/primitives";
import { Alert } from "react-native";
import { PriorSessionScreen } from "../../features/patients/screens/PriorSessionScreen";
import { PatientListScreen } from "../../features/patients/screens/PatientListScreen";
import { PatientProfileScreen } from "../../features/patients/screens/PatientProfileScreen";

const hookState = vi.hoisted(() => ({
  activeList: {
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
          conditionTags: ["spine"],
          lastVisitDate: "2026-04-16T08:00:00.000Z",
          unfinishedNoteCount: 1,
          recentSessionStatus: "finalized",
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    },
    isLoading: false,
  },
  archivedList: {
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
          conditionTags: ["spine"],
          lastVisitDate: "2026-04-16T08:00:00.000Z",
          unfinishedNoteCount: 1,
          recentSessionStatus: "finalized",
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "patient-2",
          fullName: "Grace Hopper",
          dateOfBirth: "1906-12-09",
          sex: "female",
          phone: "555-0199",
          email: "grace@example.com",
          addressLine: "2 Compiler Way",
          conditionTags: ["knee"],
          lastVisitDate: "2026-04-15T08:00:00.000Z",
          unfinishedNoteCount: 0,
          recentSessionStatus: null,
          nextAppointment: null,
          archivedAt: "2026-04-17T09:00:00.000Z",
          createdAt: "2026-04-17T09:00:00.000Z",
          updatedAt: "2026-04-17T09:00:00.000Z",
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
          id: "session-2",
          patientId: "patient-1",
          sessionDate: "2026-04-18T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "finalized",
          finalNotePreview: "Calmer gait mechanics and reduced pain.",
          patientSummaryPreview: "Continue the mobility plan at home.",
        },
      ],
    },
    isLoading: false,
  },
  priorSession: {
    data: {
      id: "session-1",
      patientId: "patient-1",
      sessionDate: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "finalized",
      finalNote: "Full note",
      patientSummary: "Summary",
      priorPlan: "Plan",
      carryForwardContext: "Context",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:40:00.000Z",
    },
    isLoading: false,
  },
  createPatientMutation: {
    isPending: false,
    mutateAsync: vi.fn(async () => ({
      id: "patient-3",
      clinicId: "clinic-1",
      fullName: "New Patient",
      dateOfBirth: null,
      sex: null,
      phone: null,
      email: null,
      addressLine: null,
      clinicalNotes: null,
      conditionTags: [],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    })),
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
      archivedAt: "2026-04-17T12:00:00.000Z",
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    })),
  },
  copyForwardMutation: {
    isPending: false,
    copyForward: vi.fn(async () => ({
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
      priorPlan: "Plan",
      carryForwardContext: null,
      sourceSessionDate: "2026-04-17T12:34:56.000Z",
    })),
  },
  exportRecords: {
    data: {
      patientId: "patient-1",
      records: [] as Array<{ sessionId: string; action: "saved" | "shared" }>,
    },
    isLoading: false,
  },
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn((args?: { includeArchived?: boolean }) =>
    args?.includeArchived ? hookState.archivedList : hookState.activeList,
  ),
  usePatientProfile: vi.fn(() => hookState.profile),
  usePatientTimeline: vi.fn(() => hookState.timeline),
  usePriorSession: vi.fn(() => hookState.priorSession),
  useCreatePatient: vi.fn(() => hookState.createPatientMutation),
  useUpdatePatient: vi.fn(() => hookState.updatePatientMutation),
  useArchivePatient: vi.fn(() => hookState.archivePatientMutation),
}));

vi.mock("../../features/patients/hooks/useCopyForward.js", () => ({
  useCopyForward: vi.fn(() => hookState.copyForwardMutation),
}));

vi.mock("../../features/exports/hooks/useExportRecords.js", () => ({
  useExportRecords: vi.fn(() => hookState.exportRecords),
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

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
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

afterEach(() => {
  vi.clearAllMocks();
  hookState.exportRecords.data.records = [];
  hookState.profile.data.archivedAt = null;
  scrollMocks.scrollToEnd.mockClear();
});

describe("patient mobile screens", () => {
  it("keeps patient filters behind an explicit control and launches patient creation separately", async () => {
    const onAddPatient = vi.fn();
    const renderer = await render(<PatientListScreen onAddPatient={onAddPatient} onOpenPatient={vi.fn()} />);

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Ada Lovelace");
    expect(text).not.toContain("Grace Hopper");
    expect(text).toContain("Patients");
    expect(renderer.root.findByProps({ testID: "patient-list-add-patient-button" }).props.accessibilityLabel).toBe("Add patient");
    expect(renderer.root.findByProps({ testID: "patient-list-filter-button" })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: "patient-list-filter-panel" })).toThrow();

    const addPatientButton = renderer.root.findByProps({
      testID: "patient-list-add-patient-button",
    });

    await act(async () => {
      addPatientButton.props.onPress();
    });

    expect(onAddPatient).toHaveBeenCalledOnce();
    expect(() => renderer.root.findByProps({ testID: "patient-list-add-patient-form" })).toThrow();

    const filters = renderer.root.findByProps({
      testID: "patient-list-filter-button",
    });

    await act(async () => {
      filters.props.onPress();
    });

    const toggle = renderer.root
      .findAllByProps({
        accessibilityRole: "switch",
      })
      .find((node) => collectText(node).includes("Include archived"));
    expect(toggle).toBeTruthy();

    expect(toggle?.props.accessibilityState).toMatchObject({ checked: false });
  });

  it("renders a focused profile workspace with collapsed patient editing", async () => {
    const onBack = vi.fn();
    const onOpenSession = vi.fn();
    const renderer = await render(
      <PatientProfileScreen
        patientId="patient-1"
        onBack={onBack}
        onOpenSession={onOpenSession}
      />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("1990-01-23");
    expect(text).toContain("female");
    expect(text).toContain("1 Circuit Lane");
    expect(text).toContain("Session timeline");
    expect(text).toContain("Start documentation");
    expect(text).toContain("View history");
    expect(text).toContain("Schedule a visit");
    expect(text).toContain("Edit patient");
    expect(text).not.toContain("Save changes");
    expect(text).not.toContain("Archive patient");
    expect(text).not.toContain("calendar");
    expect(text).not.toContain("reminder");

    const contentStyle = Object.assign(
      {},
      ...(renderer.root.findByType("ScrollView").props.contentContainerStyle as Record<string, unknown>[]),
    );
    expect(contentStyle).toMatchObject({
      paddingBottom: 32,
    });
    expect(renderer.root.findByProps({ testID: "patient-profile-create-appointment-row" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "patient-profile-edit-row" })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-view-history-row" }).props.onPress();
      renderer.root.findByProps({ testID: "patient-profile-back-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(scrollMocks.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(onBack).toHaveBeenCalledTimes(1);

    renderer.root.findByProps({ testID: "patient-profile-new-session-button" });
    renderer.root.findByProps({ testID: "patient-profile-create-appointment-row" });
    renderer.root.findByProps({ testID: "patient-profile-edit-row" });
  });

  it.each(["draft", "reopened"] as const)("resumes the newest %s session from the profile", async (noteStatus) => {
    const originalItems = hookState.timeline.data.items;
    hookState.timeline.data.items = [
      {
        ...originalItems[0],
        id: "session-newest-editable",
        sessionDate: "2026-04-20T12:34:56.000Z",
        noteStatus,
      },
      {
        ...originalItems[0],
        id: "session-older-editable",
        sessionDate: "2026-04-19T12:34:56.000Z",
        noteStatus: noteStatus === "draft" ? "reopened" : "draft",
      },
    ];
    const onOpenSession = vi.fn();

    try {
      const renderer = await render(
        <PatientProfileScreen patientId="patient-1" onOpenSession={onOpenSession} />,
      );

      expect(collectText(renderer.toJSON())).toContain("Resume latest draft");
      expect(
        renderer.root.findAllByType(MeridianButton).find(
          (button) => button.props.testID === "patient-profile-resume-latest-draft-button",
        )?.props.variant,
      ).toBe("primary");
      expect(
        renderer.root.findAllByType(MeridianButton).find(
          (button) => button.props.testID === "patient-profile-new-session-button",
        )?.props.variant,
      ).toBe("secondary");

      await act(async () => {
        renderer.root.findByProps({ testID: "patient-profile-resume-latest-draft-button" }).props.onPress();
      });

      expect(onOpenSession).toHaveBeenCalledOnce();
      expect(onOpenSession).toHaveBeenCalledWith("patient-1", "session-newest-editable");
    } finally {
      hookState.timeline.data.items = originalItems;
    }
  });

  it("does not offer resume when all sessions are finalized and keeps new documentation primary", async () => {
    const originalItems = hookState.timeline.data.items;
    hookState.timeline.data.items = originalItems.map((item) => ({
      ...item,
      noteStatus: "finalized" as const,
    }));
    const onOpenSession = vi.fn();
    const onStartNewSession = vi.fn();

    try {
      const renderer = await render(
        <PatientProfileScreen
          patientId="patient-1"
          onOpenSession={onOpenSession}
          onStartNewSession={onStartNewSession}
        />,
      );

      expect(() => renderer.root.findByProps({ testID: "patient-profile-resume-latest-draft-button" })).toThrow();
      expect(
        renderer.root.findAllByType(MeridianButton).find(
          (button) => button.props.testID === "patient-profile-new-session-button",
        )?.props.variant,
      ).toBe("primary");

      await act(async () => {
        renderer.root.findByProps({ testID: "patient-profile-new-session-button" }).props.onPress();
      });

      expect(onStartNewSession).toHaveBeenCalledOnce();
      expect(onStartNewSession).toHaveBeenCalledWith("patient-1");
      expect(onOpenSession).not.toHaveBeenCalled();
    } finally {
      hookState.timeline.data.items = originalItems;
    }
  });

  it("keeps the profile scroll container sized with dock clearance", async () => {
    const renderer = await render(
      <PatientProfileScreen patientId="patient-1" />,
    );

    const scrollView = renderer.root.findByType("ScrollView");

    expect(scrollView.props.style).toMatchObject({ flex: 1 });
    const contentStyle = Object.assign(
      {},
      ...(scrollView.props.contentContainerStyle as Record<string, unknown>[]),
    );
    expect(contentStyle).toMatchObject({
      flexGrow: 1,
      paddingBottom: 32,
    });

    expect(
      renderer.root.findByProps({ testID: "patient-profile-create-appointment-row" }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: "patient-profile-edit-row" }),
    ).toBeTruthy();
  });

  it("requires confirmation before archiving an active patient", async () => {
    const renderer = await render(<PatientProfileScreen patientId="patient-1" />);

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-edit-row" }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-archive-button" }).props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Archive patient?",
      expect.stringContaining("leave normal patient views"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
        expect.objectContaining({ text: "Archive patient", style: "destructive" }),
      ]),
    );
    expect(hookState.archivePatientMutation.mutateAsync).not.toHaveBeenCalled();

    const actions = vi.mocked(Alert.alert).mock.calls[0]?.[2];
    actions?.[0]?.onPress?.();
    expect(hookState.archivePatientMutation.mutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      actions?.[1]?.onPress?.();
      await Promise.resolve();
    });
    expect(hookState.archivePatientMutation.mutateAsync).toHaveBeenCalledWith({
      patientId: "patient-1",
      archived: true,
    });
  });

  it("restores an archived patient without a confirmation", async () => {
    hookState.profile.data.archivedAt = "2026-04-17T12:00:00.000Z";
    const renderer = await render(<PatientProfileScreen patientId="patient-1" />);

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-edit-row" }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-profile-archive-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(hookState.archivePatientMutation.mutateAsync).toHaveBeenCalledWith({
      patientId: "patient-1",
      archived: false,
    });
  });

  it("uses user-facing export status chips in the clinical records list", async () => {
    hookState.exportRecords.data.records = [
      { sessionId: "session-2", action: "saved" },
      { sessionId: "session-2", action: "shared" },
    ];

    const renderer = await render(
      <PatientProfileScreen patientId="patient-1" />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Saved export");
    expect(text).toContain("Shared export");
  });

  it("keeps history and finalized records scannable with explicit note-status targets", async () => {
    const renderer = await render(
      <PatientProfileScreen patientId="patient-1" />,
    );

    expect(
      renderer.root.findByProps({ testID: "patient-profile-timeline-0-card" })
        .findByProps({ testID: "patient-profile-timeline-0-status-pill" }),
    ).toBeTruthy();
  });

  it("keeps finalized record status explicit inside the patient workspace", async () => {
    const renderer = await render(
      <PatientProfileScreen patientId="patient-1" />,
    );

    expect(
      renderer.root.findByProps({ testID: "patient-profile-record-0-card" })
        .findByProps({ testID: "patient-profile-record-0-status-pill" }),
    ).toBeTruthy();
  });

  it("keeps a prior-session review on an obvious patient-workspace back target", async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <PriorSessionScreen
        patientId="patient-1"
        sessionId="session-1"
        onBack={onBack}
      />,
    );

    renderer.root.findByProps({ testID: "prior-session-back-button" }).props.onPress();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("opens timeline sessions from the timeline card press target", async () => {
    const onOpenSession = vi.fn();
    const renderer = await render(
      <TimelineCard
        item={hookState.timeline.data.items[0]}
        onOpenSession={onOpenSession}
      />,
    );

    const pressable = renderer.root.findByType("Pressable");

    act(() => {
      pressable.props.onPress();
    });

    expect(onOpenSession).toHaveBeenCalledWith("patient-1", "session-2");
  });

  it("opens finalized timeline sessions in read-only preview", async () => {
    const onOpenFinalizedRecord = vi.fn();
    const onOpenSession = vi.fn();
    const renderer = await render(
      <PatientProfileScreen
        patientId="patient-1"
        onOpenSession={onOpenSession}
        onOpenFinalizedRecord={onOpenFinalizedRecord}
      />,
    );

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "View finalized note: follow-up" }).props.onPress();
    });

    expect(onOpenFinalizedRecord).toHaveBeenCalledWith("patient-1", "session-2");
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("shows a visible and accessible open cue on timeline record cards", async () => {
    const renderer = await render(
      <TimelineCard
        item={hookState.timeline.data.items[0]}
        onOpenSession={vi.fn()}
        testID="patient-profile-timeline-0-card"
      />,
    );

    const card = renderer.root.findByType("Pressable");
    const openCue = renderer.root.findByProps({
      testID: "patient-profile-timeline-0-card-open-cue",
    });

    expect(collectText(openCue)).toBe("View finalized note");
    expect(card.props.accessibilityLabel).toBe("View finalized note: follow-up");
    expect(card.props.accessibilityHint).toBe("Opens this finalized note in read-only preview.");
  });

  it.each(["draft", "reopened"] as const)("keeps a %s timeline record on the direct resume path", async (noteStatus) => {
    const onOpenSession = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <TimelineCard
          item={{ ...hookState.timeline.data.items[0], noteStatus }}
          onOpenSession={onOpenSession}
        />,
      );
      await Promise.resolve();
    });
    if (!renderer) throw new Error("Renderer missing");
    const card = renderer.root.findByType("Pressable");

    expect(collectText(renderer.toJSON())).toContain("Resume draft");
    expect(card.props.accessibilityHint).toBe("Opens this editable SOAP draft.");
    await act(async () => {
      card.props.onPress();
    });

    expect(onOpenSession).toHaveBeenCalledWith("patient-1", "session-2");
  });

  it("renders a read-only prior-session panel with explicit copy-forward action", async () => {
    const renderer = await render(
      <PriorSessionScreen patientId="patient-1" sessionId="session-1" />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Session date");
    expect(text).toContain("Visit type");
    expect(text).toContain("Note status");
    expect(text).toContain("Final note");
    expect(text).toContain("Patient summary");
    expect(text).toContain("Prior plan");
    expect(text).toContain("Carry-forward context");
    expect(text).toContain("Copy forward");
  });
});
