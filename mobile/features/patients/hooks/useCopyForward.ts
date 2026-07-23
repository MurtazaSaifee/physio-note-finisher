import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { useAuth } from "../../auth/providers/AuthProvider";
import { noteDetailQueryKey } from "../../notes/hooks/useNotes";
import { patientsApi } from "../api/patientsApi";
import { patientTimelineQueryKey, priorSessionQueryKey } from "./usePatients";

const copyForwardSectionSchema = z.enum(["priorPlan", "carryForwardContext"]);
const copyForwardSelectionSchema = z.object({
  selectedSections: z
    .array(copyForwardSectionSchema)
    .min(1, "Select at least one section")
    .refine((sections) => new Set(sections).size === sections.length, {
      message: "Duplicate sections are not allowed",
    }),
});

type CopyForwardMutationInput = {
  patientId: string;
  sessionId: string;
  selectedSections: Array<"priorPlan" | "carryForwardContext">;
};

export function useCopyForward() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: CopyForwardMutationInput) => {
      const parsed = copyForwardSelectionSchema.safeParse({
        selectedSections: input.selectedSections,
      });

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? "Select at least one section",
        );
      }

      return runProtectedAction((accessToken) =>
        patientsApi.copyForwardFromSession(
          accessToken,
          input.patientId,
          input.sessionId,
          { selectedSections: parsed.data.selectedSections },
        ),
      );
    },
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: priorSessionQueryKey(input.patientId, input.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(input.patientId),
        }),
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(input.patientId, input.sessionId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    copyForward: mutation.mutateAsync,
  };
}
