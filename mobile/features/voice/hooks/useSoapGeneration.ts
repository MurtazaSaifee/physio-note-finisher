import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { SoapSectionKey } from "../../../../shared/contracts/notes";
import type {
  SoapGenerationResponse,
  SoapSectionRegenerationResponse,
} from "../../../../shared/contracts/voice";
import { useAuth } from "../../auth/providers/AuthProvider";
import { noteDetailQueryKey } from "../../notes/hooks/useNotes";
import { requestJson } from "../../runtime/requestJson";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

type GenerateSoapDraftInput = {
  patientId: string;
  sessionId: string;
  transcriptText: string;
};

type RegenerateSoapSectionInput = {
  patientId: string;
  sessionId: string;
  transcriptText: string;
  section: SoapSectionKey;
  hint?: string;
};

async function postGenerateSoapDraft(
  accessToken: string,
  input: GenerateSoapDraftInput,
): Promise<SoapGenerationResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/soap/generate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("SOAP generation request failed");
  }

  return (payload as Record<string, unknown>).data as SoapGenerationResponse;
}

async function postRegenerateSoapSection(
  accessToken: string,
  input: RegenerateSoapSectionInput,
): Promise<SoapSectionRegenerationResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/soap/regenerate-section`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("SOAP section regeneration request failed");
  }

  return (payload as Record<string, unknown>).data as SoapSectionRegenerationResponse;
}

export function useGenerateSoapDraft() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: GenerateSoapDraftInput) =>
      runProtectedAction((accessToken) => postGenerateSoapDraft(accessToken, input)),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: noteDetailQueryKey(result.patientId, result.sessionId),
      });
    },
  });

  return {
    ...mutation,
    generateSoapDraft: mutation.mutateAsync,
  };
}

export function useRegenerateSoapSection() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: RegenerateSoapSectionInput) =>
      runProtectedAction((accessToken) => postRegenerateSoapSection(accessToken, input)),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: noteDetailQueryKey(result.patientId, result.sessionId),
      });
    },
  });

  return {
    ...mutation,
    regenerateSoapSection: mutation.mutateAsync,
  };
}
