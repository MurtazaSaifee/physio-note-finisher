import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  UpdateNotificationPreferenceRequest,
} from "../../../../shared/contracts/appointments";
import { useAuth } from "../../auth/providers/AuthProvider";
import { settingsApi } from "./settingsApi";

export const notificationPreferencesQueryKey = [
  "settings",
  "notification-preferences",
] as const;

export function useNotificationPreferences() {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: notificationPreferencesQueryKey,
    enabled: status === "authenticated",
    queryFn: () =>
      runProtectedAction((accessToken) =>
        settingsApi.getNotificationPreferences(accessToken),
      ),
  });
}

export function useUpdateNotificationPreferences() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateNotificationPreferenceRequest) =>
      runProtectedAction((accessToken) =>
        settingsApi.updateNotificationPreferences(accessToken, input),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notificationPreferencesQueryKey,
      });
    },
  });
}
