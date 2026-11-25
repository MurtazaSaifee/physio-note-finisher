import { useMutation } from "@tanstack/react-query";

import type {
  OtpSendRequest,
  OtpVerifyRequest,
} from "../../../../shared/contracts/auth";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { createAuthApi } from "../services/authApi";

export function useVerifyOtp() {
  const authApi = createAuthApi(resolveApiBaseUrl());

  return useMutation({
    mutationFn: (payload: OtpVerifyRequest) => authApi.verifyOtp(payload),
  });
}

export function useSendOtp() {
  const authApi = createAuthApi(resolveApiBaseUrl());

  return useMutation({
    mutationFn: (payload: OtpSendRequest) => authApi.sendOtp(payload),
  });
}
