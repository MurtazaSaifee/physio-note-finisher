import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { voiceJobStatusQueryKey } from "./useVoiceJobs";

type DeleteRecordingInput = {
  jobId: string;
};

async function deleteRecording(
  accessToken: string,
  jobId: string,
): Promise<void> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/v1/voice/jobs/${jobId}/recordings`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Delete recording request failed");
  }
}

export function useDeleteRecording() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ jobId }: DeleteRecordingInput) =>
      runProtectedAction((accessToken) =>
        deleteRecording(accessToken, jobId),
      ),
    onSuccess: async (_, { jobId }) => {
      await queryClient.invalidateQueries({
        queryKey: voiceJobStatusQueryKey(jobId),
      });
    },
  });

  return {
    ...mutation,
    deleteRecording: mutation.mutateAsync,
  };
}
