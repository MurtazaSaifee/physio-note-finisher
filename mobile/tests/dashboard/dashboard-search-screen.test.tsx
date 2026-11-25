import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
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
        visitType: "follow-up",
        noteStatus: "draft",
        templateKey: "post-op-knee",
        finalNote: "Knee mobility improved.",
        patientSummary: "Continue exercises at home.",
        conditionTags: ["knee"],
      },
      {
        sessionId: "session-2",
        patientId: "patient-2",
        patientName: "Grace Hopper",
        sessionDate: "2026-04-25T09:00:00.000Z",
        visitType: "reassessment",
        noteStatus: "finalized",
        templateKey: null,
        finalNote: "Spine alignment stable.",
        patientSummary: "Maintain posture awareness.",
        conditionTags: ["spine"],
      },
    ],
    filters: {
      noteStatus: "all",
      search: "",
      page: 1,
      pageSize: 10,
    },
    page: 1,
    pageSize: 10,
    total: 12,
    totalPages: 2,
  },
  isLoading: false,
}));

vi.mock("../../features/dashboard/hooks/useDashboard.js", () => ({
  useDashboard: vi.fn(() => dashboardHookState),
}));

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    status: "authenticated" as const,
    runProtectedAction: vi.fn((fn: (token: string) => Promise<unknown>) => fn("test-token")),
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { DashboardScreen } from "../../features/dashboard/screens/DashboardScreen";
import { useDashboard } from "../../features/dashboard/hooks/useDashboard";

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

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("dashboard server-backed search and pagination", () => {
  it("requests the first page with a fixed page size of 10 by default", async () => {

    await act(async () => {
      TestRenderer.create(
        renderDashboard(
          <DashboardScreen
            onStartNewSession={() => undefined}
            onOpenSession={() => undefined}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(useDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteStatus: "all",
        page: 1,
        pageSize: 10,
        search: "",
      }),
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it("passes the debounced search query to the dashboard hook instead of filtering locally", async () => {
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

    const searchInput = renderer?.root.findByProps({
      testID: "dashboard-search-input",
    });

    await act(async () => {
      searchInput?.props.onChangeText("Grace");
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(useDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteStatus: "all",
        page: 1,
        pageSize: 10,
        search: "Grace",
      }),
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it("moves to the next page via the pager controls", async () => {
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

    const nextButton = renderer?.root.findByProps({
      testID: "dashboard-pagination-next-button",
    });

    await act(async () => {
      nextButton?.props.onPress();
      await Promise.resolve();
    });

    expect(useDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteStatus: "all",
        page: 2,
        pageSize: 10,
        search: "",
      }),
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it("resets back to page 1 when the status filter changes", async () => {
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

    const nextButton = renderer?.root.findByProps({
      testID: "dashboard-pagination-next-button",
    });

    await act(async () => {
      nextButton?.props.onPress();
      await Promise.resolve();
    });

    const finalizedChip = renderer?.root.findByProps({
      testID: "dashboard-filter-finalized-chip",
    });

    await act(async () => {
      finalizedChip?.props.onPress();
      await Promise.resolve();
    });

    expect(useDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        noteStatus: "finalized",
        page: 1,
        pageSize: 10,
        search: "",
      }),
      expect.objectContaining({
        enabled: true,
      }),
    );
  });
});
