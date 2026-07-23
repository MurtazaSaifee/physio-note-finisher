import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { VoicePipelineStageState } from "../../../../shared/contracts/voice";
import { useAuth } from "../../auth/providers/AuthProvider";
import { requestJson } from "../../runtime/requestJson";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

type VoiceJobStatus = "queued" | "processing" | "succeeded" | "failed";

type VoiceJobResponse = {
  jobId: string;
  status: VoiceJobStatus;
  attempt: number;
  stageState?: VoicePipelineStageState;
  errorMessage?: string | null;
};

type RetryVoiceJobInput = {
  jobId: string;
};

type VoiceJobHookResult = {
  data: VoiceJobResponse | undefined;
  error: Error | null;
  fetchStatus: "fetching" | "paused" | "idle";
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  refetchInterval: number | false;
  refetch: ReturnType<typeof useQuery<VoiceJobResponse>>["refetch"];
};

const POLL_INTERVAL_MS = 1500;

function isTerminalStatus(status: VoiceJobStatus | undefined): boolean {
  return status === "succeeded" || status === "failed";
}

function normalizeId(value?: string): string {
  return value?.trim() ?? "";
}

export function voiceJobStatusQueryKey(jobId: string) {
  return ["voice", "job", jobId] as const;
}

async function readVoiceJobStatus(
  accessToken: string,
  clinicId: string,
  jobId: string,
): Promise<VoiceJobResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/jobs/${jobId}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-clinic-id": clinicId,
    },
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("Voice job status request failed");
  }

  return (payload as Record<string, unknown>).data as VoiceJobResponse;
}

async function postRetryVoiceJob(
  accessToken: string,
  clinicId: string,
  jobId: string,
): Promise<VoiceJobResponse> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/voice/jobs/${jobId}/retry`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-clinic-id": clinicId,
    },
    body: JSON.stringify({}),
  });

  const payload = await requestJson<unknown>(response);
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true || !(payload as Record<string, unknown>).data) {
    throw new Error("Voice job retry request failed");
  }

  return (payload as Record<string, unknown>).data as VoiceJobResponse;
}

export function useVoiceJobStatus(clinicId: string, jobId?: string): VoiceJobHookResult {
  const { status, runProtectedAction } = useAuth();
  const normalizedClinicId = normalizeId(clinicId);
  const normalizedJobId = normalizeId(jobId);

  const {
    data,
    error,
    fetchStatus,
    isError,
    isFetching,
    isLoading,
    isSuccess,
    refetch,
  } = useQuery({
    queryKey: voiceJobStatusQueryKey(normalizedJobId),
    enabled:
      status === "authenticated" &&
      normalizedClinicId.length > 0 &&
      normalizedJobId.length > 0,
    queryFn: () =>
      runProtectedAction((accessToken) =>
        readVoiceJobStatus(accessToken, normalizedClinicId, normalizedJobId),
      ),
    refetchInterval: (q) =>
      isTerminalStatus(q.state.data?.status) ? false : POLL_INTERVAL_MS,
  });

  const refetchInterval = isTerminalStatus(data?.status)
    ? false
    : POLL_INTERVAL_MS;

  return {
    data,
    error,
    fetchStatus,
    isError,
    isFetching,
    isLoading,
    isSuccess,
    refetch,
    refetchInterval,
  };
}

export function useRetryVoiceJob(clinicId: string) {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const normalizedClinicId = normalizeId(clinicId);

  const mutation = useMutation({
    mutationFn: ({ jobId }: RetryVoiceJobInput) =>
      runProtectedAction((accessToken) =>
        postRetryVoiceJob(accessToken, normalizedClinicId, jobId),
      ),
    onSuccess: async (retriedJob) => {
      await queryClient.invalidateQueries({
        queryKey: voiceJobStatusQueryKey(retriedJob.jobId),
      });
      await queryClient.invalidateQueries({
        queryKey: ["voice", "transcript", normalizedClinicId, retriedJob.jobId],
      });
    },
  });

  return {
    ...mutation,
    retryVoiceJob: mutation.mutateAsync,
  };
}
