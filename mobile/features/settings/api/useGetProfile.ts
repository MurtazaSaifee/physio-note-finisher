import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/providers/AuthProvider";
import { settingsApi } from "./settingsApi";

export const profileQueryKey = ["settings", "profile"] as const;

export function useGetProfile() {
  const { status, runProtectedAction } = useAuth();

  return useQuery({
    queryKey: profileQueryKey,
    enabled: status === "authenticated",
    queryFn: () =>
      runProtectedAction((accessToken) => settingsApi.getProfile(accessToken)),
  });
}
