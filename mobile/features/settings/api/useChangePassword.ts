import { useMutation } from "@tanstack/react-query";

import type { ChangePasswordRequest } from "../../../../shared/contracts/auth";
import { useAuth } from "../../auth/providers/AuthProvider";
import { settingsApi } from "./settingsApi";

export function useChangePassword() {
  const { runProtectedAction } = useAuth();

  return useMutation({
    mutationFn: (input: ChangePasswordRequest) =>
      runProtectedAction((accessToken) =>
        settingsApi.changePassword(accessToken, input),
      ),
  });
}
