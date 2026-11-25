import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ListPatientsResponse,
  PatientRecord,
} from "../../../shared/contracts/patients";
import type {
  PatientTimelineResponse,
  PriorSessionDetailResponse,
} from "../../../shared/contracts/sessions";
import { useAuth } from "../../features/auth/providers/AuthProvider";
import { patientsApi, createPatientsApi } from "../../features/patients/api/patientsApi";
import {
  patientListQueryKey,
  patientProfileQueryKey,
  patientTimelineQueryKey,
  priorSessionQueryKey,
  useCreatePatient,
  usePatientList,
} from "../../features/patients/hooks/usePatients";

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

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
    renderer,
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

function createSequentialTransport(responses: unknown[]) {
  const calls: Array<{ input: string; init: { method: string; headers: Record<string, string>; body?: string } }> = [];

  const transport = vi.fn(async (input: string, init: { method: "GET" | "POST" | "PATCH"; headers: Record<string, string>; body?: string; }): Promise<JsonResponse> => {
    calls.push({ input, init });
    const payload = responses.shift();
    if (payload === undefined) {
      throw new Error("No queued response");
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
    };
  });

  return { transport, calls };
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authState);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("patientsApi and patient hooks", () => {
  it("normalizes protected patient and timeline envelopes with bearer auth", async () => {
    const { transport, calls } = createSequentialTransport([
      {
        success: true,
        data: {
          items: [
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
          ],
          nextCursor: "patient-2",
        } satisfies ListPatientsResponse,
      },
      {
        success: true,
        data: {
          id: "patient-1",
          clinicId: "clinic-1",
          fullName: "Ada Lovelace",
          dateOfBirth: "1990-01-23",
          sex: "female",
          phone: "555-0101",
          email: "ada@example.com",
          addressLine: "1 Circuit Lane",
          clinicalNotes: "Mobility follow-up",
          conditionTags: ["spine"],
          lastVisitDate: "2026-04-16T08:00:00.000Z",
          unfinishedNoteCount: 1,
          recentSessionStatus: "finalized",
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        } satisfies PatientRecord,
      },
      {
        success: true,
        data: {
          patientId: "patient-1",
          items: [
            {
              id: "session-1",
              patientId: "patient-1",
              sessionDate: "2026-04-17T12:34:56.000Z",
              visitType: "follow-up",
              noteStatus: "finalized",
              finalNotePreview: "Summary",
              patientSummaryPreview: "Plan",
            },
          ],
        } satisfies PatientTimelineResponse,
      },
      {
        success: true,
        data: {
          id: "session-1",
          patientId: "patient-1",
          sessionDate: "2026-04-17T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "finalized",
          finalNote: "Full note",
          patientSummary: "Summary",
          priorPlan: "Plan",
          carryForwardContext: "Context",
          createdAt: "2026-04-17T12:40:00.000Z",
          updatedAt: "2026-04-17T12:40:00.000Z",
        } satisfies PriorSessionDetailResponse,
      },
    ]);

    const api = createPatientsApi("https://api.example.com", transport);

    const list = await api.listPatients("access-token", {
      query: "Ada",
      includeArchived: false,
      limit: 20,
      cursor: "patient-0",
    });
    const profile = await api.getPatientProfile("access-token", "patient-1");
    const timeline = await api.getPatientTimeline("access-token", "patient-1");
    const priorSession = await api.getPriorSession(
      "access-token",
      "patient-1",
      "session-1",
    );

    expect(calls).toHaveLength(4);
    expect(calls[0]?.input).toBe(
      "https://api.example.com/api/v1/patients?query=Ada&includeArchived=false&limit=20&cursor=patient-0",
    );
    expect(calls[0]?.init.headers.authorization).toBe("Bearer access-token");
    expect(list.items[0]?.fullName).toBe("Ada Lovelace");
    expect(profile.clinicId).toBeUndefined();
    expect(timeline.items[0]?.noteStatus).toBe("finalized");
    expect(priorSession.priorPlan).toBe("Plan");
  });

  it("keeps stable query keys and defaults list queries to active patients", async () => {
    expect(patientListQueryKey({ query: "Ada", includeArchived: false })).toEqual([
      "patients",
      "list",
      {
        query: "Ada",
        includeArchived: false,
      },
    ]);
    expect(patientProfileQueryKey("patient-1")).toEqual([
      "patients",
      "profile",
      "patient-1",
    ]);
    expect(patientTimelineQueryKey("patient-1")).toEqual([
      "patients",
      "timeline",
      "patient-1",
    ]);
    expect(priorSessionQueryKey("patient-1", "session-1")).toEqual([
      "patients",
      "prior-session",
      "patient-1",
      "session-1",
    ]);

    const listSpy = vi.spyOn(patientsApi, "listPatients").mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const hook = await renderHook(() =>
      usePatientList({
        query: " Ada ",
      }),
    );

    await hook.flush();

    expect(listSpy).toHaveBeenCalledWith("access-token", {
      query: "Ada",
      includeArchived: false,
    });

    await hook.cleanup();
  });

  it("invalidates patient caches after a successful create mutation", async () => {
    const createSpy = vi.spyOn(patientsApi, "createPatient").mockResolvedValue({
      id: "patient-1",
      clinicId: "clinic-1",
      fullName: "Ada Lovelace",
      dateOfBirth: null,
      sex: null,
      phone: null,
      email: null,
      addressLine: null,
      clinicalNotes: null,
      conditionTags: [],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    });

    const hook = await renderHook(() => useCreatePatient());
    const invalidateSpy = vi.spyOn(hook.queryClient, "invalidateQueries");

    await act(async () => {
      await hook.current.mutateAsync({
        fullName: "Ada Lovelace",
      });
    });

    expect(createSpy).toHaveBeenCalledWith("access-token", {
      fullName: "Ada Lovelace",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["patients", "list"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: patientProfileQueryKey("patient-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: patientTimelineQueryKey("patient-1"),
    });

    await hook.cleanup();
  });
});
