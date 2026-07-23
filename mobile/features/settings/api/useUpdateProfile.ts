import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ProfileUpdateRequest } from "../../../../shared/contracts/auth";
import { useAuth } from "../../auth/providers/AuthProvider";
import { profileQueryKey } from "./useGetProfile";
import { settingsApi } from "./settingsApi";

export function useUpdateProfile() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProfileUpdateRequest) =>
      runProtectedAction((accessToken) =>
        settingsApi.updateProfile(accessToken, input),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}
