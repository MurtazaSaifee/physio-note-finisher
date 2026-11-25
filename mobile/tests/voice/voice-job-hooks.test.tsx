import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../features/auth/providers/AuthProvider";
import {
  useRetryVoiceJob,
  useVoiceJobStatus,
  voiceJobStatusQueryKey,
} from "../../features/voice/hooks/useVoiceJobs";

vi.mock("../../features/auth/providers/AuthProvider.js", () => ({
  useAuth: vi.fn(),
}));

const authState = {
  status: "authenticated" as const,
  runProtectedAction: async <T,>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> => request("access-token"),
};

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

async function renderHook<T>(callback: () => T) {
  let latestResult: T | undefined;
  const queryClient = createQueryClient();

  function TestHarness(): React.JSX.Element {
    latestResult = callback();
    return <></>;
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <TestHarness />
      </QueryClientProvider>,
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
    queryClient,
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

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authState);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("voice job hooks", () => {
  it("uses stable query key and stops polling on terminal status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: "job-1",
            status: "processing",
            attempt: 1,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: "job-1",
            status: "succeeded",
            attempt: 1,
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    expect(voiceJobStatusQueryKey("job-1")).toEqual(["voice", "job", "job-1"]);

    const hook = await renderHook(() => useVoiceJobStatus("clinic-1", "job-1"));
    await hook.flush();

    expect(hook.current.data?.status).toBe("processing");
    expect(hook.current.refetchInterval).toBe(1500);

    await hook.current.refetch();
    await hook.flush();

    expect(hook.current.data?.status).toBe("succeeded");
    expect(hook.current.refetchInterval).toBe(false);

    await hook.cleanup();
    vi.unstubAllGlobals();
  });

  it("invalidates status query when retry mutation succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jobId: "job-1",
          status: "queued",
          attempt: 2,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const hook = await renderHook(() => useRetryVoiceJob("clinic-1"));
    const invalidateSpy = vi.spyOn(hook.queryClient, "invalidateQueries");

    await act(async () => {
      await hook.current.retryVoiceJob({ jobId: "job-1" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: voiceJobStatusQueryKey("job-1"),
    });

    await hook.cleanup();
    vi.unstubAllGlobals();
  });
});
