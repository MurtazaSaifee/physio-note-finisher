import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../features/auth/providers/AuthProvider";
import { patientsApi } from "../../features/patients/api/patientsApi";
import { useCopyForward } from "../../features/patients/hooks/useCopyForward";

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
    throw new Error("Failed to render hook");
  }

  return {
    get current(): T {
      if (latestResult === undefined) {
        throw new Error("Hook result not ready");
      }
      return latestResult;
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
});

describe("copy-forward hook", () => {
  it("posts the copy-forward scaffold with bearer auth", async () => {
    const scaffold = {
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan", "carryForwardContext"] as const,
      priorPlan: "Plan",
      carryForwardContext: "Context",
      sourceSessionDate: "2026-04-17T12:34:56.000Z",
    };

    const apiSpy = vi
      .spyOn(patientsApi, "copyForwardFromSession")
      .mockResolvedValue(scaffold);

    const hook = await renderHook(() => useCopyForward());

    let result: typeof scaffold | undefined;
    await act(async () => {
      result = await hook.current.copyForward({
        patientId: "patient-1",
        sessionId: "session-1",
        selectedSections: ["priorPlan", "carryForwardContext"],
      });
    });

    expect(apiSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "session-1",
      { selectedSections: ["priorPlan", "carryForwardContext"] },
    );
    expect(result).toEqual(scaffold);

    await hook.cleanup();
  });

  it("rejects empty selected sections before calling the API", async () => {
    const apiSpy = vi.spyOn(patientsApi, "copyForwardFromSession");
    const hook = await renderHook(() => useCopyForward());

    await expect(
      hook.current.copyForward({
        patientId: "patient-1",
        sessionId: "session-1",
        selectedSections: [],
      }),
    ).rejects.toThrow(/Select at least one section/i);

    expect(apiSpy).not.toHaveBeenCalled();

    await hook.cleanup();
  });
});
