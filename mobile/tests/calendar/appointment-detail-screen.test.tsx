import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const upcomingDetail = vi.hoisted(() => ({
  data: {
    id: "appt-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Ada Lovelace",
    scheduledAt: "2026-04-30T09:00:00.000Z",
    durationMinutes: 30,
    status: "upcoming",
    linkedSessionId: null,
    reminderText: "You have an appointment with Ada Lovelace on Apr 30, 2026 at 09:00 AM.",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-29T10:00:00.000Z",
    updatedAt: "2026-04-29T10:00:00.000Z",
  },
  isLoading: false,
}));

const completedDetail = vi.hoisted(() => ({
  data: {
    id: "appt-2",
    clinicId: "clinic-1",
    patientId: "patient-2",
    patientName: "Grace Hopper",
    scheduledAt: "2026-04-29T14:00:00.000Z",
    durationMinutes: 45,
    status: "completed",
    linkedSessionId: "session-1",
    reminderText: "",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:00:00.000Z",
  },
  isLoading: false,
}));

const cancelledDetail = vi.hoisted(() => ({
  data: {
    id: "appt-3",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Ada Lovelace",
    scheduledAt: "2026-04-28T10:00:00.000Z",
    durationMinutes: 30,
    status: "cancelled",
    linkedSessionId: null,
    reminderText: "",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-27T10:00:00.000Z",
    updatedAt: "2026-04-27T10:00:00.000Z",
  },
  isLoading: false,
}));

const farFutureDetail = vi.hoisted(() => ({
  data: {
    id: "appt-4",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Ada Lovelace",
    scheduledAt: "2026-05-01T09:00:00.000Z",
    durationMinutes: 30,
    status: "upcoming",
    linkedSessionId: null,
    reminderText: "You have an appointment with Ada Lovelace on May 1, 2026 at 9:00 AM.",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-27T10:00:00.000Z",
    updatedAt: "2026-04-27T10:00:00.000Z",
  },
  isLoading: false,
}));

const detailRefetch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const cancelMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(upcomingDetail.data));

vi.mock("../../features/appointments/hooks/useAppointments.js", () => ({
  useAppointmentDetail: vi.fn((appointmentId?: string) => {
    if (appointmentId === "appt-2") return { ...completedDetail, refetch: detailRefetch };
    if (appointmentId === "appt-3") return { ...cancelledDetail, refetch: detailRefetch };
    if (appointmentId === "appt-4") return { ...farFutureDetail, refetch: detailRefetch };
    return { ...upcomingDetail, refetch: detailRefetch };
  }),
  useStartSessionFromAppointment: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({
      appointmentId: "appt-1",
      sessionId: "session-new",
      patientId: "patient-1",
      linkedSessionId: "session-new",
    }),
    isPending: false,
  })),
  useCancelAppointment: vi.fn(() => ({
    mutateAsync: cancelMutateAsync,
    isPending: false,
  })),
}));

const meridianButtonCalls: Array<{
  label: string;
  disabled?: boolean;
  accessibilityHint?: string;
  onPress?: () => void;
}> = [];

vi.mock("../../features/ui/meridian/primitives.js", () => ({
  MeridianButton: vi.fn(({
    label,
    disabled,
    accessibilityHint,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    accessibilityHint?: string;
    onPress?: () => void;
  }) => {
    meridianButtonCalls.push({ label, disabled, accessibilityHint, onPress });
    return React.createElement("Pressable", { disabled, onPress, accessibilityLabel: label }, label);
  }),
  MeridianCard: vi.fn(({ children }: { children: React.ReactNode }) => React.createElement("View", null, children)),
}));

import { AppointmentDetailScreen } from "../../features/appointments/screens/AppointmentDetailScreen";

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
  vi.useRealTimers();
  detailRefetch.mockClear();
  cancelMutateAsync.mockClear();
});

describe("appointment detail screen", () => {
  it("renders patient name, time, and status for an upcoming appointment", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Date and time");
    expect(text).toContain("Scheduled");
    expect(text).toContain("30 min");
  });

  it("uses plain status copy before presenting the appointment proceed action", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Scheduled");
    expect(text).not.toContain("upcoming");
    expect(meridianButtonCalls.some((call) => call.label === "Start Session")).toBe(true);
  });

  it("shows Start Session only for upcoming appointments", async () => {
    let upcomingRenderer: TestRenderer.ReactTestRenderer | undefined;
    let completedRenderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      upcomingRenderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      completedRenderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-2"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const upcomingText = collectText(upcomingRenderer?.toJSON() ?? null);
    const completedText = collectText(completedRenderer?.toJSON() ?? null);

    expect(upcomingText).toContain("Start Session");
    expect(completedText).not.toContain("Start Session");
  });

  it("does not show Start Session for cancelled appointments", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-3"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).not.toContain("Start Session");
    expect(text).toContain("Cancelled");
  });

  it("keeps appointment actions limited to session and cancellation", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Cancel Appointment");
    expect(text).not.toContain("Reminder");
    expect(text).not.toContain("Copy to clipboard");
  });

  it("requires confirmation before cancelling an appointment", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const cancelButton = renderer?.root.findByProps({
      testID: "appointment-detail-cancel-button",
    });

    await act(async () => {
      cancelButton?.props.onPress();
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Cancel this appointment?");
    expect(text).toContain("Yes, Cancel Appointment");
    expect(text).toContain("Keep Appointment");
    expect(cancelMutateAsync).not.toHaveBeenCalled();
  });

  it("cancels only after the confirmation action is pressed", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const cancelButton = renderer?.root.findByProps({
      testID: "appointment-detail-cancel-button",
    });

    await act(async () => {
      cancelButton?.props.onPress();
      await Promise.resolve();
    });

    const confirmButton = renderer?.root.findByProps({
      testID: "appointment-detail-confirm-cancel-button",
    });

    await act(async () => {
      await confirmButton?.props.onPress();
      await Promise.resolve();
    });

    expect(cancelMutateAsync).toHaveBeenCalledWith("appt-1");
    expect(detailRefetch).toHaveBeenCalledTimes(1);
  });

  it("explains why Start Session is unavailable more than one hour before the visit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-30T08:00:00.000Z"));
    meridianButtonCalls.length = 0;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-4"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const startSessionButton = meridianButtonCalls.find((c) => c.label === "Start Session");
    expect(startSessionButton).toBeDefined();
    expect(startSessionButton?.disabled).toBe(true);
    expect(startSessionButton?.accessibilityHint).toBe(
      "Start Session becomes available one hour before this visit.",
    );
    expect(collectText(renderer?.toJSON() ?? null)).toContain(
      "Start Session becomes available one hour before this visit.",
    );
  });

  it("fires onStartSession when Start Session is pressed for a near upcoming appointment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-30T08:30:00.000Z"));
    const onStartSession = vi.fn();
    meridianButtonCalls.length = 0;
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={onStartSession}
        />,
      );
      await Promise.resolve();
    });

    const startSessionButton = meridianButtonCalls.find((c) => c.label === "Start Session");
    expect(startSessionButton).toBeDefined();
    expect(startSessionButton?.disabled).toBe(false);
    expect(startSessionButton?.accessibilityHint).toBeUndefined();
    expect(collectText(renderer?.toJSON() ?? null)).not.toContain(
      "Start Session becomes available one hour before this visit.",
    );

    await act(async () => {
      startSessionButton?.onPress?.();
      await Promise.resolve();
    });

    expect(onStartSession).toHaveBeenCalledTimes(1);
  });

  it("uses the scheduled visit time as the only time shown in appointment detail", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).not.toContain("Reminder");
    expect(text).not.toContain("You have an appointment with Ada Lovelace on Apr 30, 2026 at 09:00 AM.");
  });

  it("does not expose a reminder share action", async () => {
    meridianButtonCalls.length = 0;

    await act(async () => {
      TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(meridianButtonCalls.find((c) => c.label === "Share Reminder")).toBeUndefined();
  });

  it("does not expose clipboard fallback when reminder text exists", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-1"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).not.toContain("Copy to clipboard");
  });

  it("does not expose reminder controls when an appointment lacks reminder text", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppointmentDetailScreen
          appointmentId="appt-2"
          onBack={() => undefined}
          onStartSession={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).not.toContain("Share Reminder");
    expect(text).not.toContain("Copy to clipboard");
  });
});
