import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreateAppointmentRequest,
  StartSessionFromAppointmentRequest,
  UpdateAppointmentRequest,
} from "../../../../shared/contracts/appointments";
import { useAuth } from "../../auth/providers/AuthProvider";
import { appointmentsApi } from "../api/appointmentsApi";
import { saveQueuedChange } from "../../offline/storage/queueStore";

type QueryOptions = {
  enabled?: boolean;
};

export function appointmentDayQueryKey(date?: string) {
  return ["appointments", "day", date ?? "today"] as const;
}

export function appointmentDetailQueryKey(appointmentId: string) {
  return ["appointments", "detail", appointmentId] as const;
}

export function appointmentHistoryQueryKey(limit?: number) {
  return ["appointments", "history", limit ?? 50] as const;
}

function shouldEnableAppointmentQuery(
  status: ReturnType<typeof useAuth>["status"],
  appointmentId?: string,
): boolean {
  return status === "authenticated" && Boolean(appointmentId?.trim());
}

export function useAppointmentDay(
  date?: string,
  timezoneOffset?: string,
  options: QueryOptions = {},
) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: appointmentDayQueryKey(date),
    enabled: status === "authenticated" && (options.enabled ?? true),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        appointmentsApi.listAppointments(accessToken, date, timezoneOffset),
      ),
  });
}

export function useAppointmentDetail(appointmentId?: string) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: appointmentDetailQueryKey(appointmentId ?? ""),
    enabled: shouldEnableAppointmentQuery(status, appointmentId),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        appointmentsApi.getAppointmentDetail(accessToken, appointmentId ?? ""),
      ),
  });
}

export function useAppointmentHistory(limit?: number) {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: appointmentHistoryQueryKey(limit),
    enabled: status === "authenticated",
    queryFn: () =>
      runProtectedAction((accessToken) =>
        appointmentsApi.getAppointmentHistory(accessToken, limit),
      ),
  });
}

export function useCreateAppointment() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAppointmentRequest) =>
      runProtectedAction((accessToken) =>
        appointmentsApi.createAppointment(accessToken, input),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", "history"] }),
      ]);
    },
  });
}

export function useUpdateAppointment() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      input,
    }: {
      appointmentId: string;
      input: UpdateAppointmentRequest;
    }) =>
      runProtectedAction((accessToken) =>
        appointmentsApi.updateAppointment(accessToken, appointmentId, input),
      ).catch((error: unknown) => {
        const isNetworkError =
          error instanceof Error &&
          (/Network/i.test(error.message) ||
            /fetch/i.test(error.message) ||
            /offline/i.test(error.message));
        if (isNetworkError) {
          saveQueuedChange({
            id: crypto.randomUUID(),
            type: "appointmentEdit",
            appointmentId,
            updates: input,
            timestamp: Date.now(),
          });
        }
        throw error;
      }),
    onMutate: async ({ appointmentId, input }) => {
      await queryClient.cancelQueries({
        queryKey: appointmentDetailQueryKey(appointmentId),
      });
      const previousDetail = queryClient.getQueryData(
        appointmentDetailQueryKey(appointmentId),
      );
      queryClient.setQueryData(
        appointmentDetailQueryKey(appointmentId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          return { ...(old as Record<string, unknown>), ...input, syncStatus: "pending" };
        },
      );
      return { previousDetail };
    },
    onError: (err, { appointmentId }, context) => {
      const isNetworkError =
        err instanceof Error &&
        (/Network/i.test(err.message) ||
          /fetch/i.test(err.message) ||
          /offline/i.test(err.message));
      if (!isNetworkError && context?.previousDetail) {
        queryClient.setQueryData(
          appointmentDetailQueryKey(appointmentId),
          context.previousDetail,
        );
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", "history"] }),
      ]);
    },
  });
}

export function useCancelAppointment() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: string) =>
      runProtectedAction((accessToken) =>
        appointmentsApi.cancelAppointment(accessToken, appointmentId),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", "history"] }),
      ]);
    },
  });
}

export function useStartSessionFromAppointment() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      input,
    }: {
      appointmentId: string;
      input: StartSessionFromAppointmentRequest;
    }) =>
      runProtectedAction((accessToken) =>
        appointmentsApi.startSessionFromAppointment(accessToken, appointmentId, input),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", "history"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}
