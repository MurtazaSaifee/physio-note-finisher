import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../features/auth/providers/AuthProvider";
import {
  useSyncStatus,
  useItemSyncStatus,
} from "../../features/offline/hooks/useSyncStatus";
import {
  clearQueue,
  saveQueuedChange,
} from "../../features/offline/storage/queueStore";
import { resetSyncState } from "../../features/offline/services/syncService";

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
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authState);
    clearQueue();
    resetSyncState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns pendingCount=0 when queue is empty", async () => {
    const hook = await renderHook(() => useSyncStatus());
    await hook.flush();

    expect(hook.current.state.pendingCount).toBe(0);
    expect(hook.current.state.status).toBe("idle");

    await hook.cleanup();
  });

  it("returns pendingCount>0 when items exist in queue", async () => {
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
      timestamp: Date.now(),
    });

    const hook = await renderHook(() => useSyncStatus());
    await hook.flush();

    expect(hook.current.state.pendingCount).toBe(1);

    await hook.cleanup();
  });
});

describe("useItemSyncStatus", () => {
  beforeEach(() => {
    clearQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns synced when item is not in queue", async () => {
    const hook = await renderHook(() => useItemSyncStatus("session-1"));
    await hook.flush();

    expect(hook.current).toBe("synced");

    await hook.cleanup();
  });

  it("returns pending for a session with queued note edit", async () => {
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
      timestamp: Date.now(),
    });

    const hook = await renderHook(() => useItemSyncStatus("session-1"));
    await hook.flush();

    expect(hook.current).toBe("pending");

    await hook.cleanup();
  });

  it("returns pending for an appointment with queued edit", async () => {
    saveQueuedChange({
      type: "appointmentEdit",
      appointmentId: "appt-1",
      updates: { scheduledAt: "2026-05-01T09:00:00Z" },
      timestamp: Date.now(),
    });

    const hook = await renderHook(() => useItemSyncStatus("appt-1"));
    await hook.flush();

    expect(hook.current).toBe("pending");

    await hook.cleanup();
  });
});
