import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { profileQueryKey } from "./useGetProfile";
import { settingsApi } from "./settingsApi";
import type { UpdateRetentionPolicyRequest } from "../../../../shared/contracts/users";

export function useUpdateRetentionPolicy() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRetentionPolicyRequest) =>
      runProtectedAction((accessToken) =>
        settingsApi.updateRetentionPolicy(accessToken, input),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}
