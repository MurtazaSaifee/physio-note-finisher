import { useMutation } from "@tanstack/react-query";

import type { SignupRequest } from "../../../../shared/contracts/auth";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { createAuthApi } from "../services/authApi";

export function useSignup() {
  const authApi = createAuthApi(resolveApiBaseUrl());

  return useMutation({
    mutationFn: (payload: SignupRequest) => authApi.signup(payload),
  });
}
