import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patientList = vi.hoisted(() => ({
  items: [
    {
      id: "patient-ada",
      fullName: "Ada Lovelace",
      dateOfBirth: "1990-01-23",
      sex: "female" as const,
      phone: "555-0101",
      email: "ada@example.com",
      addressLine: null,
      conditionTags: [],
      lastVisitDate: "2026-07-13T14:00:00.000Z",
      unfinishedNoteCount: 1,
      recentSessionStatus: "draft" as const,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-13T14:00:00.000Z",
    },
    {
      id: "patient-grace",
      fullName: "Grace Hopper",
      dateOfBirth: null,
      sex: "female" as const,
      phone: "555-0199",
      email: "grace@example.com",
      addressLine: null,
      conditionTags: [],
      lastVisitDate: "2026-07-10T14:00:00.000Z",
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: "2026-07-14T10:00:00.000Z",
      archivedAt: null,
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-10T14:00:00.000Z",
    },
  ],
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  ScrollView: "ScrollView",
  Pressable: "Pressable",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock("lucide-react-native", () => ({
  ChevronRight: "ChevronRight",
  Plus: "Plus",
  SlidersHorizontal: "SlidersHorizontal",
  X: "X",
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => ({
    data: { items: patientList.items },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

import { PatientListScreen } from "../../features/patients/screens/PatientListScreen";

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  return (node.children ?? [])
    .map((child) => typeof child === "string" ? child : collectText(child))
    .join(" ");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("hybrid patient landing screen", () => {
  it("prioritises unfinished notes before the next appointment and hides filters by default", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(<PatientListScreen onAddPatient={vi.fn()} onOpenPatient={vi.fn()} />);
      await Promise.resolve();
    });

    const firstWorkItem = renderer?.root.findByProps({ testID: "patient-list-work-item-0-card" });
    const secondWorkItem = renderer?.root.findByProps({ testID: "patient-list-work-item-1-card" });

    expect(firstWorkItem?.props.accessibilityLabel).toContain("Ada Lovelace");
    expect(firstWorkItem?.props.accessibilityLabel).toContain("unfinished note");
    expect(secondWorkItem?.props.accessibilityLabel).toContain("Grace Hopper");
    expect(secondWorkItem?.props.accessibilityLabel).toContain("next appointment");
    expect(renderer?.root.findByProps({ testID: "patient-list-filter-button" })).toBeTruthy();
    expect(() => renderer?.root.findByProps({ testID: "patient-list-filter-panel" })).toThrow();
  });

  it("shows search feedback before applying the debounced patient query", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(<PatientListScreen onAddPatient={vi.fn()} onOpenPatient={vi.fn()} />);
      await Promise.resolve();
    });

    const search = renderer?.root.findByProps({ testID: "patient-list-search-input" });
    await act(async () => {
      search?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain("Updating patients...");
    expect(renderer?.root.findByProps({ testID: "patient-list-search-status" }).props.accessibilityLiveRegion).toBe("polite");
  });

  it("opens the dedicated patient-creation task from the header action", async () => {
    const onAddPatient = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(<PatientListScreen onAddPatient={onAddPatient} onOpenPatient={vi.fn()} />);
      await Promise.resolve();
    });

    const addButton = renderer?.root.findByProps({ testID: "patient-list-add-patient-button" });
    await act(async () => {
      addButton?.props.onPress();
      await Promise.resolve();
    });

    expect(onAddPatient).toHaveBeenCalledOnce();
    expect(() => renderer?.root.findByProps({ testID: "patient-list-add-patient-form" })).toThrow();
  });
});
