import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const dashboardHookState = vi.hoisted(() => ({
  data: {
    upcoming: {
      label: "Upcoming",
      body: "Appointment details will appear here when calendar scheduling is available.",
    },
    recentSessions: [
      {
        sessionId: "session-1",
        patientId: "patient-1",
        patientName: "Ada Lovelace",
        sessionDate: "2026-04-26T09:00:00.000Z",
        noteStatus: "draft",
        templateKey: "post-op-knee",
      },
      {
        sessionId: "session-2",
        patientId: "patient-2",
        patientName: "Grace Hopper",
        sessionDate: "2026-04-25T09:00:00.000Z",
        noteStatus: "finalized",
        templateKey: null,
      },
    ],
    filters: {
      date: "2026-04-26",
      patientId: "",
      noteStatus: "all",
      search: "",
      page: 1,
      pageSize: 10,
    },
    page: 1,
    pageSize: 10,
    total: 2,
    totalPages: 1,
  },
  isLoading: false,
}));

const dashboardWithAppointment = vi.hoisted(() => ({
  data: {
    upcoming: {
      label: "Upcoming",
      appointmentId: "appt-1",
      patientName: "Ada Lovelace",
      scheduledAt: "2026-04-30T09:00:00.000Z",
      durationMinutes: 30,
      visitType: "Follow-up",
    },
    recentSessions: [
      {
        sessionId: "session-1",
        patientId: "patient-1",
        patientName: "Ada Lovelace",
        sessionDate: "2026-04-26T09:00:00.000Z",
        noteStatus: "draft",
        templateKey: "post-op-knee",
      },
    ],
    filters: {
      date: "2026-04-26",
      patientId: "",
      noteStatus: "all",
      search: "",
      page: 1,
      pageSize: 10,
    },
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  },
  isLoading: false,
}));

vi.mock("../../features/dashboard/hooks/useDashboard.js", () => ({
  useDashboard: vi.fn(() => dashboardHookState),
}));

vi.mock("../../features/offline/hooks/useSyncStatus.js", () => ({
  useItemSyncStatus: vi.fn(() => "idle"),
}));

import { DashboardScreen } from "../../features/dashboard/screens/DashboardScreen";

function renderDashboard(element: React.ReactElement): React.ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      {element}
    </QueryClientProvider>
  );
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

  const children = node.children ?? [];

  return children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("dashboard screen", () => {
  it("renders Clinical Dashboard, upcoming, filters, and action labels", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Clinical Dashboard");
    expect(text).toContain("Upcoming");
    expect(text).toContain("Past Sessions");
    expect(text).toContain("All");
    expect(text).toContain("Draft");
    expect(text).toContain("Finalized");
    expect(text).toContain("Continue Note");
    expect(text).toContain("View Note");
    expect(text).toContain("1-2 of 2");
  });

  it("removes the dead upcoming review CTA when there is no appointment to review", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Nothing to review yet");
    expect(renderer?.root.findAllByProps({ testID: "dashboard-review-upcoming-button" })).toHaveLength(0);
  });

  it("renders real upcoming appointment data when available", async () => {
    const { useDashboard } = await import("../../features/dashboard/hooks/useDashboard.js");
    (useDashboard as ReturnType<typeof vi.fn>).mockReturnValue(dashboardWithAppointment);

    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Follow-up");
    expect(text).not.toContain("Appointment details will appear here when calendar scheduling is available.");
  });

  it("uses a top-level create session button and omits duplicate settings gear", async () => {
    const onStartNewSession = vi.fn();

    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={onStartNewSession}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(renderer?.root.findAllByProps({ testID: "dashboard-settings-button" })).toHaveLength(0);
    expect(collectText(renderer?.toJSON() ?? null)).not.toContain("JD");
    renderer?.root.findByProps({ testID: "dashboard-create-session-button" }).props.onPress();

    expect(onStartNewSession).toHaveBeenCalledTimes(1);
  });

  it("renders simple pager controls for past sessions", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(renderer?.root.findByProps({ testID: "dashboard-page-summary" })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: "dashboard-pagination-previous-button" })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: "dashboard-pagination-next-button" })).toBeTruthy();
  });

  it("exposes a testID for an upcoming appointment review", async () => {
    const { useDashboard } = await import("../../features/dashboard/hooks/useDashboard.js");
    (useDashboard as ReturnType<typeof vi.fn>).mockReturnValue(dashboardWithAppointment);

    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
            onOpenAppointment={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(renderer?.root.findByProps({ testID: "dashboard-review-upcoming-button" })).toBeTruthy();
  });

});
