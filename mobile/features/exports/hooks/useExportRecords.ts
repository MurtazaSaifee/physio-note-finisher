import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateExportRecordRequest } from "../../../../shared/contracts/exports";
import { useAuth } from "../../auth/providers/AuthProvider";
import { exportsApi } from "../api/exportsApi";

type RecordExportInput = {
  patientId: string;
  sessionId: string;
  input: CreateExportRecordRequest;
};

export function exportRecordsQueryKey(patientId: string) {
  return ["exports", "records", patientId.trim()] as const;
}

export function useExportRecords(patientId: string | undefined, clinicId: string | undefined) {
  const { status, runProtectedAction } = useAuth();
  const normalizedPatientId = patientId?.trim() ?? "";
  const normalizedClinicId = clinicId?.trim() ?? "";

  return useQuery({
    queryKey: exportRecordsQueryKey(normalizedPatientId),
    enabled: status === "authenticated" && normalizedPatientId.length > 0 && normalizedClinicId.length > 0,
    queryFn: () =>
      runProtectedAction((accessToken) =>
        exportsApi.listPatientExportRecords(accessToken, normalizedClinicId, normalizedPatientId),
      ),
  });
}

export function useCreateExportRecord(clinicId: string | undefined) {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const normalizedClinicId = clinicId?.trim() ?? "";

  const mutation = useMutation({
    mutationFn: ({ patientId, sessionId, input }: RecordExportInput) =>
      runProtectedAction((accessToken) =>
        exportsApi.recordExportAction(accessToken, normalizedClinicId, patientId, sessionId, input),
      ),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: exportRecordsQueryKey(variables.patientId),
      });
    },
  });

  return {
    ...mutation,
    createExportRecord: mutation.mutateAsync,
  };
}
