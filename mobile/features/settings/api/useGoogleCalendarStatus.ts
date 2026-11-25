import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { settingsApi } from "./settingsApi";

export const googleCalendarStatusQueryKey = [
  "settings",
  "google-calendar-status",
] as const;

export function useGoogleCalendarStatus() {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: googleCalendarStatusQueryKey,
    enabled: status === "authenticated",
    queryFn: () =>
      runProtectedAction((accessToken) =>
        settingsApi.getGoogleCalendarStatus(accessToken),
      ),
  });
}

export function useGoogleCalendarConnectUrl() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<string, Error, void>({
    mutationFn: () =>
      runProtectedAction((accessToken) =>
        settingsApi.getGoogleCalendarConnectUrl(accessToken),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: googleCalendarStatusQueryKey });
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      runProtectedAction((accessToken) =>
        settingsApi.disconnectGoogleCalendar(accessToken),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: googleCalendarStatusQueryKey });
    },
  });
}
