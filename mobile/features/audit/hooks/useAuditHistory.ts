import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { auditApi } from "../api/auditApi";

export function auditHistoryQueryKey(sessionId: string) {
  return ["audit", "history", sessionId.trim()] as const;
}

export function useAuditHistory(sessionId: string | undefined) {
  const { status, runProtectedAction } = useAuth();
  const normalizedSessionId = sessionId?.trim() ?? "";

  return useQuery({
    queryKey: auditHistoryQueryKey(normalizedSessionId),
    enabled: status === "authenticated" && normalizedSessionId.length > 0,
    queryFn: () =>
      runProtectedAction((accessToken) =>
        auditApi.getAuditHistory(accessToken, normalizedSessionId),
      ),
  });
}
