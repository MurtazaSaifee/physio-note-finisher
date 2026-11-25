import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listMode = vi.hoisted(() => ({
  current: "active" as "active" | "loading" | "error",
  errorRefetch: vi.fn(),
}));

const patients = vi.hoisted(() => ([
  {
    id: "patient-1",
    fullName: "Ada Lovelace",
    dateOfBirth: "1990-01-23",
    sex: "female",
    phone: "555-0101",
    email: "ada@example.com",
    addressLine: "1 Circuit Lane",
    conditionTags: ["spine"],
    lastVisitDate: "2026-07-13T08:00:00.000Z",
    unfinishedNoteCount: 1,
    recentSessionStatus: "draft",
    nextAppointment: null,
    archivedAt: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
  },
  {
    id: "patient-2",
    fullName: "Grace Hopper",
    dateOfBirth: null,
    sex: "female",
    phone: "555-0199",
    email: "grace@example.com",
    addressLine: "2 Compiler Way",
    conditionTags: ["knee"],
    lastVisitDate: "2026-07-10T08:00:00.000Z",
    unfinishedNoteCount: 0,
    recentSessionStatus: null,
    nextAppointment: "2026-07-14T10:00:00.000Z",
    archivedAt: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "patient-3",
    fullName: "Alan Turing",
    dateOfBirth: "1912-06-23",
    sex: "male",
    phone: "555-0234",
    email: "alan@example.com",
    addressLine: "3 Enigma Road",
    conditionTags: ["hip"],
    lastVisitDate: "2026-07-09T08:00:00.000Z",
    unfinishedNoteCount: 0,
    recentSessionStatus: "finalized",
    nextAppointment: null,
    archivedAt: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-09T10:00:00.000Z",
  },
]));

const listItems = vi.hoisted(() => ({ current: patients }));

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

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: vi.fn(() => {
    if (listMode.current === "loading") {
      return { data: undefined, isLoading: true, isError: false, refetch: listMode.errorRefetch };
    }
    if (listMode.current === "error") {
      return { data: undefined, isLoading: false, isError: true, refetch: listMode.errorRefetch };
    }
    return { data: { items: listItems.current }, isLoading: false, isError: false, refetch: listMode.errorRefetch };
  }),
}));

import { PatientListScreen } from "../../features/patients/screens/PatientListScreen";

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  return (node.children ?? []).map((child) => typeof child === "string" ? child : collectText(child)).join(" ");
}

async function renderPatients(onOpenPatient = vi.fn()): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(<PatientListScreen onAddPatient={vi.fn()} onOpenPatient={onOpenPatient} />);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Patient list did not render");
  return renderer;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T09:00:00.000Z"));
});

afterEach(() => {
  listMode.current = "active";
  listItems.current = patients;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("patient list search", () => {
  it("keeps archive and letter filters hidden until Filters is opened", async () => {
    const renderer = await renderPatients();

    expect(() => renderer.root.findByProps({ testID: "patient-list-filter-panel" })).toThrow();
    const filterButton = renderer.root.findByProps({ testID: "patient-list-filter-button" });
    expect(filterButton.props.accessibilityState).toMatchObject({ expanded: false });

    await act(async () => {
      filterButton.props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: "patient-list-filter-panel" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "patient-list-include-archived-chip" }).props.accessibilityRole).toBe("switch");
    expect(renderer.root.findByProps({ testID: "patient-list-alpha-a-chip" })).toBeTruthy();
  });

  it("shows one clear action after a patient filter becomes active", async () => {
    const renderer = await renderPatients();
    const filterButton = renderer.root.findByProps({ testID: "patient-list-filter-button" });
    await act(async () => {
      filterButton.props.onPress();
      await Promise.resolve();
    });

    const aChip = renderer.root.findByProps({ testID: "patient-list-alpha-a-chip" });
    await act(async () => {
      aChip.props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: "patient-list-clear-filters-button" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "patient-list-patient-0-card" }).props.accessibilityLabel).toContain("Ada Lovelace");
    expect(renderer.root.findByProps({ testID: "patient-list-patient-1-card" }).props.accessibilityLabel).toContain("Alan Turing");

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-list-clear-filters-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(() => renderer.root.findByProps({ testID: "patient-list-clear-filters-button" })).toThrow();
  });

  it("uses one patient row action with safe disambiguation and no redundant profile link", async () => {
    const onOpenPatient = vi.fn();
    const renderer = await renderPatients(onOpenPatient);
    const row = renderer.root.findByProps({ testID: "patient-list-patient-0-card" });

    expect(row.props.accessibilityLabel).toContain("Open patient record for Ada Lovelace");
    expect(row.props.accessibilityLabel).toContain("Born Jan 23, 1990");
    expect(collectText(renderer.toJSON())).toContain("Unfinished note");
    expect(collectText(renderer.toJSON())).not.toContain("Open profile");

    act(() => row.props.onPress());
    expect(onOpenPatient).toHaveBeenCalledWith("patient-1");
  });

  it("uses singular and plural grammar for unfinished note work items", async () => {
    const singularRenderer = await renderPatients();
    expect(collectText(singularRenderer.toJSON())).toContain("1 note still needs attention");

    listItems.current = patients.map((patient) => patient.id === "patient-1"
      ? { ...patient, unfinishedNoteCount: 2 }
      : patient,
    );
    const pluralRenderer = await renderPatients();

    expect(collectText(pluralRenderer.toJSON())).toContain("2 notes still need attention");
  });

  it("supports a clear search action and filters name, phone, and email after debounce", async () => {
    const renderer = await renderPatients();
    const search = renderer.root.findByProps({ testID: "patient-list-search-input" });

    await act(async () => {
      search.props.onChangeText("555-0199");
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ testID: "patient-list-clear-search-button" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(350));

    expect(renderer.root.findByProps({ testID: "patient-list-patient-0-card" }).props.accessibilityLabel).toContain("Grace Hopper");
    expect(() => renderer.root.findByProps({ testID: "patient-list-patient-1-card" })).toThrow();

    await act(async () => {
      renderer.root.findByProps({ testID: "patient-list-clear-search-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(() => renderer.root.findByProps({ testID: "patient-list-clear-search-button" })).toThrow();
  });

  it("omits Today when there is no unfinished note or future appointment", async () => {
    listItems.current = patients.map((patient) => ({
      ...patient,
      unfinishedNoteCount: 0,
      nextAppointment: null,
    }));
    const renderer = await renderPatients();

    expect(collectText(renderer.toJSON())).not.toContain("Today");
    expect(() => renderer.root.findByProps({ testID: "patient-list-work-item-0-card" })).toThrow();
  });

  it("keeps the list keyboard-safe and exposes the header Add action", async () => {
    const renderer = await renderPatients();
    const scrollView = renderer.root.findAllByType("ScrollView")[0];
    const contentStyle = scrollView.props.contentContainerStyle;

    expect(contentStyle.paddingBottom).toBeGreaterThanOrEqual(112);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.keyboardDismissMode).toBe("on-drag");
    expect(renderer.root.findByProps({ testID: "patient-list-add-patient-button" }).props.accessibilityLabel).toBe("Add patient");
  });

  it("shows an actionable load error instead of an empty directory", async () => {
    listMode.current = "error";
    const renderer = await renderPatients();

    expect(collectText(renderer.toJSON())).toContain("We could not load patients");
    await act(async () => {
      renderer.root.findByProps({ testID: "patient-list-retry-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(listMode.errorRefetch).toHaveBeenCalledOnce();
  });
});
