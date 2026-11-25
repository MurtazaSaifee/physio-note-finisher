import { useMutation } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import type { PasswordResetRequest } from "./settingsApi";
import { settingsApi } from "./settingsApi";

export function useResetPassword() {
  const { runProtectedAction } = useAuth();

  return useMutation({
    mutationFn: (input: PasswordResetRequest) =>
      runProtectedAction((accessToken) =>
        settingsApi.resetPassword(accessToken, input),
      ),
  });
}
