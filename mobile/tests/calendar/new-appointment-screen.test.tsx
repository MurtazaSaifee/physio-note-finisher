import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.TZ = "Asia/Kolkata";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: "DateTimePicker",
}));

const patientDirectory = [
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
    archivedAt: null,
    createdAt: "2026-04-17T09:00:00.000Z",
    updatedAt: "2026-04-17T09:00:00.000Z",
  },
];

const patientListState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

const patientListMock = vi.fn(
  ({ query }: { query?: string } = {}) => {
    const normalized = query?.trim().toLowerCase() ?? "";
    const items =
      normalized.length === 0
        ? patientDirectory
        : patientDirectory.filter((patient) =>
            patient.fullName.toLowerCase().includes(normalized),
          );

    return {
      data: { items },
      isLoading: patientListState.isLoading,
      isError: patientListState.isError,
      refetch: patientListState.refetch,
    };
  },
);

const createMutationState = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  error: null as Error | null,
  mutateAsync: vi.fn(async () => ({
    id: "appt-new",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Ada Lovelace",
    scheduledAt: "2026-04-30T10:00:00.000Z",
    durationMinutes: 30,
    status: "upcoming",
    linkedSessionId: null,
    reminderText: "",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-30T08:00:00.000Z",
    updatedAt: "2026-04-30T08:00:00.000Z",
  })),
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePatientList: (...args: unknown[]) => patientListMock(...args),
}));

vi.mock("../../features/appointments/hooks/useAppointments.js", () => ({
  useCreateAppointment: vi.fn(() => createMutationState),
}));

import { NewAppointmentScreen } from "../../features/appointments/screens/NewAppointmentScreen";

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
  vi.clearAllMocks();
  patientListState.isLoading = false;
  patientListState.isError = false;
  createMutationState.isError = false;
  createMutationState.error = null;
});

describe("new appointment screen", () => {
  it("renders the patient search plus scheduling fields on first load", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("New Appointment");
    expect(text).toContain("Patient");
    expect(text).toContain("Date");
    expect(text).toContain("Time");
    expect(text).toContain("Duration");
    expect(text).toContain("Create Appointment");
    expect(text).toContain("Select a patient to create an appointment.");
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-create-guidance" }),
    ).toBeTruthy();
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-create-button" }).props.disabled,
    ).toBe(true);
    expect(renderer?.root.findByProps({ testID: "new-appointment-patient-search-input" })).toBeTruthy();
  });

  it("exposes the selected duration choice to accessibility services", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen onBack={() => undefined} onCreated={() => undefined} />,
      );
      await Promise.resolve();
    });

    expect(
      renderer?.root.findByProps({ testID: "new-appointment-duration-30-chip" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-duration-15-chip" }).props.accessibilityState,
    ).toEqual({ selected: false });

    await act(async () => {
      renderer?.root.findByProps({ testID: "new-appointment-duration-45-chip" }).props.onPress();
      await Promise.resolve();
    });

    expect(
      renderer?.root.findByProps({ testID: "new-appointment-duration-45-chip" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-duration-30-chip" }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it("shows a loading state while patient lookup is in progress", async () => {
    patientListState.isLoading = true;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const searchInput = renderer?.root.findByProps({
      testID: "new-appointment-patient-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain("Searching patients...");
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-patient-loading-state" }),
    ).toBeTruthy();
    expect(() =>
      renderer?.root.findByProps({ testID: "new-appointment-patient-empty-state" }),
    ).toThrow();
  });

  it("shows an empty state for a successful lookup with no matches", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const searchInput = renderer?.root.findByProps({
      testID: "new-appointment-patient-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Unknown");
      await Promise.resolve();
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain("No matching patients");
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-patient-empty-state" }),
    ).toBeTruthy();
    expect(() =>
      renderer?.root.findByProps({ testID: "new-appointment-patient-retry-button" }),
    ).toThrow();
  });

  it("shows a patient lookup error with a visible retry action", async () => {
    patientListState.isError = true;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const searchInput = renderer?.root.findByProps({
      testID: "new-appointment-patient-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("We couldn't search patients.");
    expect(text).toContain("Check your connection and try again.");
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-patient-error-state" }),
    ).toBeTruthy();
    expect(() =>
      renderer?.root.findByProps({ testID: "new-appointment-patient-empty-state" }),
    ).toThrow();
    expect(() =>
      renderer?.root.findByProps({ testID: "new-appointment-patient-0-card" }),
    ).toThrow();

    await act(async () => {
      renderer?.root.findByProps({ testID: "new-appointment-patient-retry-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(patientListState.refetch).toHaveBeenCalledOnce();
  });

  it("shows a visible recovery message when appointment creation fails", async () => {
    createMutationState.isError = true;
    createMutationState.error = new Error("Request failed");
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          prefillPatientId="patient-1"
          prefillPatientName="Ada Lovelace"
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("We couldn't create the appointment.");
    expect(text).toContain("Check your connection and try again.");
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-create-error" }),
    ).toBeTruthy();
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-create-button" }).props.disabled,
    ).toBe(false);
  });

  it("passes the search query into the patient list hook", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const searchInput = renderer?.root.findByProps({
      testID: "new-appointment-patient-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    expect(patientListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "Grace" }),
    );
  });

  it("pins the selected patient above the rest of the form", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const searchInput = renderer?.root.findByProps({
      testID: "new-appointment-patient-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    const patientCard = renderer?.root.findByProps({
      testID: "new-appointment-patient-0-card",
    });

    await act(async () => {
      patientCard?.props.onPress();
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Selected patient");
    expect(text).toContain("Grace Hopper");
    expect(renderer?.root.findByProps({ testID: "new-appointment-selected-patient-card" })).toBeTruthy();
    expect(
      renderer?.root.findByProps({ testID: "new-appointment-change-patient-button" }),
    ).toBeTruthy();
  });

  it("skips the search picker and shows the pinned patient when prefilled", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          prefillPatientId="patient-1"
          prefillPatientName="Ada Lovelace"
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Selected patient");
    expect(text).toContain("Ada Lovelace");
    expect(() =>
      renderer?.root.findByProps({ testID: "new-appointment-patient-search-input" }),
    ).toThrow();
  });

  it("shows a human-readable date without changing the picker value", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          prefillScheduledAt="2026-04-30T10:30:00.000Z"
          prefillPatientId="patient-1"
          prefillPatientName="Ada Lovelace"
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Apr 30, 2026");
    expect(text).not.toContain("2026-04-30");

    await act(async () => {
      renderer?.root.findByProps({ testID: "new-appointment-date-picker" }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer?.root.findByType("DateTimePicker").props.value).toEqual(
      new Date(2026, 3, 30),
    );
    expect(renderer?.root.findByType("DateTimePicker").props.value.getHours()).toBe(0);
  });

  it("preserves the previous time value when the Android picker is dismissed", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          prefillScheduledAt="2026-04-30T10:30:00.000Z"
          prefillPatientId="patient-1"
          prefillPatientName="Ada Lovelace"
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const openTimePicker = renderer?.root.findByProps({
      testID: "new-appointment-time-picker",
    });

    await act(async () => {
      openTimePicker?.props.onPress();
      await Promise.resolve();
    });

    const timePicker = renderer?.root.findByType("DateTimePicker");

    await act(async () => {
      timePicker?.props.onChange({ type: "dismissed" }, undefined);
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("16:00");
    expect(() => renderer?.root.findByType("DateTimePicker")).toThrow();
  });

  it("keeps a picked time as local wall-clock time in the request", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <NewAppointmentScreen
          prefillScheduledAt="2026-04-30T10:30:00.000Z"
          prefillPatientId="patient-1"
          prefillPatientName="Ada Lovelace"
          onBack={() => undefined}
          onCreated={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      renderer?.root.findByProps({ testID: "new-appointment-time-picker" }).props.onPress();
      await Promise.resolve();
    });

    const timePicker = renderer?.root.findByType("DateTimePicker");
    await act(async () => {
      timePicker?.props.onChange({ type: "set" }, new Date(2000, 0, 1, 16, 45));
      await Promise.resolve();
    });

    expect(collectText(renderer?.toJSON() ?? null)).toContain("16:45");

    await act(async () => {
      renderer?.root.findByProps({ testID: "new-appointment-create-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(createMutationState.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledAt: "2026-04-30T16:45:00+05:30",
      }),
    );
  });
});
