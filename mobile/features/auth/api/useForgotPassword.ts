import { useMutation } from "@tanstack/react-query";
import type { ForgotPasswordResetRequest } from "../../../../shared/contracts/auth";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { createAuthApi } from "../services/authApi";

export function useForgotPassword() {
  const authApi = createAuthApi(resolveApiBaseUrl());

  const initiate = useMutation({
    mutationFn: (email: string) => authApi.initiateForgotPassword({ email }),
  });

  const reset = useMutation({
    mutationFn: (payload: ForgotPasswordResetRequest) => authApi.resetForgotPassword(payload),
  });

  return { initiate, reset };
}
