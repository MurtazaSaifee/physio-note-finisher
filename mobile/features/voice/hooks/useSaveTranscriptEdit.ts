import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

type SaveTranscriptEditInput = {
  jobId: string;
  clinicId: string;
  transcriptText: string;
};

async function patchTranscriptText(
  accessToken: string,
  input: SaveTranscriptEditInput,
): Promise<void> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/v1/voice/jobs/${input.jobId}/transcript`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-clinic-id": input.clinicId,
      },
      body: JSON.stringify({ transcriptText: input.transcriptText }),
    },
  );

  if (!response.ok) {
    throw new Error("Save transcript request failed");
  }
}

export function useSaveTranscriptEdit() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: SaveTranscriptEditInput) =>
      runProtectedAction((accessToken) =>
        patchTranscriptText(accessToken, input),
      ),
    onSuccess: async (_, { clinicId, jobId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["voice", "transcript", clinicId, jobId],
      });
    },
  });

  return {
    ...mutation,
    saveTranscriptEdit: mutation.mutateAsync,
  };
}
