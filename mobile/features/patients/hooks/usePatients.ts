import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreatePatientRequest,
  UpdatePatientRequest,
} from "../../../../shared/contracts/patients";
import { useAuth } from "../../auth/providers/AuthProvider";
import { patientsApi } from "../api/patientsApi";

type PatientListArgs = {
  query?: string;
  includeArchived?: boolean;
};
type QueryOptions = {
  enabled?: boolean;
};

type UpdatePatientMutationInput = {
  patientId: string;
  input: UpdatePatientRequest;
};

type ArchivePatientMutationInput = {
  patientId: string;
  archived: boolean;
};

function normalizeQuery(query?: string): string {
  return query?.trim() ?? "";
}

export function patientListQueryKey(args: PatientListArgs = {}) {
  return [
    "patients",
    "list",
    {
      query: normalizeQuery(args.query),
      includeArchived: args.includeArchived ?? false,
    },
  ] as const;
}

export function patientProfileQueryKey(patientId: string) {
  return ["patients", "profile", patientId] as const;
}

export function patientTimelineQueryKey(patientId: string) {
  return ["patients", "timeline", patientId] as const;
}

export function priorSessionQueryKey(patientId: string, sessionId: string) {
  return ["patients", "prior-session", patientId, sessionId] as const;
}

function shouldEnablePatientQuery(
  status: ReturnType<typeof useAuth>["status"],
  patientId?: string,
): boolean {
  return status === "authenticated" && Boolean(patientId?.trim());
}

export function usePatientList(
  args: PatientListArgs = {},
  options: QueryOptions = {},
) {
  const { status, runProtectedAction } = useAuth();
  const includeArchived = args.includeArchived ?? false;
  const query = normalizeQuery(args.query);

  return useQuery({
    queryKey: patientListQueryKey({ query, includeArchived }),
    enabled: status === "authenticated" && (options.enabled ?? true),
    queryFn: () =>
      runProtectedAction((accessToken) => {
        const requestInput = {
          includeArchived,
          ...(query.length > 0 ? { query } : {}),
        };

        return patientsApi.listPatients(accessToken, requestInput);
      }),
  });
}

export function usePatientProfile(patientId?: string) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: patientProfileQueryKey(patientId ?? ""),
    enabled: shouldEnablePatientQuery(status, patientId),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        patientsApi.getPatientProfile(accessToken, patientId ?? ""),
      ),
  });
}

export function usePatientTimeline(patientId?: string) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: patientTimelineQueryKey(patientId ?? ""),
    enabled: shouldEnablePatientQuery(status, patientId),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        patientsApi.getPatientTimeline(accessToken, patientId ?? ""),
      ),
  });
}

export function usePriorSession(patientId?: string, sessionId?: string) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: priorSessionQueryKey(patientId ?? "", sessionId ?? ""),
    enabled:
      status === "authenticated" &&
      Boolean(patientId?.trim()) &&
      Boolean(sessionId?.trim()),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        patientsApi.getPriorSession(accessToken, patientId ?? "", sessionId ?? ""),
      ),
  });
}

export function useCreatePatient() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePatientRequest) =>
      runProtectedAction((accessToken) =>
        patientsApi.createPatient(accessToken, input),
      ),
    onSuccess: async (createdPatient) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients", "list"] }),
        queryClient.invalidateQueries({ queryKey: patientProfileQueryKey(createdPatient.id) }),
        queryClient.invalidateQueries({ queryKey: patientTimelineQueryKey(createdPatient.id) }),
      ]);
    },
  });
}

export function useUpdatePatient() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, input }: UpdatePatientMutationInput) =>
      runProtectedAction((accessToken) =>
        patientsApi.updatePatient(accessToken, patientId, input),
      ),
    onSuccess: async (updatedPatient) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients", "list"] }),
        queryClient.invalidateQueries({ queryKey: patientProfileQueryKey(updatedPatient.id) }),
        queryClient.invalidateQueries({ queryKey: patientTimelineQueryKey(updatedPatient.id) }),
      ]);
    },
  });
}

export function useArchivePatient() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, archived }: ArchivePatientMutationInput) =>
      runProtectedAction((accessToken) =>
        patientsApi.archivePatient(accessToken, patientId, archived),
      ),
    onSuccess: async (updatedPatient) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients", "list"] }),
        queryClient.invalidateQueries({ queryKey: patientProfileQueryKey(updatedPatient.id) }),
        queryClient.invalidateQueries({ queryKey: patientTimelineQueryKey(updatedPatient.id) }),
      ]);
    },
  });
}
