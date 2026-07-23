import { useQuery } from "@tanstack/react-query";

import type { VoiceTranscriptResponse } from "../../../../shared/contracts/voice";
import { useAuth } from "../../auth/providers/AuthProvider";
import { requestJson } from "../../runtime/requestJson";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

async function readTranscript(
  accessToken: string,
  clinicId: string,
  jobId: string,
): Promise<VoiceTranscriptResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/jobs/${jobId}/transcript`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-clinic-id": clinicId,
    },
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("Transcript request failed");
  }

  return (payload as Record<string, unknown>).data as VoiceTranscriptResponse;
}

export function useTranscriptReview(clinicId: string, jobId: string) {
  const { status, runProtectedAction } = useAuth();

  const { data, isFetching, isLoading, isSuccess, refetch } = useQuery({
    queryKey: ["voice", "transcript", clinicId, jobId],
    enabled:
      status === "authenticated" && clinicId.trim().length > 0 && jobId.trim().length > 0,
    queryFn: () =>
      runProtectedAction((accessToken) =>
        readTranscript(accessToken, clinicId.trim(), jobId.trim()),
      ),
  });

  return {
    transcript: data ?? null,
    isLoading: isLoading || (isFetching && !data),
    isReady: isSuccess,
    audioUrl: data?.audioUrl ?? null,
    refetch,
  };
}
