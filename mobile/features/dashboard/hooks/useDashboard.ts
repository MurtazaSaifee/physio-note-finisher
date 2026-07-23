import { useQuery } from "@tanstack/react-query";

import type { DashboardFilters } from "../../../../shared/contracts/dashboard";
import { useAuth } from "../../auth/providers/AuthProvider";
import { dashboardApi } from "../api/dashboardApi";

type DashboardFilterInput = DashboardFilters;
type DashboardQueryOptions = {
  enabled?: boolean;
};

function normalizeText(value?: string): string {
  return value?.trim() ?? "";
}

function normalizeFilters(filters: DashboardFilterInput = {}) {
  return {
    date: normalizeText(filters.date),
    timezoneOffset: normalizeText(filters.timezoneOffset) || undefined,
    patientId: normalizeText(filters.patientId),
    noteStatus: filters.noteStatus ?? "all",
    search: normalizeText(filters.search),
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 10,
  };
}

function toRequestFilters(filters: ReturnType<typeof normalizeFilters>): DashboardFilters {
  return {
    ...(filters.date ? { date: filters.date } : {}),
    ...(filters.timezoneOffset ? { timezoneOffset: filters.timezoneOffset } : {}),
    ...(filters.patientId ? { patientId: filters.patientId } : {}),
    ...(filters.noteStatus ? { noteStatus: filters.noteStatus } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function dashboardQueryKey(filters: DashboardFilterInput = {}) {
  const normalized = normalizeFilters(filters);

  return [
    "dashboard",
    "sessions",
    {
      date: normalized.date,
      patientId: normalized.patientId,
      noteStatus: normalized.noteStatus,
      search: normalized.search,
      page: normalized.page,
      pageSize: normalized.pageSize,
    },
  ] as const;
}

export function useDashboard(
  filters: DashboardFilterInput = {},
  options: DashboardQueryOptions = {},
) {
  const { status, runProtectedAction } = useAuth();
  const normalized = normalizeFilters(filters);

  return useQuery({
    queryKey: dashboardQueryKey(filters),
    enabled: status === "authenticated" && (options.enabled ?? true),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        dashboardApi.listDashboardSessions(accessToken, toRequestFilters(normalized)),
      ),
  });
}
