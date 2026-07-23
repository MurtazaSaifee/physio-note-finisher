import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  PatientSummaryGenerationResponse,
  PatientSummarySaveResponse,
} from "../../../../shared/contracts/voice";
import { useAuth } from "../../auth/providers/AuthProvider";
import { noteDetailQueryKey } from "../../notes/hooks/useNotes";
import { patientTimelineQueryKey } from "../../patients/hooks/usePatients";
import { requestJson } from "../../runtime/requestJson";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

type GeneratePatientSummaryInput = {
  patientId: string;
  sessionId: string;
};

type SavePatientSummaryInput = {
  patientId: string;
  sessionId: string;
  patientSummary: string;
};

async function postGeneratePatientSummary(
  accessToken: string,
  input: GeneratePatientSummaryInput,
): Promise<PatientSummaryGenerationResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/summary/generate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("Patient summary generation request failed");
  }

  return (payload as Record<string, unknown>).data as PatientSummaryGenerationResponse;
}

async function postSavePatientSummary(
  accessToken: string,
  input: SavePatientSummaryInput,
): Promise<PatientSummarySaveResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/summary/save`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("Patient summary save request failed");
  }

  return (payload as Record<string, unknown>).data as PatientSummarySaveResponse;
}

export function useGeneratePatientSummary() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: GeneratePatientSummaryInput) =>
      runProtectedAction((accessToken) => postGeneratePatientSummary(accessToken, input)),
    onSuccess: async (generatedSummary) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(generatedSummary.patientId, generatedSummary.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(generatedSummary.patientId),
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  return {
    ...mutation,
    generatePatientSummary: mutation.mutateAsync,
  };
}

export function useSavePatientSummary() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: SavePatientSummaryInput) =>
      runProtectedAction((accessToken) => postSavePatientSummary(accessToken, input)),
    onSuccess: async (savedSummary) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(savedSummary.patientId, savedSummary.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(savedSummary.patientId),
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  return {
    ...mutation,
    savePatientSummary: mutation.mutateAsync,
  };
}
