import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("../../features/ui/meridian/tokens", () => ({
  meridian: {
    color: {
      primary: "#007A8A",
      surface: "#FFFFFF",
      text: "#0F172A",
      textSubtle: "#64748B",
      surfaceMuted: "#F1F5F9",
      primarySoft: "#E0F2F1",
      destructive: "#B91C1C",
      border: "#E2E8F0",
      warning: "#D97706",
    },
    spacing: { sm: 8, md: 16, lg: 24, xs: 4 },
    radius: { card: 16, chip: 12 },
    shadow: { card: {} },
  },
}));

vi.mock("../../features/ui/meridian/typography", () => ({
  typography: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: "600" },
    heading: { fontSize: 18, fontWeight: "600" },
  },
}));

vi.mock("../../features/auth/providers/AuthProvider.js", () => ({
  useAuth: vi.fn(),
}));

const authState = {
  status: "authenticated" as const,
  signIn: vi.fn(),
  applyTokens: vi.fn(),
  signOut: vi.fn(),
  restoreSession: vi.fn(),
  runProtectedAction: async <T,>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> => request("access-token"),
};

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function renderHook<T>(callback: () => T) {
  let latestResult: T | undefined;
  const queryClient = createQueryClient();

  function TestHarness(): React.JSX.Element {
    latestResult = callback();
    return React.createElement(React.Fragment);
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(TestHarness),
      ),
    );
    await Promise.resolve();
  });

  if (!renderer) {
    throw new Error("Failed to create hook renderer");
  }

  return {
    get current(): T {
      if (latestResult === undefined) {
        throw new Error("Hook result not ready");
      }
      return latestResult;
    },
    async flush(): Promise<void> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async cleanup(): Promise<void> {
      await act(async () => {
        renderer?.unmount();
      });
    },
  };
}

describe("useSyncStatus", () => {
  beforeEach(async () => {
    const { useAuth } = await import("../../features/auth/providers/AuthProvider.js");
    vi.mocked(useAuth).mockReturnValue(authState);
    const { clearQueue } = await import("../../features/offline/storage/queueStore.js");
    const { resetSyncState } = await import("../../features/offline/services/syncService.js");
    clearQueue();
    resetSyncState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns pendingCount=0 when queue is empty", async () => {
    const { useSyncStatus } = await import("../../features/offline/hooks/useSyncStatus.js");
    const hook = await renderHook(() => useSyncStatus());
    await hook.flush();

    expect(hook.current.state.pendingCount).toBe(0);
    expect(hook.current.state.status).toBe("idle");

    await hook.cleanup();
  });

  it("returns pendingCount=2 after adding two queued changes", async () => {
    const { saveQueuedChange } = await import("../../features/offline/storage/queueStore.js");
    const { useSyncStatus } = await import("../../features/offline/hooks/useSyncStatus.js");

    saveQueuedChange({
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "Pain",
        objective: "Swelling",
        assessment: "Sprain",
        plan: "RICE",
      },
      timestamp: 1000,
    });

    saveQueuedChange({
      type: "appointmentEdit",
      appointmentId: "appt-1",
      updates: { scheduledAt: "2026-05-01T09:00:00Z" },
      timestamp: 2000,
    });

    const hook = await renderHook(() => useSyncStatus());
    await hook.flush();

    expect(hook.current.state.pendingCount).toBe(2);

    await hook.cleanup();
  });

  it("returns status='syncing' during replay then 'idle' after completion", async () => {
    const { saveQueuedChange } = await import("../../features/offline/storage/queueStore.js");
    const { useSyncStatus } = await import("../../features/offline/hooks/useSyncStatus.js");

    saveQueuedChange({
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "Pain",
        objective: "Swelling",
        assessment: "Sprain",
        plan: "RICE",
      },
      timestamp: 1000,
    });

    const hook = await renderHook(() =>
      useSyncStatus({
        saveManualNote: async () => {},
        updateAppointment: async () => {},
      }),
    );
    await hook.flush();

    expect(hook.current.state.status).toBe("idle");
    expect(hook.current.state.pendingCount).toBe(1);

    // Trigger replay
    await act(async () => {
      await hook.current.triggerReplay();
    });

    expect(hook.current.state.status).toBe("idle");
    expect(hook.current.state.pendingCount).toBe(0);

    await hook.cleanup();
  });

  it("returns status='failed' after max retries exhausted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { saveQueuedChange } = await import("../../features/offline/storage/queueStore.js");
    const { useSyncStatus } = await import("../../features/offline/hooks/useSyncStatus.js");

    saveQueuedChange({
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "Pain",
        objective: "Swelling",
        assessment: "Sprain",
        plan: "RICE",
      },
      timestamp: 1000,
    });

    const hook = await renderHook(() =>
      useSyncStatus({
        saveManualNote: async () => {
          throw new Error("Network unreachable");
        },
        updateAppointment: async () => {},
      }),
    );
    await hook.flush();

    // Trigger replay - it will retry 3 times then fail
    const replayPromise = hook.current.triggerReplay();
    await vi.advanceTimersByTimeAsync(70000); // advance past all retry delays (5s + 15s + 45s)
    await replayPromise;

    expect(hook.current.state.status).toBe("failed");
    expect(hook.current.state.pendingCount).toBe(1);
    expect(hook.current.state.lastError).toContain("Network unreachable");

    await hook.cleanup();
    vi.useRealTimers();
  });
});

describe("PendingSyncPill", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Pending sync' text when syncStatus is 'pending'", async () => {
    const { PendingSyncPill } = await import("../../features/offline/components/PendingSyncPill.js");
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PendingSyncPill, { syncStatus: "pending" }),
      );
      await Promise.resolve();
    });

    const json = renderer?.toJSON();
    expect(json).not.toBeNull();

    function collectText(node: TestRenderer.ReactTestRendererJSON | null): string {
      if (!node) return "";
      if (typeof node === "string") return node;
      const children = node.children ?? [];
      return children.map((child) => (typeof child === "string" ? child : collectText(child))).join("");
    }

    expect(collectText(json ?? null)).toContain("Pending sync");
  });

  it("does not render when syncStatus is 'synced'", async () => {
    const { PendingSyncPill } = await import("../../features/offline/components/PendingSyncPill.js");
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PendingSyncPill, { syncStatus: "synced" }),
      );
      await Promise.resolve();
    });

    const json = renderer?.toJSON();
    expect(json).toBeNull();
  });
});

describe("SyncOverlay", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is visible when status is 'syncing' and shows progress text", async () => {
    const { SyncOverlay } = await import("../../features/offline/components/SyncOverlay.js");
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SyncOverlay, {
          syncState: { status: "syncing", pendingCount: 2, currentItem: 1, totalItems: 2 },
        }),
      );
      await Promise.resolve();
    });

    function collectText(node: TestRenderer.ReactTestRendererJSON | null): string {
      if (!node) return "";
      if (typeof node === "string") return node;
      const children = node.children ?? [];
      return children.map((child) => (typeof child === "string" ? child : collectText(child))).join("");
    }

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Syncing");
    expect(text).toContain("1 of 2");
  });

  it("is hidden when sync completes", async () => {
    const { SyncOverlay } = await import("../../features/offline/components/SyncOverlay.js");
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SyncOverlay, {
          syncState: { status: "idle", pendingCount: 0 },
        }),
      );
      await Promise.resolve();
    });

    const json = renderer?.toJSON();
    expect(json).toBeNull();
  });
});
